import moment from "moment";
import {
    mobileActionRow,
    mobileDualCell,
    mobileHideOnMobile,
    mobileLabeledRow,
    mobilePlainRow,
} from "../../../utils/mobileTableCells";
const toArray = (v) => (Array.isArray(v) ? v : []);

export const formatTargetDateRange = (from, to, settlementLabel) => {
    const f = from ? moment(from).format("DD-MM-YYYY") : "-";
    const t = to ? moment(to).format("DD-MM-YYYY") : "-";
    const base = `Start Date: ${f}  |  End Date: ${t}`;
    if (settlementLabel) {
        return `${base}  |  Settlement: ${settlementLabel}`;
    }
    return base;
};

export const optionToCode = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "object") return (v.value ?? v.label ?? "").trim() || null;
    return null;
};

export const resolveSettlementTypeLabel = (settlementTypeId, settlementTypesMap = {}) => {
    if (!settlementTypeId) return null;
    const direct = typeof settlementTypeId === "object" ? settlementTypeId.label : null;
    if (direct) return direct;
    const key = optionToCode(settlementTypeId);
    if (!key) return null;
    return settlementTypesMap[String(key)]?.label ?? null;
};

export const formatRangeRebateCell = (tr) => {
    const t = String(tr?.rebateValueType ?? "F").trim().toUpperCase();
    const v = tr?.rebateValue ?? 0;
    if (t === "P") return `${v}%`;
    const cur = optionToCode(tr?.currency) ?? "";
    return cur ? `${v} ${cur}` : String(v);
};

/** Truncate toward zero to 2 decimal places (matches settlement storage). */
export function truncateMoney2(n) {
    const num = Number(n ?? 0);
    if (!Number.isFinite(num)) return 0;
    const sign = num < 0 ? -1 : 1;
    return sign * (Math.trunc(Math.abs(num) * 100 + 1e-9) / 100);
}

const fmtMoney2 = (n) =>
    truncateMoney2(n).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

/** Sales amounts (computation / simulation display). */
export const fmtAmount = (n) => fmtMoney2(n);

/** Rebate, fee, and settlement amounts (computation / simulation display). */
export const fmtRebateAmount = (n, _cur = "USD") => fmtMoney2(n);

const formatRebateBadgeFromTypeValue = (rebateValueType, rebateValue, currencyCode) => {
    const type = String(rebateValueType ?? "F").trim().toUpperCase();
    const value = Number(rebateValue ?? 0);
    if (type === "P") {
        const pct = value % 1 === 0
            ? value.toLocaleString(undefined, { maximumFractionDigits: 0 })
            : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return `${pct}%`;
    }
    const cur = String(currencyCode ?? "USD").trim() || "USD";
    return `${fmtRebateAmount(value, cur)} ${cur}`;
};

/** Accordion label: rebate % or fixed amount for formula / always-applied / matched range tier. */
export function formatTargetRebateBadge(target, targetResult, contractCurrency = "USD") {
    const isRange = String(target?.targetType ?? "").trim().toLowerCase() === "range";
    if (isRange) {
        const tier = targetResult?.matchedTier;
        if (!tier) return "";
        const tierCur = optionToCode(tier.currency) ?? contractCurrency;
        return formatRebateBadgeFromTypeValue(tier.rebateValueType, tier.rebateValue, tierCur);
    }
    if (!target) return "";
    const cur = optionToCode(target.currency) ?? contractCurrency;
    return formatRebateBadgeFromTypeValue(target.rebateValueType, target.rebateValue, cur);
}

export const fmtQty = (n) => Number(n ?? 0).toLocaleString();

export const isMatchedRangeRow = (tr, matchedTier) =>
    matchedTier != null && Number(tr?.value) === Number(matchedTier?.value);

export const CvrCell = ({ matched, center, children }) => (
    <div className={[
        "cvr-cell",
        center ? "cvr-cell--center" : "",
        matched ? "cvr-cell--matched" : "",
    ].filter(Boolean).join(" ")}>
        {children}
    </div>
);

export const rebatePillStyle = {
    backgroundColor: "#d1e7dd",
    color: "#0a3622",
    borderRadius: 20,
    padding: "3px 14px",
    fontWeight: 600,
    fontSize: 14,
};

