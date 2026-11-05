import { useMemo, useState } from "react";
import moment from "moment";

import { AdvancedTable } from "../../../ReusableComponents";
import PlanWorkspaceAccordion from "../../Plans/components/PlanWorkspaceAccordion/PlanWorkspaceAccordion";
import { resolveTargetSalesKey, hasValidTargetDates } from "../../../utils/computationEngine";
import {
    buildSettlementTypesMap,
    getFeeEligibility,
    getFeeSettlementDisplay,
    getTargetEligibility,
    getTargetSettlementDisplay,
    isAlwaysAppliedTarget,
    SETTLEMENT_STATUS,
    sumSettlementTotals,
} from "../../../utils/settlementPaymentLogic";

import {
    EMPTY_SALES,
    SettlementStatusPills,
    buildConditionResultColumns,
    buildFeeColumns,
    buildFeeRows,
    buildSalesRows,
    buildTierResultColumns,
    fmtRebateAmount,
    formatMetricAmount,
    formatTargetDateRange,
    formatTargetRebateBadge,
    mapConditionRow,
    mapTierRow,
    optionToCode,
    resolveSettlementTypeLabel,
    salesMetricsColumns,
} from "../utils/computationDisplayUtils";

import SalesBreakdownModal from "../SalesBreakdownModal/SalesBreakdownModal";
import FeesBreakdownModal from "../FeesBreakdownModal/FeesBreakdownModal";
import TotalBreakdownModal from "../TotalBreakdownModal/TotalBreakdownModal";
import "../VRComputationWorkspace.css";

const EMPTY_CLIENT_IDS = [];

