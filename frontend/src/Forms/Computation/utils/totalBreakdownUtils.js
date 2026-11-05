import {
    alwaysAppliedMonthlyRebate,
    firstMetMonth,
    formatRebateRate,
    isAlwaysAppliedTarget,
    windowLocalKey,
} from "./salesBreakdownUtils";
import { isRangeTarget, resolveTargetSalesKey } from "../../../utils/computationEngine";

const EMPTY_SALES = {
    salesAmounts: {},
    salesAmount: 0,
    salesAmountBase: 0,
    previousYearSalesAmounts: {},
    growthPercentageUSD: 0,
};

function targetDisplayName(target, evaluationResult) {
    return String(
        evaluationResult?.targetName
        ?? target?.targetName
        ?? target?.TargetName
        ?? "Target"
    );
}

/** Allocate each target's rebate onto calendar months (YYYY-MM). */
export function allocateTargetMonthContributions({
    target,
    evaluationResult,
    windows,
    salesByWindowKey,
    currency,
}) {
    const alwaysApplied = isAlwaysAppliedTarget(target, evaluationResult);
    const rangeTarget = isRangeTarget(target);
    const rebateType = String(target?.rebateValueType ?? "F").trim().toUpperCase();
    const lumpAmount = Number(evaluationResult?.rebateAmount ?? 0);
    const name = targetDisplayName(target, evaluationResult);
    const rate = rangeTarget ? null : formatRebateRate(target, currency);

    let prevSales = EMPTY_SALES;
    const slices = windows.map((window) => {
        const key = windowLocalKey(target, window);
        const cumSales = salesByWindowKey[key] ?? EMPTY_SALES;
        const rebateSlice = alwaysApplied && rebateType === "P"
            ? alwaysAppliedMonthlyRebate(target, cumSales, prevSales, currency)
            : 0;
        const row = {
            monthKey: window.key,
            label: window.label,
            toDate: window.toDate,
            sales: cumSales,
            rebateSlice: Number(rebateSlice) || 0,
        };
        prevSales = cumSales;
        return row;
    });

    let lumpIndex = -1;
    if (alwaysApplied && rebateType !== "P") {
        lumpIndex = slices.length ? slices.length - 1 : -1;
    } else if (!alwaysApplied) {
        lumpIndex = firstMetMonth(
            target,
            slices.map((s) => ({ toDate: s.toDate, sales: s.sales })),
            currency
        );
    }

    return slices
        .map((s, i) => {
            let amount = 0;
            if (alwaysApplied && rebateType === "P") amount = s.rebateSlice;
            else if (lumpIndex >= 0 && i === lumpIndex && lumpAmount > 0) amount = lumpAmount;
            return {
                kind: "target",
                id: `${resolveTargetSalesKey(target)}:${s.monthKey}`,
                targetId: resolveTargetSalesKey(target),
                monthKey: s.monthKey,
                name,
                rate,
                amount,
            };
        })
        .filter((c) => Number(c.amount) > 0);
}
