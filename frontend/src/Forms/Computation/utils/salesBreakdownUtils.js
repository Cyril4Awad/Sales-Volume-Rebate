import moment from "moment";
import {
    computeRebate,
    evaluateRangeTarget,
    evaluateTarget,
    isRangeTarget,
    resolveTargetSalesKey,
} from "../../../utils/computationEngine";

const amountInCurrency = (sales, currency) => {
    if (!sales) return 0;
    const cur = String(currency ?? "USD").trim().toUpperCase();
    if (cur && sales.salesAmounts && sales.salesAmounts[cur] != null) {
        return Number(sales.salesAmounts[cur]) || 0;
    }
    return Number(sales.salesAmountBase ?? sales.salesAmount) || 0;
};

const previousYearAmountInCurrency = (sales, currency) => {
    if (!sales) return 0;
    const cur = String(currency ?? "USD").trim().toUpperCase();
    const amounts = sales.previousYearSalesAmounts ?? {};
    if (cur && amounts[cur] != null) return Number(amounts[cur]) || 0;
    const first = Object.values(amounts)[0];
    return Number(first) || 0;
};

const emptySales = () => ({
    salesAmounts: {},
    salesAmount: 0,
    salesAmountBase: 0,
    previousYearSalesAmounts: {},
    previousYearSalesQuantity: 0,
    growthPercentageUSD: 0,
});

export function buildMonthEndWindows(targetStart, targetEnd, asOf) {
    const start = moment(targetStart).startOf("day");
    const end = moment(targetEnd).startOf("day");
    const asOfDay = moment(asOf).startOf("day");
    const capExclusive = asOfDay.isBefore(end) ? asOfDay.clone().add(1, "day") : end.clone();
    if (!start.isValid() || !capExclusive.isValid() || !capExclusive.isAfter(start)) return [];

    const windows = [];
    let cursor = start.clone();
    while (cursor.isSameOrBefore(capExclusive, "day")) {
        const nextMonthStart = cursor.clone().add(1, "month").startOf("month");
        const toDate = moment.min(nextMonthStart, capExclusive);
        windows.push({
            label: cursor.format("MMM YYYY"),
            key: cursor.format("YYYY-MM"),
            fromDate: start.toDate(),
            toDate: toDate.toDate(),
            isPartial: false,
        });
        cursor = nextMonthStart.clone();
    }

    if (windows.length > 1) {
        const last = windows[windows.length - 1];
        const lastTo = moment(last.toDate).startOf("day");
        const lastKeyMonth = moment(last.key, "YYYY-MM");
        if (lastTo.date() === 1 && lastTo.isSame(lastKeyMonth, "month")) {
            windows.pop();
        }
    }

    if (windows.length && asOfDay.isBefore(end)) {
        windows[windows.length - 1].isPartial = true;
    }

    return windows;
}

export function monthlySalesSlice(cumThisEnd, cumPrevEnd, contractCurrency) {
    return amountInCurrency(cumThisEnd, contractCurrency) - amountInCurrency(cumPrevEnd, contractCurrency);
}

export function alwaysAppliedMonthlyRebate(target, salesDtoThisEnd, salesDtoPrevEnd, contractCurrency) {
    const rebateType = String(target?.rebateValueType ?? "F").trim().toUpperCase();
    if (rebateType !== "P") return null;
    const thisRebate = computeRebate(target, salesDtoThisEnd ?? emptySales(), contractCurrency);
    const prevRebate = computeRebate(target, salesDtoPrevEnd ?? emptySales(), contractCurrency);
    return thisRebate - prevRebate;
}

export function firstMetMonth(target, monthlySalesDtos, contractCurrency = null) {
    if (!Array.isArray(monthlySalesDtos) || monthlySalesDtos.length === 0) return -1;

    const range = isRangeTarget(target);

    for (let i = 0; i < monthlySalesDtos.length; i += 1) {
        const entry = monthlySalesDtos[i];
        if (!entry) continue;
        const monthEnd = entry.toDate;
        const sales = entry.sales ?? emptySales();
        const cloned = { ...target, toDate: monthEnd };
        const evalAsOf = moment(monthEnd).endOf("day");
        let result;
        try {
            result = range
                ? evaluateRangeTarget(cloned, sales, { asOf: evalAsOf, contractCurrency })
                : evaluateTarget(cloned, sales, { asOf: evalAsOf, contractCurrency });
        } catch {
            continue;
        }

        const tiers = result.tierResults || result.tierResults || [];
        const groups = result.groupResults || result.groupResults || [];
        const met = range
            ? tiers.some((t) => t.exceeded === true)
            : groups.some((g) => g.passed === true);

        if (met) return i;
    }

    return -1;
}

export function monthlyGrowthSlice(cumThisEnd, cumPrevEnd, contractCurrency) {
    const salesSlice = monthlySalesSlice(cumThisEnd, cumPrevEnd, contractCurrency);
    const prevYearSlice =
        previousYearAmountInCurrency(cumThisEnd, contractCurrency)
        - previousYearAmountInCurrency(cumPrevEnd, contractCurrency);
    const growthPct = prevYearSlice === 0
        ? 0
        : ((salesSlice - prevYearSlice) / prevYearSlice) * 100;
    return {
        previousYearSales: prevYearSlice,
        growthPct,
    };
}

export function hasGrowthCondition(target) {
    if (!target) return false;

    if (isRangeTarget(target)) {
        const explicit = String(
            target.tierConditionType ?? target.TierConditionType ?? ""
        ).trim().toUpperCase();
        if (explicit === "G") return true;
        const tiers = target.tiers ?? target.Tiers ?? target.rangeTiers ?? [];
        return (tiers || []).some((t) => String(t.conditionType ?? "").trim().toUpperCase() === "G");
    }

    const groups = target.conditionGroups ?? [];
    if (groups.length) {
        return groups.some((g) =>
            (g.conditions || []).some((c) => String(c.conditionType ?? "").trim().toUpperCase() === "G")
        );
    }

    const conditions = target.conditions ?? [];
    return (conditions || []).some((c) => String(c.conditionType ?? "").trim().toUpperCase() === "G");
}

export function isAlwaysAppliedTarget(target, evaluationResult) {
    if (isRangeTarget(target)) return false;
    if ((evaluationResult?.groupResults ?? []).length > 0) return false;
    const groups = target?.conditionGroups ?? [];
    if (groups.some((g) => (g.conditions || []).length > 0)) return false;
    const conditions = (target?.conditions || []).filter(
        (c) => c.conditionType && c.operator && c.value !== "" && c.value != null
    );
    return conditions.length === 0;
}

export function windowLocalKey(target, window) {
    const salesKey = resolveTargetSalesKey(target);
    return `${salesKey}:${window.key}`;
}

export function formatRebateRate(target, currency = "USD") {
    const type = String(target?.rebateValueType ?? "F").trim().toUpperCase();
    const value = Number(target?.rebateValue ?? 0);
    if (type === "P") return `${value}%`;
    const cur = String(currency ?? "USD").trim() || "USD";
    return `${Number(value).toLocaleString()} ${cur}`;
}

export { amountInCurrency };