export default function ComputationResultsPanel({
    resolved,
    previewResults,
    salesByTargetId = {},
    salesMetaByTargetId = {},
    loadingSales = false,
    isLoading = false,
    dailyRate = null,
    showDetailsLink = true,
    showProcessButton = false,
    onOpenDetails,
    onProcessTarget,
    onProcessFees,
    payments = [],
    layoutVariant = "default",
    showBreakdowns = false,
    fetchSalesForDraftWindows = null,
    allClientIds = EMPTY_CLIENT_IDS,
    asOf = null,
    lastAccountingGenerationDate = null,
}) {
    const [breakdownTargetKey, setBreakdownTargetKey] = useState(null);
    const [feesBreakdownOpen, setFeesBreakdownOpen] = useState(false);
    const [totalBreakdownOpen, setTotalBreakdownOpen] = useState(false);
    const fees = resolved?.fees ?? [];
    const contractCurrency = resolved?.contractCurrency ?? "USD";
    const settlementTypesMap = useMemo(
        () => buildSettlementTypesMap(resolved?.settlementTypeOptions ?? []),
        [resolved?.settlementTypeOptions]
    );
    const contractStartDate = resolved?.contract?.StartDate
        ?? resolved?.contract?.startDate
        ?? resolved?.contract?.CTR_StartDate
        ?? null;
    const contractEndDate = resolved?.contract?.EndDate
        ?? resolved?.contract?.endDate
        ?? resolved?.contract?.CTR_EndDate
        ?? null;
    const contractReference = resolved?.contract?.ContractReference ?? "";

    const feeColumns = useMemo(() => buildFeeColumns(), []);
    const feeSettlementByFeeId = useMemo(() => {
        const out = {};
        fees.forEach((fee) => {
            const feeId = String(fee.feeId ?? fee.feeID ?? "");
            const display = getFeeSettlementDisplay({ fee, payments, contractCurrency });
            const eligibility = getFeeEligibility({
                fee,
                payments,
                settlementTypesMap,
                contractStartDate,
                contractEndDate,
                contractCurrency,
            });
            out[feeId] = {
                ...display,
                eligibility,
            };
        });
        return out;
    }, [fees, payments, settlementTypesMap, contractStartDate, contractEndDate, contractCurrency]);

    const feeRows = useMemo(
        () => buildFeeRows(fees, feeSettlementByFeeId),
        [fees, feeSettlementByFeeId]
    );

    const conditionResultColumns = useMemo(() => buildConditionResultColumns(), []);
    const tierResultColumns = useMemo(() => buildTierResultColumns(), []);

    const settlementTotals = useMemo(
        () => sumSettlementTotals({
            targets: resolved?.targets ?? [],
            targetResults: previewResults?.targetResults ?? [],
            salesByTargetId,
            fees,
            payments,
            contractCurrency,
        }),
        [resolved?.targets, previewResults?.targetResults, salesByTargetId, fees, payments, contractCurrency]
    );

    const rebateTotal = settlementTotals.rebateOwed;
    const feeTotals = useMemo(() => ({ [contractCurrency]: settlementTotals.feesOwed }), [settlementTotals.feesOwed, contractCurrency]);
    const grandTotal = settlementTotals.grandOwed;

    const feesAggregateSettlement = useMemo(() => {
        let owed = 0;
        let settled = 0;
        fees.forEach((fee) => {
            const feeId = String(fee.feeId ?? fee.feeID ?? "");
            const display = feeSettlementByFeeId[feeId];
            if (display) {
                owed += display.owedAmount ?? 0;
                settled += display.settledAmount ?? 0;
            }
        });
        return { owed, settled };
    }, [fees, feeSettlementByFeeId]);

    const showFeesProcess = useMemo(() => {
        if (!showProcessButton) return false;
        return fees.some((fee) => {
            const feeId = String(fee.feeId ?? fee.feeID ?? "");
            const elig = feeSettlementByFeeId[feeId]?.eligibility;
            return elig?.status !== SETTLEMENT_STATUS.PERMANENT;
        });
    }, [showProcessButton, fees, feeSettlementByFeeId]);

    const computationFetchedAt = useMemo(() => {
        let latest = null;
        Object.values(salesMetaByTargetId ?? {}).forEach((meta) => {
            const raw = meta?.fetchedAt;
            if (!raw) return;
            const m = moment(raw);
            if (!m.isValid()) return;
            if (!latest || m.isAfter(latest)) latest = m;
        });
        return latest;
    }, [salesMetaByTargetId]);

    const formatNoticeDateTime = (m) =>
        (m?.isValid() ? `${m.format("DD-MM-YYYY")} ${m.format("HH:mm:ss")}` : null);

    if (!previewResults || isLoading) return null;

    const panelClass = layoutVariant === "simulation"
        ? "computation-results-panel computation-results-panel--simulation"
        : "computation-results-panel";

    const accountingGenLabel = formatNoticeDateTime(
        lastAccountingGenerationDate ? moment(lastAccountingGenerationDate) : null
    );
    const computationFetchedLabel = formatNoticeDateTime(computationFetchedAt);

    return (
        <div className={panelClass}>
            {(accountingGenLabel || computationFetchedLabel) && (
                <p className="cvr-accounting-generation-notice mb-3">
                    {accountingGenLabel && (
                        <>Last Generation To Accounting Date : {accountingGenLabel}</>
                    )}
                    {accountingGenLabel && computationFetchedLabel && ", "}
                    {computationFetchedLabel && (
                        <>The amount shown is fetched up to this day: {computationFetchedLabel}</>
                    )}
                </p>
            )}
            <div className="card border-0 shadow-sm mb-3">
                <div className="card-body">
                    <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
                        <div className="d-flex flex-wrap gap-4">
                            <div>
                                <strong className="d-block mb-1">Rebate Total</strong>
                                <div className="d-flex flex-column fw-semibold">
                                    <span>
                                        {fmtRebateAmount(rebateTotal, contractCurrency)} {contractCurrency}
                                    </span>
                                </div>
                                <div className="text-muted small mt-1">
                                    Achieved: {previewResults.achievedCount} · Missed: {previewResults.missedCount} · In Progress: {previewResults.inProgressCount}
                                </div>
                            </div>

                            {fees.length > 0 && (
                                <div className="d-none d-md-block" style={{ width: 1, backgroundColor: "#e0e0e0", alignSelf: "stretch" }} />
                            )}

                            {fees.length > 0 && (
                                <div>
                                    <strong className="d-block mb-1">Fees Total</strong>
                                    <div className="d-flex flex-column fw-semibold">
                                        <span>
                                            {fmtRebateAmount(feeTotals[contractCurrency], contractCurrency)} {contractCurrency}
                                        </span>
                                    </div>
                                </div>
                            )}

                            <div className="d-none d-md-block" style={{ width: 1, backgroundColor: "#e0e0e0", alignSelf: "stretch" }} />
                            <div>
                                <strong className="d-block mb-1">Grand Total</strong>
                                <div className="d-flex flex-column fw-semibold">
                                    {fmtRebateAmount(grandTotal, contractCurrency)} {contractCurrency}
                                </div>
                            </div>
                        </div>
                        {showBreakdowns && (
                            <button
                                type="button"
                                className="btn btn-primary btn-sm flex-shrink-0"
                                onClick={() => setTotalBreakdownOpen(true)}
                            >
                                Total breakdown
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {fees.length > 0 && (
                <PlanWorkspaceAccordion
                    title="Fees"
                    subtitle={`${fees.length} fee${fees.length !== 1 ? "s" : ""}`}
                    defaultOpen={false}
                    level="primary"
                    headerRight={(showBreakdowns || showFeesProcess) ? (
                        <div className="d-flex align-items-center gap-2 flex-shrink-0">
                            {showBreakdowns && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setFeesBreakdownOpen(true);
                                    }}
                                >
                                    Fees breakdown
                                </button>
                            )}
                            {showFeesProcess && (
                                <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onProcessFees?.();
                                    }}
                                >
                                    Process
                                </button>
                            )}
                        </div>
                    ) : null}
                >
                    <div className="cvr-computation-target-body mb-3">
                        <div className="cvr-table-scroll-wrapper">
                            <div className="adv-mobile-table cvr-fees-table-wrap">
                                <AdvancedTable
                                    columns={feeColumns}
                                    dataArray={feeRows}
                                    minRows={0}
                                    showPagination={false}
                                />
                            </div>
                        </div>
                        <SettlementStatusPills
                            owedAmount={feesAggregateSettlement.owed}
                            settledAmount={feesAggregateSettlement.settled}
                            currency={contractCurrency}
                            owedLabel="Fees owed:"
                            settledLabel="Fees settled:"
                            muted={feesAggregateSettlement.owed === 0 && feesAggregateSettlement.settled > 0}
                        />
                    </div>
                </PlanWorkspaceAccordion>
            )}

            {(previewResults.targetResults || []).map((r, rIdx) => {
                const resultKey = String(r.targetId ?? "");
                const target = (resolved?.targets ?? []).find(
                    (t) => resolveTargetSalesKey(t) === resultKey
                );
                const sales = salesByTargetId[resultKey] ?? EMPTY_SALES;
                const meta = salesMetaByTargetId[resultKey] ?? {};
                const salesCurrencyLabel = contractCurrency;
                const subtitle = r.state;

                const rebateValueType = String(target?.rebateValueType ?? "F").trim().toUpperCase();
                const rebateValue = Number(target?.rebateValue ?? 0);
                const rebateCurrency = contractCurrency;
                const datesInvalid = !hasValidTargetDates(target);

                const eligibility = target ? getTargetEligibility({
                    target,
                    targetResult: r,
                    sales,
                    contractCurrency,
                    payments,
                    settlementTypesMap,
                    contractEndDate,
                }) : null;

                const settlementDisplay = target ? getTargetSettlementDisplay({
                    target,
                    targetResult: r,
                    sales,
                    contractCurrency,
                    payments,
                }) : null;

                const showTargetProcess = showProcessButton && eligibility?.showProcess;
                const settlementMuted = settlementDisplay
                    && settlementDisplay.owedAmount === 0
                    && settlementDisplay.settledAmount > 0;

                const settlementLabel = isAlwaysAppliedTarget(target)
                    ? resolveSettlementTypeLabel(
                        target?.settlementTypeId,
                        settlementTypesMap
                    )
                    : null;

                const rebateBadge = formatTargetRebateBadge(target, r, contractCurrency);
                const targetTitleName = `${r.targetName ?? "Target"}${rebateBadge ? ` ${rebateBadge}` : ""}`;

                return (
                    <PlanWorkspaceAccordion
                        key={resultKey || `target-${rIdx}`}
                        title={`${targetTitleName} · ${formatTargetDateRange(
                            target?.fromDate ?? target?.FromDate,
                            target?.toDate ?? target?.ToDate,
                            settlementLabel
                        )}`}
                        subtitle={subtitle}
                        defaultOpen={rIdx === 0}
                        level="primary"
                        headerRight={(showBreakdowns || showTargetProcess) ? (
                            <div className="d-flex align-items-center gap-2 flex-shrink-0">
                                {showBreakdowns && (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setBreakdownTargetKey(resultKey);
                                        }}
                                    >
                                        Sales breakdown
                                    </button>
                                )}
                                {showTargetProcess && (
                                    <button
                                        type="button"
                                        className="btn btn-primary btn-sm"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onProcessTarget?.(target, r, eligibility);
                                        }}
                                    >
                                        Process
                                    </button>
                                )}
                                {/* Details temporarily hidden — restore when sales drill-down is ready
                                {showDetailsLink && onOpenDetails && (
                                    <span
                                        className="hyperlink-text"
                                        style={{ fontSize: 12 }}
                                        onClick={(e) => { e.stopPropagation(); onOpenDetails(target); }}
                                    >
                                        Details
                                    </span>
                                )}
                                */}
                            </div>
                        ) : null}
                    >
                        <div className="cvr-computation-target-body">
                            <div className="cvr-target-columns">
                                <div className="cvr-target-col-left">
                                    <div className="cvr-table-scroll-wrapper">
                                        <div className="adv-mobile-table cvr-sales-metrics-table-wrap">
                                            <AdvancedTable
                                                columns={salesMetricsColumns}
                                                dataArray={buildSalesRows(sales, contractCurrency)}
                                                minRows={0}
                                                showPagination={false}
                                                maxHeight={300}
                                            />
                                        </div>
                                    </div>
                                    <div className="d-flex align-items-center gap-2 mt-3">
                                        <span
                                            className={`badge ${meta.referenceScope === "scoped" ? "bg-info text-dark" : "bg-light text-muted border"}`}
                                            style={{ fontWeight: 400, fontSize: 11 }}
                                        >
                                            {meta.referenceScope === "scoped" ? "Reference Scoped" : "All Client Sales"}
                                        </span>
                                    </div>
                                </div>

                                <div className="cvr-target-col-right">
                                    {r.matchedTier !== undefined && (
                                        <div className="adv-mobile-table cvr-results-table-wrap">
                                            <AdvancedTable
                                                columns={tierResultColumns}
                                                dataArray={(r.tierResults || []).map((tr, idx) =>
                                                    mapTierRow(
                                                        tr,
                                                        idx,
                                                        r.matchedTier,
                                                        sales,
                                                        target,
                                                        target?.rangeOverride,
                                                        salesCurrencyLabel,
                                                        datesInvalid
                                                    )
                                                )}
                                                minRows={0}
                                                showPagination={false}
                                            />
                                        </div>
                                    )}

                                    {r.matchedTier === undefined && (
                                        <div>
                                            {Array.isArray(r.groupResults) && r.groupResults.length > 0 ? (
                                                r.groupResults.map((gr, gi) => {
                                                    const passed = gr?.passed === true;
                                                    const rows = gr?.conditionResults ?? [];
                                                    return (
                                                        <div key={gr?.groupId ?? gi}>
                                                            {gi > 0 && (
                                                                <div className="d-flex align-items-center gap-2 my-2">
                                                                    <div style={{ flex: 1, height: 1, backgroundColor: "#e0e0e0" }} />
                                                                    <span className="text-muted" style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1 }}>OR</span>
                                                                    <div style={{ flex: 1, height: 1, backgroundColor: "#e0e0e0" }} />
                                                                </div>
                                                            )}
                                                            <div className={`border-start ${passed ? "border-success" : "border-danger"} ps-3 py-2 mb-3`}>
                                                                <div className="d-flex align-items-center gap-2 mb-2">
                                                                    <span className="fw-semibold text-muted" style={{ fontSize: 12 }}>BLOCK {gi + 1}</span>
                                                                    <span className={`badge ${passed ? "bg-success" : "bg-danger"}`} style={{ fontSize: 11 }}>
                                                                        {passed ? "Pass" : "Fail"}
                                                                    </span>
                                                                </div>
                                                                <div className="adv-mobile-table cvr-results-table-wrap">
                                                                    <AdvancedTable
                                                                        columns={conditionResultColumns}
                                                                        dataArray={(rows || []).map(mapConditionRow)}
                                                                        minRows={0}
                                                                        showPagination={false}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            ) : (
                                                <div className="border rounded-3 p-3 bg-light cvr-always-applied" style={{ fontSize: 13, minWidth: 280, marginTop: 25 }}>
                                                    <div className="fw-semibold mb-2 text-muted" style={{ fontSize: 12, letterSpacing: 0.5 }}>
                                                        ALWAYS APPLIED
                                                    </div>
                                                    <div className="d-flex flex-column gap-3">
                                                        <div className="d-flex justify-content-between gap-4">
                                                            <span className="text-muted">Rebate</span>
                                                            <span className="fw-semibold">
                                                                {rebateValueType === "P"
                                                                    ? `${rebateValue}% `
                                                                    : `${rebateValue.toLocaleString()} ${rebateCurrency}`}
                                                            </span>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-4">
                                                            <span className="text-muted">Sales Amount</span>
                                                            <span className="fw-semibold">
                                                                {formatMetricAmount(
                                                                    contractCurrency && sales.salesAmounts?.[contractCurrency] != null
                                                                        ? sales.salesAmounts[contractCurrency]
                                                                        : (sales.salesAmountBase ?? sales.salesAmount),
                                                                    contractCurrency
                                                                )} {contractCurrency}
                                                            </span>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-4 border-top pt-2 mt-1">
                                                            <span className="text-muted">Cumulative rebate</span>
                                                            <span className="fw-semibold" style={{ color: "#0a3622" }}>
                                                                {fmtRebateAmount(settlementDisplay?.currentTotal ?? r.rebateAmount, contractCurrency)} {contractCurrency}
                                                            </span>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-4">
                                                            <span className="text-muted">Already settled</span>
                                                            <span className="fw-semibold">
                                                                {fmtRebateAmount(settlementDisplay?.settledAmount ?? 0, contractCurrency)} {contractCurrency}
                                                            </span>
                                                        </div>
                                                        <div className="d-flex justify-content-between gap-4">
                                                            <span className="text-muted">Currently owed</span>
                                                            <span className="fw-semibold">
                                                                {fmtRebateAmount(settlementDisplay?.owedAmount ?? 0, contractCurrency)} {contractCurrency}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {settlementDisplay && (
                                <SettlementStatusPills
                                    owedAmount={settlementDisplay.owedAmount}
                                    settledAmount={settlementDisplay.settledAmount}
                                    currency={settlementDisplay.currency}
                                    muted={settlementMuted}
                                />
                            )}
                        </div>
                    </PlanWorkspaceAccordion>
                );
            })}

            {showBreakdowns && (
                <FeesBreakdownModal
                    open={feesBreakdownOpen}
                    onClose={() => setFeesBreakdownOpen(false)}
                    fees={fees}
                    contractStart={contractStartDate}
                    contractEnd={contractEndDate}
                    settlementTypesMap={settlementTypesMap}
                    totalFees={settlementTotals.feesOwed}
                    contractCurrency={contractCurrency}
                    contractReference={contractReference}
                    payments={payments}
                />
            )}

            {showBreakdowns && (
                <TotalBreakdownModal
                    open={totalBreakdownOpen}
                    onClose={() => setTotalBreakdownOpen(false)}
                    targets={resolved?.targets ?? []}
                    targetResults={previewResults?.targetResults ?? []}
                    fees={fees}
                    contractStart={contractStartDate}
                    contractEnd={contractEndDate}
                    settlementTypesMap={settlementTypesMap}
                    fetchSalesForDraftWindows={fetchSalesForDraftWindows}
                    allClientIds={allClientIds}
                    contractCurrency={contractCurrency}
                    asOf={asOf}
                    contractReference={contractReference}
                    payments={payments}
                />
            )}

            {showBreakdowns && (
                <SalesBreakdownModal
                    open={!!breakdownTargetKey}
                    onClose={() => setBreakdownTargetKey(null)}
                    target={(resolved?.targets ?? []).find((t) => resolveTargetSalesKey(t) === breakdownTargetKey)}
                    evaluationResult={(previewResults?.targetResults || []).find((r) => String(r.targetId ?? "") === breakdownTargetKey)}
                    sales={salesByTargetId[breakdownTargetKey] ?? EMPTY_SALES}
                    settlementDisplay={
                        (() => {
                            const t = (resolved?.targets ?? []).find((x) => resolveTargetSalesKey(x) === breakdownTargetKey);
                            const r = (previewResults?.targetResults || []).find((x) => String(x.targetId ?? "") === breakdownTargetKey);
                            if (!t) return null;
                            return getTargetSettlementDisplay({
                                target: t,
                                targetResult: r,
                                sales: salesByTargetId[breakdownTargetKey] ?? EMPTY_SALES,
                                contractCurrency,
                                payments,
                            });
                        })()
                    }
                    fetchSalesForDraftWindows={fetchSalesForDraftWindows}
                    allClientIds={allClientIds}
                    contractCurrency={contractCurrency}
                    asOf={asOf}
                    contractReference={contractReference}
                    payments={payments}
                />
            )}
        </div>
    );
}