export const RebateAmountPill = ({ amount, amounts, label, currency }) => {
    const effectiveLabel = label ?? "Rebate amount:";
    const entries = amounts && typeof amounts === "object"
        ? Object.entries(amounts)
        : amount != null
            ? [[currency ?? "USD", amount]]
            : [];

    if (!entries.length) return null;

    return (
        <div className="d-flex flex-column gap-2 mt-3">
            {entries.map(([cur, amt]) => (
                <div key={cur} className="d-flex align-items-center gap-2">
                    <span className="text-muted small">{effectiveLabel}</span>
                    <span style={rebatePillStyle}>
                        {fmtRebateAmount(amt, cur)} {cur}
                    </span>
                </div>
            ))}
        </div>
    );
};

const SETTLEMENT_PILL_LABEL_MIN_WIDTH = 108;

export const SettlementStatusPills = ({
    owedAmount,
    settledAmount,
    currency,
    muted = false,
    owedLabel = "Rebate owed:",
    settledLabel = "Rebate settled:",
    compact = false,
}) => {
    const cur = currency ?? "USD";
    const wrapperClass = [
        "d-flex flex-column gap-2",
        compact ? "" : "mt-3",
        muted ? "text-muted" : "",
    ].filter(Boolean).join(" ");

    const labelStyle = { minWidth: SETTLEMENT_PILL_LABEL_MIN_WIDTH, flexShrink: 0 };

    return (
        <div className={wrapperClass}>
            <div className="d-flex align-items-center gap-2">
                <span className="text-muted small" style={labelStyle}>{owedLabel}</span>
                <span style={rebatePillStyle}>
                    {fmtRebateAmount(owedAmount, cur)} {cur}
                </span>
            </div>
            <div className="d-flex align-items-center gap-2">
                <span className="text-muted small" style={labelStyle}>{settledLabel}</span>
                <span style={rebatePillStyle}>
                    {fmtRebateAmount(settledAmount, cur)} {cur}
                </span>
            </div>
        </div>
    );
};

export const resolveSalesCurrencyLabel = (meta) => meta?.salesAmountCurrency ?? "USD";

export const tierSalesMetric = (sales, target) => {
    if (target?.tierConditionType === "Q") return sales.salesQuantity ?? 0;
    if (target?.tierConditionType === "G") return sales.growthPercentageUSD ?? 0;
    const cur = optionToCode(target?.salesAmountCurrency);
    if (cur && sales.salesAmounts) {
        return sales.salesAmounts[cur] ?? sales.salesAmount ?? 0;
    }
    return sales.salesAmount ?? 0;
};

export const tierMetricLabel = (target) => {
    if (target?.tierConditionType === "Q") return "Sales Quantity";
    if (target?.tierConditionType === "G") return "Growth";
    return "Sales Amount";
};

export const EMPTY_SALES = {
    salesAmounts: {},
    salesAmount: 0,
    salesAmountBase: 0,
    salesQuantity: 0,
    systemCurrency: "USD",
    growthPercentageUSD: 0,
    previousYearSalesAmounts: {},
    previousYearSalesQuantity: 0,
};

export const formatMetricAmount = (val, cur) => {
    if (cur === "Pcs") return Number(val ?? 0).toLocaleString();
    if (cur === "%") {
        return Number(val ?? 0).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }
    return fmtAmount(val);
};

export const formatTierMetricValue = (n, tierConditionType, contractCurrency = null) => {
    const cur = tierConditionType === "Q" ? "Pcs" : tierConditionType === "G" ? "%" : (contractCurrency ?? "USD");
    return formatMetricAmount(n, cur);
};

export const buildSalesRows = (sales, contractCurrency = null) => {
    const formatDisplayLine = (metric, amount, currency) => {
        const unit = currency === "%" ? `%` : currency;
        const suffix = currency === "%" ? ` ${unit}` : ` ${unit}`;
        return `${metric}: ${amount}${suffix}`;
    };

    const amounts = sales.salesAmounts ?? {};
    const curFilter = contractCurrency ? String(contractCurrency).trim().toUpperCase() : null;
    const amountEntries = curFilter
        ? (amounts[curFilter] != null ? [[curFilter, amounts[curFilter]]] : [])
        : Object.entries(amounts);

    const rows = amountEntries.map(([cur, val]) => {
        const amount = formatMetricAmount(val, cur);
        return {
            metric: "Sales Amount",
            amount,
            currency: cur,
            displayLine: formatDisplayLine("Sales Amount", amount, cur),
        };
    });

    const prevAmounts = sales.previousYearSalesAmounts ?? {};
    if (Object.keys(prevAmounts).length > 0) {
        const prevEntries = curFilter
            ? (prevAmounts[curFilter] != null ? [[curFilter, prevAmounts[curFilter]]] : [])
            : Object.entries(prevAmounts);
        prevEntries.forEach(([cur, val]) => {
            const amount = formatMetricAmount(val, cur);
            rows.push({
                metric: "Prev. Year Amount",
                amount,
                currency: cur,
                displayLine: formatDisplayLine("Prev. Year Amount", amount, cur),
            });
        });
        const growthAmount = formatMetricAmount(sales.growthPercentageUSD ?? 0, "%");
        rows.push({
            metric: "Growth",
            amount: growthAmount,
            currency: "%",
            displayLine: formatDisplayLine("Growth", growthAmount, "%"),
        });
    }

    return rows;
};

