import { useEffect, useMemo, useState } from "react";
import moment from "moment";

import { ModalComp } from "../../../ReusableComponents";
import { buildMonthEndWindows } from "../utils/salesBreakdownUtils";
import { allocateTargetMonthContributions } from "../utils/totalBreakdownUtils";
import { groupFeesByCalendarMonth } from "../../../utils/feePeriodSchedule";
import { resolveTargetSalesKey } from "../../../utils/computationEngine";
import {
    monthKeyOverlapsPaidPeriod,
    paymentsWithPeriodForFee,
    paymentsWithPeriodForTarget,
} from "../../../utils/settlementPaymentLogic";
import BreakdownMonthMasterDetail from "../utils/BreakdownMonthMasterDetail";
import { exportTotalBreakdownToExcel } from "../../../utils/exportComputationToExcel";

import "../SalesBreakdownModal/SalesBreakdownModal.css";

function derivePaidStatus(contributors = []) {
    if (!contributors.length) return "none";
    const paidCount = contributors.filter((c) => c.isPaid).length;
    if (paidCount === 0) return "none";
    if (paidCount === contributors.length) return "full";
    return "partial";
}

function sumContributorAmounts(contributors, paidOnly) {
    return contributors
        .filter((c) => !!c.isPaid === paidOnly)
        .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
}

export default function TotalBreakdownModal({
    open,
    onClose,
    targets = [],
    targetResults = [],
    fees = [],
    contractStart,
    contractEnd,
    settlementTypesMap,
    fetchSalesForDraftWindows,
    allClientIds = [],
    contractCurrency,
    asOf,
    contractReference = "",
    payments = [],
}) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(null);
    const [targetContributions, setTargetContributions] = useState([]);
    const currency = contractCurrency ?? "USD";
    const asOfDateKey = asOf ? moment(asOf).format("YYYY-MM-DD") : moment().format("YYYY-MM-DD");

    const monthWindows = useMemo(
        () => buildMonthEndWindows(contractStart, contractEnd, contractEnd),
        [contractStart, contractEnd]
    );

    const feeMonths = useMemo(
        () => groupFeesByCalendarMonth(fees, contractStart, contractEnd, settlementTypesMap),
        [fees, contractStart, contractEnd, settlementTypesMap]
    );

    useEffect(() => {
        if (!open) {
            setTargetContributions([]);
            setError(null);
            setLoading(false);
            setExporting(false);
            setExportError(null);
            return undefined;
        }
        if (!fetchSalesForDraftWindows || !allClientIds?.length) {
            setTargetContributions([]);
            return undefined;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const jobs = (targets || []).map((target) => {
            const resultKey = resolveTargetSalesKey(target);
            const result = (targetResults || []).find(
                (r) => String(r.targetId ?? "") === resultKey
            );
            const from = target?.fromDate ?? target?.FromDate;
            const to = target?.toDate ?? target?.ToDate;
            const windows = buildMonthEndWindows(from, to, asOfDateKey);
            if (!windows.length) return Promise.resolve([]);
            return fetchSalesForDraftWindows(target, allClientIds, windows).then((mapped) =>
                allocateTargetMonthContributions({
                    target,
                    evaluationResult: result,
                    windows,
                    salesByWindowKey: mapped ?? {},
                    currency,
                })
            );
        });

        Promise.all(jobs)
            .then((groups) => {
                if (!cancelled) setTargetContributions(groups.flat());
            })
            .catch((err) => {
                if (!cancelled) setError(err?.message || "Failed to load monthly totals.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        open,
        targets,
        targetResults,
        allClientIds,
        fetchSalesForDraftWindows,
        asOfDateKey,
        currency,
    ]);

    const months = useMemo(() => {
        const feeByKey = {};
        feeMonths.forEach((m) => {
            feeByKey[m.key] = m;
        });
        return monthWindows.map((window) => {
            const targetsForMonth = targetContributions
                .filter((c) => c.monthKey === window.key)
                .map((c) => ({
                    ...c,
                    isPaid: monthKeyOverlapsPaidPeriod(
                        window.key,
                        paymentsWithPeriodForTarget(payments, c.targetId)
                    ),
                }));
            const feesForMonth = (feeByKey[window.key]?.contributors ?? []).map((c) => ({
                kind: "fee",
                id: c.id,
                name: c.name,
                rate: null,
                cadence: c.cadence,
                amount: c.amount,
                isPaid: monthKeyOverlapsPaidPeriod(
                    window.key,
                    paymentsWithPeriodForFee(payments, c.id)
                ),
            }));
            const contributors = [...targetsForMonth, ...feesForMonth];
            const total = contributors.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
            const paidStatus = derivePaidStatus(contributors);

            return {
                key: window.key,
                label: window.label,
                total,
                contributors,
                paidStatus,
                paidAmount: sumContributorAmounts(contributors, true),
                outstandingAmount: sumContributorAmounts(contributors, false),
            };
        });
    }, [monthWindows, targetContributions, feeMonths, payments]);

    const handleExportExcel = async () => {
        setExporting(true);
        setExportError(null);
        try {
            await exportTotalBreakdownToExcel({
                contractReference,
                currency,
                months,
            });
        } catch (err) {
            setExportError(err?.message || "Export failed.");
        } finally {
            setExporting(false);
        }
    };

    const modalBody = (
        <div className="cvr-computation-target-body sales-breakdown-body">
            <div className="breakdown-export-bar breakdown-export-bar--with-legend">
                <button
                    type="button"
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
                <div className="breakdown-paid-legend" aria-label="Payment status legend">
                    <span className="breakdown-paid-legend-item">
                        <span className="breakdown-paid-legend-swatch breakdown-paid-legend-swatch--none" />
                        Not paid
                    </span>
                    <span className="breakdown-paid-legend-item">
                        <span className="breakdown-paid-legend-swatch breakdown-paid-legend-swatch--partial">
                            <i className="fa fa-adjust" aria-hidden="true" />
                        </span>
                        Partially paid
                    </span>
                    <span className="breakdown-paid-legend-item">
                        <span className="breakdown-paid-legend-swatch breakdown-paid-legend-swatch--full">
                            <i className="fa fa-check" aria-hidden="true" />
                        </span>
                        Fully paid
                    </span>
                </div>
            </div>
            {exportError && <div className="text-danger small mb-2">{exportError}</div>}
            {loading && (
                <div className="sales-breakdown-loading d-flex align-items-center gap-2 text-muted">
                    <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                    <span>Loading monthly totals...</span>
                </div>
            )}
            {error && <div className="sales-breakdown-error text-danger">{error}</div>}
            {!loading && !error && (
                <BreakdownMonthMasterDetail
                    months={months}
                    currency={currency}
                    emptyMessage="No months in this contract range."
                    detailTotalCaption="Total due"
                />
            )}
        </div>
    );

    return (
        <ModalComp
            modal={!!open}
            modalTitle="Total breakdown"
            modalBody={modalBody}
            onClose={onClose}
            onCloseText="Close"
            size="xl"
            className="sales-breakdown-modal"
        />
    );
}
