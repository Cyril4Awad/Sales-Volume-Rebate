/** Upper bound for sales amount / sales quantity threshold inputs. */
export const MAX_SALES_METRIC_VALUE = 999999999999999;

export function isLbpCurrency(code) {
    return String(code ?? "").trim().toUpperCase() === "LBP";
}

/** decimalScale for fixed-amount inputs tied to contract currency (LBP = whole numbers only). */
export function moneyDecimalScale(contractCurrencyCode, defaultScale = 3) {
    return isLbpCurrency(contractCurrencyCode) ? 0 : defaultScale;
}

/** Placeholder for threshold/value input by condition type (S / Q / G). */
export function valuePlaceholderForType(conditionType) {
    if (conditionType === "S") return "Amount";
    if (conditionType === "Q") return "Quantity";
    if (conditionType === "G") return "Percentage";
    return "Value";
}

/** Numeric input constraints by condition type (S / Q / G). */
export function numericPropsForType(conditionType) {
    if (conditionType === "Q") {
        return {
            decimalScale: 0,
            minValue: 0,
            allowNegative: false,
            maxValue: MAX_SALES_METRIC_VALUE,
        };
    }
    if (conditionType === "S") {
        return {
            decimalScale: 0,
            minValue: 0,
            allowNegative: false,
            maxValue: MAX_SALES_METRIC_VALUE,
        };
    }
    if (conditionType === "G") {
        return { decimalScale: 2, allowNegative: false, maxValue: 100 };
    }
    return {};
}