const exceededIcon = (val) => (val === "Yes" ? "✅" : val === "No" ? "❌" : val);

const resultIcon = (val) => (val === "Pass" ? "✅" : val === "Fail" ? "❌" : val);
export const salesMetricsColumns = [
    {
        Header: "Metric",
        accessor: "metric",
        style: { textAlign: "left" },
        width: 250,
        Cell: (cell) => (
            <div style={{ paddingLeft: 10 }}>
                {mobileDualCell(
                    cell.value,
                    mobilePlainRow(cell.original.displayLine ?? cell.value)
                )}
            </div>
        ),
    },
    {
        Header: "Amount",
        accessor: "amount",
        style: { textAlign: "right" },
        width: 200,
        Cell: (cell) => mobileHideOnMobile(cell.value),
    },
    {
        Header: "",
        accessor: "currency",
        style: { textAlign: "center" },
        width: 150,
        Cell: (cell) => mobileHideOnMobile(cell.value),
    },
];
const conditionRowCurrencyLabel = (cr) => {
    if (cr.conditionType === "Q") return "Pcs";
    if (cr.conditionType === "G") return "%";
    if (cr.conditionType === "S") {
        const raw = cr.salesAmountCurrency;
        if (raw == null || raw === "") return "USD";
        if (typeof raw === "object") return raw.value ?? raw.label ?? "USD";
        return String(raw).trim() || "USD";
    }
    return "";
};

