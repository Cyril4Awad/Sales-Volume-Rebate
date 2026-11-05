import { useMemo, useState } from "react";

import { ModalComp } from "../../../ReusableComponents";
import { fmtRebateAmount } from "../utils/computationDisplayUtils";
import { groupFeesByCalendarMonth } from "../../../utils/feePeriodSchedule";
import { exportFeesBreakdownToExcel } from "../../../utils/exportComputationToExcel";
import {
    monthKeyOverlapsPaidPeriod,
    paymentsWithPeriodForFee,
} from "../../../utils/settlementPaymentLogic";
import BreakdownMonthMasterDetail from "../utils/BreakdownMonthMasterDetail";

import "../SalesBreakdownModal/SalesBreakdownModal.css";

export default function FeesBreakdownModal({
    open,
    onClose,
    fees = [],
    contractStart,
    contractEnd,
    settlementTypesMap,
    totalFees = 0,
    contractCurrency,
    contractReference = "",
    payments = [],
}) {
    const currency = contractCurrency ?? "USD";
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(null);

    const months = useMemo(() => {
        const base = groupFeesByCalendarMonth(fees, contractStart, contractEnd, settlementTypesMap);
        return base.map((m) => {
            const feeIds = [...new Set((m.contributors ?? []).map((c) => String(c.id ?? "")))];
            const periodPayments = feeIds.flatMap((feeId) =>
                paymentsWithPeriodForFee(payments, feeId)
            );
            return {
                ...m,
                isPaid: monthKeyOverlapsPaidPeriod(m.key, periodPayments),
            };
        });
    }, [fees, contractStart, contractEnd, settlementTypesMap, payments]);

    const handleExportExcel = async () => {
        setExporting(true);
        setExportError(null);
        try {
            await exportFeesBreakdownToExcel({
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
            <div className="breakdown-export-bar">
                <button
                    type="button"
                    className="plan-editor-toolbar-btn"
                    disabled={exporting}
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
                        <i className="fa fa-money" aria-hidden="true" />
                        Total Fees
                    </div>
                    <div className="sales-breakdown-tile-value">{fmtRebateAmount(totalFees, currency)} {currency}</div>
                </div>
            </div>
            <BreakdownMonthMasterDetail
                months={months}
                currency={currency}
                emptyMessage="No fee periods in this contract range."
                detailTotalCaption="Fees due"
            />
        </div>
    );

    return (
        <ModalComp
            modal={!!open}
            modalTitle="Fees breakdown"
            modalBody={modalBody}
            onClose={onClose}
            onCloseText="Close"
            size="xl"
            className="sales-breakdown-modal"
        />
    );
}
