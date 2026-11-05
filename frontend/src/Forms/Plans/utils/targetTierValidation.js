import { conditionTypeOptions } from "../constants/planWorkspaceConstants";
import { normalizeRebateValueType } from "../../../utils/planWorkspaceValidation";
import { fmtBuiltMetric, fmtBuiltQuantity } from "./targetConditionValidation";

const isFilled = (v) => v !== "" && v != null && v !== undefined;

const parseNum = (v) => {
    if (!isFilled(v)) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
};

const typeLabel = (type) =>
    conditionTypeOptions.find((o) => o.value === type)?.label?.toLowerCase() || "field";

const hasSelectValue = (sel) => {
    if (sel == null || sel === "") return false;
    if (typeof sel === "object") {
        const v = sel.value;
        return v != null && String(v).trim() !== "";
    }
    return String(sel).trim() !== "";
};

/** Use target type, or first legacy per-row conditionType when type not set yet. */
export function resolveTierConditionType(tierConditionType, tiers = []) {
    if (tierConditionType) return tierConditionType;
    const legacy = (tiers || []).find((r) => r.conditionType);
    return legacy?.conditionType || null;
}

function currencyCode(row) {
    const c = row.currency;
    if (!c) return "";
    if (typeof c === "object") return c.value ?? c.label ?? "";
    return String(c);
}

export function resolveTierCurrencyCode(row, contractCurrencyCode = "") {
    const fromRow = currencyCode(row);
    if (fromRow) return fromRow;
    const fromContract = String(contractCurrencyCode ?? "").trim();
    return fromContract || "";
}

function hasTierCurrency(row, contractCurrencyCode = "") {
    return !!resolveTierCurrencyCode(row, contractCurrencyCode);
}

function formatRebatePart(row, contractCurrencyCode = "") {
    const rebateType = normalizeRebateValueType(row.rebateValueType);
    const val = isFilled(row.rebateValue) ? row.rebateValue : "?";
    if (rebateType === "P") return `${val}%`;
    const code = resolveTierCurrencyCode(row, contractCurrencyCode);
    return code ? `${val} ${code}` : String(val);
}

const salesCurrencyCode = (salesAmountCurrency) => {
    if (!salesAmountCurrency) return "";
    if (typeof salesAmountCurrency === "object") {
        return salesAmountCurrency.value ?? salesAmountCurrency.label ?? "";
    }
    return String(salesAmountCurrency);
};

/**
 * Human-readable tier ranges for display. Returns "—", a single line string, or an array of lines.
 */
export function formatTiersBuiltLabel(
    tiers = [],
    tierConditionType,
    salesAmountCurrency = null,
    contractCurrencyCode = ""
) {
    const type = resolveTierConditionType(tierConditionType, tiers);
    if (!type || !tiers?.length) return "-";

    const valueSuffix =
        type === "S" && salesCurrencyCode(salesAmountCurrency)
            ? ` ${salesCurrencyCode(salesAmountCurrency)}`
            : type === "Q" ? " Pcs"
                : type === "G" ? "%"
                    : "";

    const fieldLabel =
        type === "S" ? "Sales Amount"
            : type === "Q" ? "Sales Quantity"
                : type === "G" ? "Growth"
                    : typeLabel(type);

    const sorted = [...tiers]
        .filter((t) => isFilled(t.value) && parseNum(t.value) !== null)
        .sort((a, b) => parseNum(a.value) - parseNum(b.value));

    if (!sorted.length) return "-";

    const lines = sorted.map((row) => {
        const threshold = parseNum(row.value);
        const thresholdStr =
            type === "S" ? fmtBuiltMetric(threshold)
                : type === "Q" ? fmtBuiltQuantity(threshold)
                    : threshold;
        return `${fieldLabel} > ${thresholdStr}${valueSuffix} -> Rebate = ${formatRebatePart(row, contractCurrencyCode)}`;
    });

    return lines.length === 1 ? lines[0] : lines;
}

export function isTierRowComplete(row, contractCurrencyCode = "") {
    const rebateType = normalizeRebateValueType(row.rebateValueType);
    if (!isFilled(row.value) || !isFilled(row.rebateValue) || !rebateType) return false;
    if (rebateType === "F" && !hasTierCurrency(row, contractCurrencyCode)) return false;
    return true;
}

function isTierRowPartial(row, contractCurrencyCode = "") {
    const rebateType = normalizeRebateValueType(row.rebateValueType);
    const any =
        isFilled(row.value) ||
        isFilled(row.rebateValue) ||
        (rebateType && row.rebateValueType != null && row.rebateValueType !== "") ||
        hasTierCurrency(row, contractCurrencyCode);
    return any && !isTierRowComplete(row, contractCurrencyCode);
}

/** Live validation for the range builder UI. */
export function validateTiers(
    tiers = [],
    tierConditionType,
    salesAmountCurrency = null,
    contractCurrencyCode = ""
) {
    const errors = [];
    const warnings = [];
    const rows = tiers || [];
    const type = resolveTierConditionType(tierConditionType, rows);
    const builtLabel = formatTiersBuiltLabel(rows, type, salesAmountCurrency, contractCurrencyCode);

    if (!type) {
        errors.push("Please select a type for the range");
    }

    if (type && rows.length === 0) {
        errors.push("Add at least one range row");
    }

    if (rows.length === 1) {
        warnings.push("Only one range row defined - consider adding more rows");
    }

    rows.forEach((row, idx) => {
        const tierNum = idx + 1;
        if (isTierRowPartial(row, contractCurrencyCode)) {
            errors.push(
                `Range row ${tierNum} is incomplete - value, rebate type, and rebate amount are required`
            );
        }
    });

    const valueCounts = new Map();
    let prevVal = null;

    rows.forEach((row, idx) => {
        if (!isFilled(row.value)) return;
        const n = parseNum(row.value);
        const tierNum = idx + 1;

        if (n === null) return;

        if (n <= 0) {
            if (!errors.includes("Range values must be greater than 0")) {
                errors.push("Range values must be greater than 0");
            }
        }

        if (type === "S" && !Number.isInteger(n)) {
            errors.push(`Range row ${tierNum}: sales amount must be a whole number`);
        }

        const count = valueCounts.get(n) || 0;
        valueCounts.set(n, count + 1);
        if (count >= 1) {
            errors.push(`Range values must be unique - duplicate value ${row.value} found`);
        }

        if (prevVal !== null && n <= prevVal) {
            errors.push(
                `Range row ${tierNum} value must be greater than range row ${tierNum - 1} value (${prevVal})`
            );
        }
        prevVal = n;
    });

    return {
        errors: [...new Set(errors)],
        warnings: [...new Set(warnings)],
        builtLabel,
    };
}

/** Hard errors for save/apply (prefixed by caller). */
export function getTierSaveErrors(target, contractCurrencyCode = "") {
    const name = target.targetName?.trim() || "Unnamed target";
    const type = resolveTierConditionType(target.tierConditionType, target.tiers);
    const { errors } = validateTiers(
        target.tiers || [],
        type,
        target.salesAmountCurrency,
        contractCurrencyCode
    );
    return errors.map((e) => `Target "${name}": ${e}`);
}