export const mapConditionRow = (cr) => {
    const currencyLabel = conditionRowCurrencyLabel(cr);
    const formatVal = (v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return (v ?? "-");
        if (cr.conditionType === "G") {
            return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        if (cr.conditionType === "Q") return Number(n).toLocaleString();
        return formatMetricAmount(n, currencyLabel);
    };
    return {
        label: cr.label,
        required: cr.operator
            ? `${cr.operator} ${formatVal(cr.required)} ${currencyLabel}`
            : "-",
        actual: cr.actual != null
            ? `${formatVal(cr.actual)} ${currencyLabel}`
            : "-",
        result: cr.skipped ? "Skipped" : (cr.passed ? "Pass" : "Fail"),
        _isMatched: false,
    };
};

export const mapTierRow = (tr, idx, matchedTier, sales, target, rangeOverride, currencyLabel, datesInvalid = false) => {
    const tierUnit = target?.tierConditionType === "Q"
        ? "Pcs"
        : target?.tierConditionType === "G"
            ? "%"
            : (currencyLabel ?? "USD");
    const rangeOverrideFlag = !!(rangeOverride ?? target?.rangeOverride ?? target?.RangeOverride);
    return {
        metric: tierMetricLabel(target),
        rangeName: `Range ${idx + 1}`,
        required: `> ${target?.tierConditionType === "G"
            ? Number(tr.value ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : target?.tierConditionType === "Q"
                ? Number(tr.value ?? 0).toLocaleString()
                : formatMetricAmount(tr.value ?? 0, tierUnit)} ${tierUnit}`,
        actual: `${formatTierMetricValue(tierSalesMetric(sales, target), target?.tierConditionType)} ${tierUnit}`,
        exceeded: datesInvalid ? "N/A" : (tr.exceeded ? "Yes" : "No"),
        rebate: formatRangeRebateCell(tr),
        _isMatched: datesInvalid ? false : (rangeOverrideFlag ? !!tr.exceeded : isMatchedRangeRow(tr, matchedTier)),
    };
};

export const buildConditionResultColumns = () => [
    {
        Header: "Metric",
        accessor: "label",
        width: 110,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched}>
                <div style={{ paddingLeft: 10 }}>
                    {mobileDualCell(
                        cell.value,
                        mobilePlainRow(`${cell.original.label} ${cell.original.required}`.trim())
                    )}
                </div>
            </CvrCell>
        ),
    },
    {
        Header: "Required",
        accessor: "required",
        width: 170,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched} center>
                {mobileHideOnMobile(cell.value)}
            </CvrCell>
        ),
    },
    {
        Header: "Actual",
        accessor: "actual",
        width: 170,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched} center>
                {mobileDualCell(
                    cell.value,
                    mobileLabeledRow("Actual", cell.value)
                )}
            </CvrCell>
        ),
    },
    {
        Header: "Result",
        accessor: "result",
        width: 70,
        Cell: (cell) => {
            const icon = resultIcon(cell.value);
            return (
                <CvrCell matched={cell.original._isMatched} center>
                    {mobileDualCell(
                        icon,
                        mobileLabeledRow("Result", icon)
                    )}
                </CvrCell>
            );
        },
    },
];
export const buildTierResultColumns = () => [
    {
        Header: "Range",
        accessor: "rangeName",
        width: 90,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched}>
                {mobileDualCell(
                    cell.value,
                    mobilePlainRow(cell.value)
                )}
            </CvrCell>
        ),
    },
    {
        Header: "Metric",
        accessor: "metric",
        width: 120,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched}>
                {mobileHideOnMobile(<div>{cell.value}</div>)}
            </CvrCell>
        ),
    },
    {
        Header: "Required",
        accessor: "required",
        width: 150,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched} center>
                {mobileDualCell(
                    cell.value,
                    mobileLabeledRow("Required", `${cell.original.metric} ${cell.value}`)
                )}
            </CvrCell>
        ),
    },
    {
        Header: "Actual",
        accessor: "actual",
        width: 150,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched} center>
                {mobileDualCell(
                    cell.value,
                    mobileLabeledRow("Actual", cell.value)
                )}
            </CvrCell>
        ),
    },
    {
        Header: "Rebate",
        accessor: "rebate",
        width: 110,
        Cell: (cell) => (
            <CvrCell matched={cell.original._isMatched} center>
                {mobileDualCell(
                    cell.value,
                    mobileLabeledRow("Rebate", cell.value)
                )}
            </CvrCell>
        ),
    },
    {
        Header: "Exceeded",
        accessor: "exceeded",
        width: 90,
        Cell: (cell) => {
            const icon = exceededIcon(cell.value);
            return (
                <CvrCell matched={cell.original._isMatched} center>
                    {mobileDualCell(
                        icon,
                        mobileLabeledRow("Exceeded", icon)
                    )}
                </CvrCell>
            );
        },
    },
];
export const formatFeeAmount = (fee) => {
    const amount = Number(fee.amount ?? 0);
    return {
        rate: null,
        computed: amount,
        currency: optionToCode(fee.currency) ?? "USD",
    };
};

export const buildFeeColumns = () => [
    {
        Header: "Name",
        accessor: "name",
        width: 200,
        Cell: (cell) => (
            <div style={{ paddingLeft: 10 }}>
                {mobileDualCell(cell.value, mobileLabeledRow("Name", cell.value))}
            </div>
        ),
    },
    {
        Header: "Amount",
        accessor: "amount",
        width: 120,
        style: { textAlign: "right" },
        Cell: (cell) => (
            <div style={{ textAlign: "right" }}>
                {mobileDualCell(cell.value, mobileLabeledRow("Amount", cell.value))}
            </div>
        ),
    },
    {
        Header: "Owed",
        accessor: "owed",
        width: 120,
        style: { textAlign: "right" },
        Cell: (cell) => (
            <div style={{ textAlign: "right" }} className={cell.row?.original?.owedMuted ? "text-muted" : ""}>
                {mobileDualCell(cell.value, mobileLabeledRow("Owed", cell.value))}
            </div>
        ),
    },
    {
        Header: "Settled",
        accessor: "settled",
        width: 120,
        style: { textAlign: "right" },
        Cell: (cell) => (
            <div style={{ textAlign: "right" }}>
                {mobileDualCell(cell.value, mobileLabeledRow("Settled", cell.value))}
            </div>
        ),
    },
    {
        Header: "Currency",
        accessor: "currency",
        width: 80,
        style: { textAlign: "center" },
        Cell: (cell) => (
            <div style={{ textAlign: "center" }}>
                {mobileDualCell(cell.value, mobileLabeledRow("Currency", cell.value))}
            </div>
        ),
    },
    {
        Header: "Settlement",
        accessor: "settlement",
        width: 120,
        style: { textAlign: "center" },
        Cell: (cell) => (
            <div style={{ textAlign: "center" }}>
                {mobileDualCell(cell.value, mobileLabeledRow("Settlement", cell.value))}
            </div>
        ),
    },
];
export const buildFeeRows = (fees, feeSettlementByFeeId = {}) =>
    fees.map((fee) => {
        const { computed, currency } = formatFeeAmount(fee);
        const settlementLabel = fee.settlementTypeId?.label ?? optionToCode(fee.settlementTypeId) ?? "-";
        const feeId = String(fee.feeId ?? fee.feeID ?? "");
        const settlement = feeSettlementByFeeId[feeId];
        const owedAmount = settlement?.owedAmount ?? computed;
        const settledAmount = settlement?.settledAmount ?? 0;
        return {
            name: fee.typeLabel ?? "-",
            amount: fmtRebateAmount(computed, currency),
            owed: fmtRebateAmount(owedAmount, currency),
            settled: fmtRebateAmount(settledAmount, currency),
            owedMuted: owedAmount <= 0,
            currency,
            settlement: settlementLabel,
        };
    });

