import { useMemo, useState } from "react";
import { fmtRebateAmount } from "./computationDisplayUtils";

function contributorSubtitle(c) {
    if (c.kind === "fee") {
        const cadence = String(c.cadence ?? "").trim();
        return cadence ? `Fee · ${cadence}` : "Fee";
    }
    const rate = String(c.rate ?? "").trim();
    return rate ? `Rebate · ${rate}` : "Rebate";
}

function resolvePaidStatus(month) {
    if (month?.paidStatus === "none" || month?.paidStatus === "partial" || month?.paidStatus === "full") {
        return month.paidStatus;
    }
    if (month?.isPaid) return "full";
    return "none";
}

function detailCaption(status, label, detailTotalCaption) {
    if (status === "full") return `${label} · Total · Fully paid`;
    if (status === "partial") return `${label} · Total`;
    return `${label} · ${detailTotalCaption}`;
}

export default function BreakdownMonthMasterDetail({
    months = [],
    currency = "USD",
    emptyMessage = "No periods in this range.",
    detailTotalCaption = "Total due",
}) {
    const defaultKey = useMemo(() => {
        const firstWithTotal = (months || []).find((m) => Number(m.total) > 0);
        return firstWithTotal?.key ?? months[0]?.key ?? null;
    }, [months]);

    const [selectedKey, setSelectedKey] = useState(null);
    const activeKey = selectedKey && months.some((m) => m.key === selectedKey)
        ? selectedKey
        : defaultKey;
    const selected = months.find((m) => m.key === activeKey) ?? null;
    const selectedStatus = resolvePaidStatus(selected);

    if (!months.length) {
        return (
            <div className="sales-breakdown-month-card sales-breakdown-month-card--empty">
                <div className="sales-breakdown-month-card-label text-muted">{emptyMessage}</div>
            </div>
        );
    }

    return (
        <div className="breakdown-master-detail">
            <div className="breakdown-chip-row" role="listbox" aria-label="Months">
                {months.map((m) => {
                    const isSelected = m.key === activeKey;
                    const isEmpty = !(Number(m.total) > 0);
                    const status = resolvePaidStatus(m);
                    const chipClass = [
                        "breakdown-chip",
                        isSelected ? "breakdown-chip--selected" : "breakdown-chip--idle",
                        isEmpty && !isSelected ? "breakdown-chip--empty" : "",
                        !isSelected && status === "full" ? "breakdown-chip--paid" : "",
                        !isSelected && status === "partial" ? "breakdown-chip--partial" : "",
                    ].filter(Boolean).join(" ");
                    return (
                        <button
                            key={m.key}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={chipClass}
                            onClick={() => setSelectedKey(m.key)}
                        >
                            <span className="breakdown-chip-label">
                                {status === "full" && (
                                    <i className="fa fa-check breakdown-status-icon breakdown-status-icon--full" aria-hidden="true" />
                                )}
                                {status === "partial" && (
                                    <i className="fa fa-adjust breakdown-status-icon breakdown-status-icon--partial" aria-hidden="true" />
                                )}
                                {m.label}
                            </span>
                            <span className="breakdown-chip-amount">{fmtRebateAmount(m.total, currency)} {currency}</span>
                        </button>
                    );
                })}
            </div>

            {selected && (
                <div
                    className={[
                        "breakdown-detail-panel",
                        selectedStatus === "full" ? "breakdown-detail-panel--full" : "",
                        selectedStatus === "partial" ? "breakdown-detail-panel--partial" : "",
                    ].filter(Boolean).join(" ")}
                >
                    <div className="breakdown-detail-header">
                        <div className="breakdown-detail-total">
                            {selectedStatus === "full" && (
                                <i className="fa fa-check breakdown-status-icon breakdown-status-icon--full me-1" aria-hidden="true" />
                            )}
                            {selectedStatus === "partial" && (
                                <i className="fa fa-adjust breakdown-status-icon breakdown-status-icon--partial me-1" aria-hidden="true" />
                            )}
                            {fmtRebateAmount(selected.total, currency)} {currency}
                        </div>
                        <div className="breakdown-detail-total-caption">
                            {detailCaption(selectedStatus, selected.label, detailTotalCaption)}
                        </div>
                        {selectedStatus === "partial" && (
                            <div className="breakdown-detail-split-strip">
                                <div className="breakdown-detail-stat">
                                    <span className="breakdown-detail-stat-label">Paid</span>
                                    <span className="breakdown-detail-stat-value breakdown-detail-stat-value--paid">
                                        {fmtRebateAmount(selected.paidAmount ?? 0, currency)} {currency}
                                    </span>
                                </div>
                                <div className="breakdown-detail-stat">
                                    <span className="breakdown-detail-stat-label">Due</span>
                                    <span className="breakdown-detail-stat-value breakdown-detail-stat-value--due">
                                        {fmtRebateAmount(selected.outstandingAmount ?? 0, currency)} {currency}
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                    {(selected.contributors ?? []).length === 0 ? (
                        <div className="text-muted small mt-2">No amounts due this month.</div>
                    ) : (
                        <div className="breakdown-detail-list">
                            {selected.contributors.map((c, idx) => {
                                const rowPaid = !!c.isPaid;
                                return (
                                    <div
                                        key={`${selected.key}-${c.kind ?? "row"}-${c.id ?? idx}`}
                                        className={[
                                            "breakdown-detail-row",
                                            "breakdown-detail-row-card",
                                            rowPaid ? "breakdown-detail-row--paid" : "",
                                        ].filter(Boolean).join(" ")}
                                    >
                                        <div className="breakdown-detail-row-main">
                                            <span className="breakdown-detail-row-name">
                                                {rowPaid && (
                                                    <i className="fa fa-check breakdown-status-icon breakdown-status-icon--full me-1" aria-hidden="true" />
                                                )}
                                                {c.name}
                                            </span>
                                            <span className="breakdown-detail-row-subtitle">{contributorSubtitle(c)}</span>
                                        </div>
                                        <div className="breakdown-detail-row-amount">
                                            <span className="breakdown-detail-amount-label">Amount</span>
                                            <span>{fmtRebateAmount(c.amount, currency)} {currency}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
