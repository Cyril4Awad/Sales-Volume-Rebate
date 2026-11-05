import { useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";

import { ModalComp } from "../../../ReusableComponents";
import {
    fmtRebateAmount,
    formatMetricAmount,
    mapConditionRow,
    mapTierRow,
} from "../utils/computationDisplayUtils";
import {
    alwaysAppliedMonthlyRebate,
    amountInCurrency,
    buildMonthEndWindows,
    firstMetMonth,
    formatRebateRate,
    hasGrowthCondition,
    isAlwaysAppliedTarget,
    monthlyGrowthSlice,
    monthlySalesSlice,
    windowLocalKey,
} from "../utils/salesBreakdownUtils";
import { hasValidTargetDates, isRangeTarget, resolveTargetSalesKey } from "../../../utils/computationEngine";
import { exportSalesBreakdownToExcel } from "../../../utils/exportComputationToExcel";
import {
    monthKeyOverlapsPaidPeriod,
    paymentsWithPeriodForTarget,
} from "../../../utils/settlementPaymentLogic";

import "./SalesBreakdownModal.css";
import "../VRComputationWorkspace.css";

const EMPTY_SALES = {
    salesAmounts: {},
    salesAmount: 0,
    salesAmountBase: 0,
    previousYearSalesAmounts: {},
    growthPercentageUSD: 0,
};

export default function SalesBreakdownModal({
    open,
    onClose,
    target,
    evaluationResult,
    sales,
    settlementDisplay,
    fetchSalesForDraftWindows,
    allClientIds,
    contractCurrency,
    asOf,
    contractReference = "",
    payments = [],
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [salesByWindowKey, setSalesByWindowKey] = useState({});
    const [showPreviousYear, setShowPreviousYear] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(null);
    const lastFetchKeyRef = useRef("");
    const targetRef = useRef(target);
    const clientIdsRef = useRef(allClientIds);
    const windowsRef = useRef([]);
    targetRef.current = target;
    clientIdsRef.current = allClientIds;

    const currency = contractCurrency ?? "USD";
    const asOfDateKey = asOf
        ? moment(asOf).format("YYYY-MM-DD")
        : moment().format("YYYY-MM-DD");
    const targetFromKey = target
        ? moment(target.fromDate ?? target.FromDate).format("YYYY-MM-DD")
        : "";
    const targetToKey = target
        ? moment(target.toDate ?? target.ToDate).format("YYYY-MM-DD")
        : "";
    const targetSalesKey = target ? resolveTargetSalesKey(target) : "";
    const clientIdsKey = (allClientIds ?? []).join(",");

    const alwaysApplied = isAlwaysAppliedTarget(target, evaluationResult);
    const rangeTarget = isRangeTarget(target);
    const conditioned = !alwaysApplied && !rangeTarget;
    const rebateType = String(target?.rebateValueType ?? "F").trim().toUpperCase();
    const showRebateColumn = alwaysApplied && rebateType === "P";
    const growthEnabled = hasGrowthCondition(target);
    const datesInvalid = !hasValidTargetDates(target);

    const windows = useMemo(() => {
        if (!targetFromKey || !targetToKey || targetFromKey === "Invalid date" || targetToKey === "Invalid date") {
            return [];
        }
        return buildMonthEndWindows(targetFromKey, targetToKey, asOfDateKey);
    }, [targetFromKey, targetToKey, asOfDateKey]);
    windowsRef.current = windows;

    useEffect(() => {
        if (!open) {
            lastFetchKeyRef.current = "";
            return undefined;
        }
        const currentTarget = targetRef.current;
        const currentClientIds = clientIdsRef.current;
        const currentWindows = windowsRef.current;
        if (!currentTarget || !clientIdsKey || !currentWindows.length || !fetchSalesForDraftWindows) {
            return undefined;
        }

        const fetchKey = `${targetSalesKey}|${clientIdsKey}|${asOfDateKey}|${targetFromKey}|${targetToKey}`;
        if (lastFetchKeyRef.current === fetchKey) return undefined;
        lastFetchKeyRef.current = fetchKey;

        let cancelled = false;
        let settled = false;
        setLoading(true);
        setError(null);
        fetchSalesForDraftWindows(currentTarget, currentClientIds, currentWindows)
            .then((mapped) => {
                if (!cancelled) setSalesByWindowKey(mapped ?? {});
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || "Failed to load monthly sales.");
            })
            .finally(() => {
                settled = true;
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
            if (!settled) lastFetchKeyRef.current = "";
        };
    }, [
        open,
        targetSalesKey,
        clientIdsKey,
        asOfDateKey,
        targetFromKey,
        targetToKey,
        fetchSalesForDraftWindows,
    ]);

    useEffect(() => {
        if (open) return;
        setSalesByWindowKey({});
        setError(null);
        setShowPreviousYear(false);
        setLoading(false);
        setExporting(false);
        setExportError(null);
    }, [open]);

    const monthlyRows = useMemo(() => {
        let prevSales = EMPTY_SALES;
        return windows.map((window, index) => {
            const key = windowLocalKey(target, window);
            const cumSales = salesByWindowKey[key] ?? EMPTY_SALES;
            const salesAmount = monthlySalesSlice(cumSales, prevSales, currency);
            const rebate = showRebateColumn
                ? alwaysAppliedMonthlyRebate(target, cumSales, prevSales, currency)
                : null;
            const growth = showPreviousYear
                ? monthlyGrowthSlice(cumSales, prevSales, currency)
                : null;
            const row = {
                _index: index,
                monthKey: window.key,
                monthLabel: window.label,
                isPartial: !!window.isPartial,
                salesAmount,
                rebate,
                previousYearSales: growth?.previousYearSales ?? null,
                growthPct: growth?.growthPct ?? null,
                toDate: window.toDate,
                sales: cumSales,
            };
            prevSales = cumSales;
            return row;
        });
    }, [windows, salesByWindowKey, target, currency, showRebateColumn, showPreviousYear]);

    const firstMetIndex = useMemo(() => {
        if (alwaysApplied) return -1;
        const dtos = monthlyRows.map((row) => ({
            toDate: row.toDate,
            sales: row.sales,
        }));
        const index = firstMetMonth(target, dtos, currency);
        return Number.isInteger(index) && index >= 0 ? index : -1;
    }, [alwaysApplied, monthlyRows, target, currency]);

    const liveSales = sales ?? EMPTY_SALES;
    const cumulativeSales = amountInCurrency(liveSales, currency);
    const rebateAmount = settlementDisplay?.currentTotal ?? evaluationResult?.rebateAmount ?? 0;
    const owedAmount = settlementDisplay?.owedAmount ?? 0;
    const totalGrowth = liveSales.growthPercentageUSD;
    const rebatePositive = Number(rebateAmount) > 0;
    const highlightMonthIndex = rebatePositive && firstMetIndex >= 0 ? firstMetIndex : -1;
    const targetPeriodPayments = useMemo(
        () => paymentsWithPeriodForTarget(payments, target?.targetId ?? target?.targetID ?? target?.TargetID),
        [payments, target]
    );
    const showNoOwedFootnote = (rangeTarget || conditioned) && !loading && !error && highlightMonthIndex < 0;

    const rangeOverride = !!(target?.rangeOverride ?? target?.RangeOverride);
    const rangeTierRows = rangeTarget
        ? (evaluationResult?.tierResults || []).map((tr, idx) =>
            mapTierRow(
                tr,
                idx,
                evaluationResult?.matchedTier,
                liveSales,
                target,
                rangeOverride,
                currency,
                datesInvalid
            )
        )
        : [];

    const rebateLabel = alwaysApplied ? "Cumulative rebate" : "Rebate amount";
    const rebateRateLabel = !rangeTarget ? formatRebateRate(target, currency) : null;
    const targetName = evaluationResult?.targetName ?? target?.targetName ?? "Target";
    const exportMonthlyRows = useMemo(() => {
        const lastIdx = monthlyRows.length - 1;
        const lump = Number(rebateAmount) || 0;
        return monthlyRows.map((row) => {
            let rebateForExport = 0;
            if (showRebateColumn) rebateForExport = Number(row.rebate) || 0;
            else if (alwaysApplied) rebateForExport = row._index === lastIdx ? lump : 0;
            else if (highlightMonthIndex >= 0 && row._index === highlightMonthIndex) rebateForExport = lump;
            return {
                monthLabel: row.monthLabel,
                salesAmount: row.salesAmount,
                rebateAmount: rebateForExport,
                rebateRate: rebateRateLabel || "",
            };
        });
    }, [
        monthlyRows,
        showRebateColumn,
        alwaysApplied,
        rebateAmount,
        highlightMonthIndex,
        rebateRateLabel,
    ]);

    const handleExportExcel = async () => {
        setExporting(true);
        setExportError(null);
        try {
            await exportSalesBreakdownToExcel({
                contractReference,
                targetName,
                currency,
                monthlyRows: exportMonthlyRows,
            });
        } catch (err) {
            setExportError(err?.message || "Export failed.");
        } finally {
            setExporting(false);
        }
    };
    const growthPositive = Number(totalGrowth ?? 0) >= 0;
    const growthValueLabel = `${Number(totalGrowth ?? 0).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })} %`;

    const modalBody = (
        <div className="cvr-computation-target-body sales-breakdown-body">
            <div className="breakdown-export-bar">
                <button
                    type="button"
                    //className="btn btn-sm btn-outline-primary"
                    className="plan-editor-toolbar-btn"

                    disabled={exporting || loading}
                    onClick={handleExportExcel}
                >
                    {exporting && (
                        <span className="spinner-border spinner-border-sm me-1" role="status" />
                    )}
                    <i className="fa fa-file-excel-o" />
                    <span>Excel</span>
                </button>
            </div>
            {exportError && <div className="text-danger small mb-2">{exportError}</div>}
            <div className="sales-breakdown-summary">
                <div className="sales-breakdown-summary-tile">
                    <div className="sales-breakdown-tile-label text-muted">
                        <i className="fa fa-bar-chart" aria-hidden="true" />
                        Cumulative Sales
                    </div>
                    <div className="sales-breakdown-tile-value">{formatMetricAmount(cumulativeSales, currency)} {currency}</div>
                </div>
                <div className="sales-breakdown-summary-tile">
                    <div className="sales-breakdown-tile-label text-muted">
                        <i className="fa fa-percent" aria-hidden="true" />
                        {rebateLabel}
                    </div>
                    <div className="sales-breakdown-tile-value">{fmtRebateAmount(rebateAmount, currency)} {currency}</div>
                </div>
                <div className="sales-breakdown-summary-tile">
                    <div className="sales-breakdown-tile-label text-muted">
                        <i className="fa fa-money" aria-hidden="true" />
                        Currently Owed
                    </div>
                    <div className="sales-breakdown-tile-value">{fmtRebateAmount(owedAmount, currency)} {currency}</div>
                </div>
                {rebateRateLabel && (
                    <div className="sales-breakdown-summary-tile">
                        <div className="sales-breakdown-tile-label text-muted">
                            <i className="fa fa-percent" aria-hidden="true" />
                            Rebate Rate
                        </div>
                        <div className="sales-breakdown-tile-value">{rebateRateLabel}</div>
                    </div>
                )}
                {growthEnabled && (
                    <div className={`sales-breakdown-summary-tile ${growthPositive ? "bg-success-subtle" : "bg-danger-subtle"}`}>
                        <div className={`sales-breakdown-tile-label ${growthPositive ? "text-success" : "text-danger"}`}>
                            <i className={`fa ${growthPositive ? "fa-arrow-up" : "fa-arrow-down"}`} aria-hidden="true" />
                            Total Growth
                        </div>
                        <div className={`sales-breakdown-tile-value ${growthPositive ? "text-success" : "text-danger"}`}>
                            {growthValueLabel}
                        </div>
                    </div>
                )}
            </div>

            {rangeTarget && rangeTierRows.length > 0 && (
                <div className="sales-breakdown-range-list mb-4">
                    {rangeTierRows.map((row, idx) => {
                        const exceeded = row.exceeded === "Yes";
                        const matched = !!row._isMatched;
                        return (
                            <div
                                key={`tier-${idx}`}
                                className={[
                                    "sales-breakdown-tier-card",
                                    exceeded ? "border-success" : "",
                                    matched ? "bg-success-subtle sales-breakdown-tier-card--matched" : "",
                                ].filter(Boolean).join(" ")}
                            >
                                <span className={`sales-breakdown-tier-icon ${matched ? "bg-success text-white" : "bg-light text-muted border"}`}>
                                    <i className={`fa ${matched ? "fa-trophy" : exceeded ? "fa-check" : "fa-circle-o"}`} aria-hidden="true" />
                                </span>
                                <div className="sales-breakdown-tier-identity">
                                    <div className="sales-breakdown-tier-name">
                                        {row.rangeName}
                                        {matched && (
                                            <span className="badge bg-success ms-2">Matched tier</span>
                                        )}
                                    </div>
                                    <div className="text-muted small">{row.metric}</div>
                                </div>
                                <div className="sales-breakdown-tier-stat">
                                    <div className="sales-breakdown-tier-stat-label text-muted">Required</div>
                                    <div className="sales-breakdown-tier-stat-value">{row.required}</div>
                                </div>
                                <div className="sales-breakdown-tier-stat">
                                    <div className="sales-breakdown-tier-stat-label text-muted">Actual</div>
                                    <div className="sales-breakdown-tier-stat-value">{row.actual}</div>
                                </div>
                                <div className="sales-breakdown-tier-rebate">
                                    <div className="sales-breakdown-tile-value">{row.rebate}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {conditioned && Array.isArray(evaluationResult?.groupResults)
                && evaluationResult.groupResults.length > 0 && (
                    <div className="sales-breakdown-block-row mb-4">
                        {evaluationResult.groupResults.map((gr, gi) => {
                            const passed = gr?.passed === true;
                            const rows = (gr?.conditionResults ?? []).map(mapConditionRow);
                            const joinLabel = gi > 0
                                ? String(gr?.joinWithPrevious || "OR").trim().toUpperCase()
                                : null;
                            return (
                                <div key={gr?.groupId ?? gi} className="sales-breakdown-block-wrap">
                                    {joinLabel && (
                                        <div className="sales-breakdown-join text-muted">{joinLabel}</div>
                                    )}
                                    <div className={`sales-breakdown-block-card border ${passed ? "border-success" : "border-danger"}`}>
                                        <div className="sales-breakdown-block-header">
                                            <span className="fw-semibold">Block {gi + 1}</span>
                                            <span className={`badge ${passed ? "bg-success" : "bg-danger"}`}>
                                                {passed ? "Pass" : "Fail"}
                                            </span>
                                        </div>
                                        <div className="sales-breakdown-block-body">
                                            {rows.map((row, ri) => {
                                                const ok = row.result === "Pass";
                                                return (
                                                    <div key={`${gr?.groupId ?? gi}-c-${ri}`} className="sales-breakdown-condition-row">
                                                        <span>{row.label} {row.required}</span>
                                                        <span className={`sales-breakdown-condition-actual ${ok ? "text-success" : "text-danger"}`}>
                                                            {row.actual}
                                                            <i
                                                                className={`fa ${ok ? "fa-check" : "fa-times"} ms-2`}
                                                                aria-hidden="true"
                                                            />
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            <div>
                <div className="sales-breakdown-section-title">
                    <strong>Monthly breakdown</strong>
                    {growthEnabled && (
                        <button
                            type="button"
                            className={`btn btn-sm ${showPreviousYear ? "btn-primary" : "btn-outline-primary"}`}
                            onClick={() => setShowPreviousYear((v) => !v)}
                        >
                            <i className="fa fa-calendar me-1" aria-hidden="true" />
                            Show previous year
                        </button>
                    )}
                </div>

                {loading && (
                    <div className="sales-breakdown-loading d-flex align-items-center gap-2 text-muted">
                        <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                        <span>Loading monthly sales...</span>
                    </div>
                )}
                {error && (
                    <div className="sales-breakdown-error text-danger">{error}</div>
                )}
                {!loading && !error && (
                    <div>
                        <div className="sales-breakdown-month-grid">
                            {monthlyRows.map((row) => {
                                const isMet = highlightMonthIndex >= 0 && row._index === highlightMonthIndex;
                                const isPaid = monthKeyOverlapsPaidPeriod(row.monthKey, targetPeriodPayments);
                                const isHighlighted = isMet || isPaid;
                                const isEmpty = !(Number(row.salesAmount) > 0) && !row.isPartial;
                                const cardClass = [
                                    "sales-breakdown-month-card",
                                    isEmpty
                                        ? "sales-breakdown-month-card--empty"
                                        : "sales-breakdown-month-card--filled",
                                    isHighlighted ? "sales-breakdown-month-card--first-met bg-success-subtle border-success" : "",
                                ].filter(Boolean).join(" ");
                                const growthLabel = `${Number(row.growthPct ?? 0).toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}%`;
                                return (
                                    <div key={row._index} className={cardClass}>
                                        <div className="sales-breakdown-month-card-label text-muted">
                                            {isHighlighted && (
                                                <i className="fa fa-check sales-breakdown-month-check" aria-hidden="true" />
                                            )}
                                            <span>{row.monthLabel}</span>
                                            {row.isPartial && (
                                                <span className="sales-breakdown-month-partial"> (partial)</span>
                                            )}
                                        </div>
                                        {showRebateColumn ? (
                                            <>
                                                <div className="sales-breakdown-month-card-metric">
                                                    <span className="sales-breakdown-month-card-field-label">Sales</span>
                                                    <div className="sales-breakdown-month-card-sales">
                                                        {formatMetricAmount(row.salesAmount, currency)} {currency}
                                                    </div>
                                                </div>
                                                <div className="sales-breakdown-month-card-metric">
                                                    <span className="sales-breakdown-month-card-field-label">Rebate</span>
                                                    <div className="sales-breakdown-month-card-rebate text-muted">
                                                        {fmtRebateAmount(row.rebate, currency)} {currency}
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="sales-breakdown-month-card-sales">
                                                {formatMetricAmount(row.salesAmount, currency)} {currency}
                                            </div>
                                        )}
                                        {showPreviousYear && (
                                            <div className="sales-breakdown-month-card-prev">
                                                <div>Prev year: {formatMetricAmount(row.previousYearSales, currency)} {currency}</div>
                                                <div>Growth: {growthLabel}</div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {showNoOwedFootnote && (
                            <div className="text-muted small mt-2">
                                No month is flagged since no rebate is currently owed - outcomes can still shift before the period closes.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <ModalComp
            modal={!!open}
            modalTitle={`Sales breakdown ${evaluationResult?.targetName ?? target?.targetName ?? ""}`}
            modalBody={modalBody}
            onClose={onClose}
            onCloseText="Close"
            size="xl"
            className="sales-breakdown-modal"
        />
    );
}