const feeBatchRow = (cell) => cell.original ?? cell.row?.original;

export const buildFeeBatchModalColumns = (onToggleRow) => [
    {
        Header: "",
        accessor: "checked",
        width: 48,
        style: { textAlign: "center" },
        Cell: (cell) => {
            const row = feeBatchRow(cell);
            const checkbox = (
                <input
                    type="checkbox"
                    className="form-check-input m-0"
                    checked={!!row?.checked}
                    disabled={!!row?.disabled}
                    title={row?.disabled ? row?.note : undefined}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                        if (row?.disabled) return;
                        onToggleRow(row.feeId, { checked: e.target.checked });
                    }}
                />
            );
            return mobileActionRow(
                <div className="d-flex justify-content-center py-1">
                    {checkbox}
                </div>
            );
        },
    },
    {
        Header: "Fee",
        accessor: "name",
        width: 160,
        Cell: (cell) => {
            const row = feeBatchRow(cell);
            const content = (
                <div className={row?.disabled ? "text-muted" : ""} style={{ paddingLeft: 10 }}>
                    {cell.value}
                </div>
            );
            return mobileDualCell(content, mobileLabeledRow("Fee", cell.value));
        },
    },
    {
        Header: "Owed",
        accessor: "owedDisplay",
        width: 140,
        style: { textAlign: "right" },
        Cell: (cell) => {
            const row = feeBatchRow(cell);
            const content = (
                <div className={`text-end ${row?.disabled ? "text-muted" : ""}`}>
                    {cell.value}
                </div>
            );
            return mobileDualCell(content, mobileLabeledRow("Owed", cell.value));
        },
    },
    {
        Header: "Settlement",
        accessor: "settlementDisplay",
        width: 200,
        style: { textAlign: "right" },
        Cell: (cell) => {
            const row = feeBatchRow(cell);
            const content = (
                <div className={`text-end ${row?.disabled ? "text-muted" : ""}`} style={{ paddingRight: 10 }}>
                    {cell.value}
                </div>
            );
            return mobileDualCell(content, mobileLabeledRow("Settlement", cell.value));
        },
    },
    {
        Header: "Status",
        accessor: "note",
        width: 210,
        Cell: (cell) => {
            const status = cell.value ? (
                <span
                    className="small"
                    style={{
                        display: "inline-block",
                        paddingLeft: 10,
                        color: "#dc3545",
                    }}
                >
                    {cell.value}
                </span>
            ) : (
                <span className="small" style={{ paddingLeft: 10 }}>-</span>
            );
            return mobileDualCell(
                status,
                mobileLabeledRow("Status", cell.value || "-")
            );
        },
    },
];

export const resolveDateRange = (contract, targets) => {
    const contractFrom = contract?.StartDate ?? contract?.CTR_StartDate;
    const contractTo = contract?.EndDate ?? contract?.CTR_EndDate;
    if (contractFrom && contractTo) return { fromDate: contractFrom, toDate: contractTo };

    const targetDates = toArray(targets)
        .flatMap((t) => [t.fromDate, t.toDate])
        .filter(Boolean);
    if (!targetDates.length) return { fromDate: null, toDate: null };

    return {
        fromDate: targetDates.reduce((a, b) => (a < b ? a : b)),
        toDate: targetDates.reduce((a, b) => (a > b ? a : b)),
    };
};
