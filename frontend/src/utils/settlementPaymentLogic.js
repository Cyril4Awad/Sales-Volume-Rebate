import moment from "moment";
import { fmtRebateAmount } from "../Forms/Computation/utils/computationDisplayUtils";
import {
    TARGET_STATE,
    evaluateTarget,
    isRangeTarget,
    isTargetInProgress,
    resolveSalesBaseForRebate,
    resolveTargetSalesKey,
} from "./computationEngine";

const PERIOD_LENGTH_MIN = 1;
const PERIOD_LENGTH_MAX = 12;

export const SETTLEMENT_STATUS = {
    ELIGIBLE: "eligible",
    BLOCKED: "blocked",
    PERMANENT: "permanent",
};

export function formatSettlementDate(date) {
    if (!date) return "-";
    const m = moment(date);
    return m.isValid() ? m.format("DD-MM-YYYY") : "-";
}

/** Process amount with optional period suffix when periodsCount >= 1 and amount > 0. */
export function formatProcessAmountWithPeriods(amount, currency, periodsCount) {
    const amt = Number(amount ?? 0);
    const cur = String(currency ?? "USD").trim() || "USD";
    const base = `${fmtRebateAmount(amt, cur)} ${cur}`;
    if (periodsCount >= 1 && amt > 0) {
        const label = periodsCount === 1 ? "1 period" : `${periodsCount} periods`;
        return `${base} (${label})`;
    }
    return base;
}

export function optionToValue(opt) {
    if (opt == null) return null;
    if (typeof opt === "object") return opt.value ?? opt.label ?? null;
    return String(opt);
}

export function isConditionedTarget(target) {
    return isRangeTarget(target) || (target?.conditionGroups?.length ?? 0) > 0;
}

export function isAlwaysAppliedTarget(target) {
    return !isConditionedTarget(target);
}

export function normalizeSettlementPayments(rows = []) {
    return (Array.isArray(rows) ? rows : []).map((r) => ({
        settlementPaymentId: r.settlementPaymentID ?? r.SettlementPaymentID ?? r.stp_SettlementPaymentID,
        resultType: r.resultType ?? r.ResultType ?? r.stp_ResultType,
        targetId: r.targetID ?? r.TargetID ?? r.stp_TargetID,
        feeId: r.feeID ?? r.FeeID ?? r.stp_FeeID,
        amountProcessed: Number(r.amountProcessed ?? r.AmountProcessed ?? 0),
        amountLeft: Number(r.amountLeft ?? r.AmountLeft ?? 0),
        totalAmountAtProcess: Number(r.totalAmountAtProcess ?? r.TotalAmountAtProcess ?? 0),
        totalSalesAtProcess: r.totalSalesAtProcess ?? r.TotalSalesAtProcess ?? null,
        currency: r.currency ?? r.Currency ?? "USD",
        processDate: r.processDate ?? r.ProcessDate ?? null,
        periodStart: r.periodStart ?? r.PeriodStart ?? r.stp_PeriodStart ?? null,
        periodEnd: r.periodEnd ?? r.PeriodEnd ?? r.stp_PeriodEnd ?? null,
    }));
}

export function paymentsForTarget(payments, targetId) {
    const id = String(targetId ?? "");
    return payments.filter(
        (p) => p.resultType === "T" && String(p.targetId ?? "") === id
    );
}

export function paymentsForFee(payments, feeId) {
    const id = String(feeId ?? "");
    return payments.filter(
        (p) => p.resultType === "F" && String(p.feeId ?? "") === id
    );
}

/** Payments that have both period dates (usable for month-level paid highlighting). */
export function paymentsWithPeriodRange(payments = []) {
    return (payments ?? []).filter((p) => {
        const start = moment(p.periodStart);
        const end = moment(p.periodEnd);
        return start.isValid() && end.isValid();
    });
}

export function paymentsWithPeriodForTarget(payments, targetId) {
    return paymentsWithPeriodRange(paymentsForTarget(payments, targetId));
}

export function paymentsWithPeriodForFee(payments, feeId) {
    return paymentsWithPeriodRange(paymentsForFee(payments, feeId));
}

/** Inclusive date-range overlap. */
export function rangesOverlap(aStart, aEnd, bStart, bEnd) {
    const aS = moment(aStart).startOf("day");
    const aE = moment(aEnd).startOf("day");
    const bS = moment(bStart).startOf("day");
    const bE = moment(bEnd).startOf("day");
    if (!aS.isValid() || !aE.isValid() || !bS.isValid() || !bE.isValid()) return false;
    return aS.isSameOrBefore(bE, "day") && bS.isSameOrBefore(aE, "day");
}

/**
 * True when [monthStart, monthEnd] overlaps any payment with non-null period range.
 * Pass already-filtered payments (e.g. for one target/fee) or mixed; null-period rows are skipped.
 */
export function monthOverlapsPaidPeriod(monthStart, monthEnd, payments = []) {
    return paymentsWithPeriodRange(payments).some((p) =>
        rangesOverlap(monthStart, monthEnd, p.periodStart, p.periodEnd)
    );
}

/** Calendar month key YYYY-MM → inclusive start/end for overlap checks. */
export function monthKeyToRange(monthKey) {
    const start = moment(`${monthKey}-01`, "YYYY-MM-DD").startOf("day");
    if (!start.isValid()) return null;
    return {
        start: start.toDate(),
        end: start.clone().endOf("month").startOf("day").toDate(),
    };
}

export function monthKeyOverlapsPaidPeriod(monthKey, payments = []) {
    const range = monthKeyToRange(monthKey);
    if (!range) return false;
    return monthOverlapsPaidPeriod(range.start, range.end, payments);
}

export function sumPaid(payments) {
    return payments.reduce((sum, p) => sum + (p.amountProcessed ?? 0), 0);
}

export function lastProcessDate(payments) {
    if (!payments.length) return null;
    return payments.reduce((latest, p) => {
        const d = p.processDate ? moment(p.processDate) : null;
        if (!d?.isValid()) return latest;
        if (!latest || d.isAfter(latest)) return d;
        return latest;
    }, null);
}

export function buildSettlementTypesMap(settlementTypeOptions = []) {
    const map = {};
    settlementTypeOptions.forEach((opt) => {
        const key = optionToValue(opt);
        if (key != null) map[String(key)] = opt;
    });
    return map;
}

export function getPeriodLength(settlementTypeId, settlementTypesMap = {}) {
    const key = optionToValue(settlementTypeId);
    if (key == null) {
        return {
            valid: false,
            value: null,
            message: "Settlement type has an invalid period length. Update the settlement type definition.",
        };
    }
    const opt = settlementTypesMap[String(key)];
    const raw = Number(opt?.periodLength ?? opt?.PeriodLength);
    if (!Number.isFinite(raw) || raw < PERIOD_LENGTH_MIN || raw > PERIOD_LENGTH_MAX) {
        return {
            valid: false,
            value: null,
            message: "Settlement type has an invalid period length. Update the settlement type definition.",
        };
    }
    return { valid: true, value: raw, message: null };
}

function capAsOfDate(now, contractEndDate = null, targetEndDate = null) {
    let asOf = moment(now).startOf("day");
    for (const endRaw of [contractEndDate, targetEndDate]) {
        if (!endRaw) continue;
        const end = moment(endRaw).startOf("day");
        if (end.isValid()) asOf = moment.min(asOf, end);
    }
    return asOf;
}

/** Boundary k (1-based): fixedAnchor + k * periodLength months. */
export function nthPeriodBoundary(fixedAnchor, periodLength, k) {
    if (!fixedAnchor || periodLength == null || k < 1) return null;
    return moment(fixedAnchor).startOf("day").add(k * periodLength, "months");
}

/**
 * Inclusive calendar range of settlement cycles covered by this payment
 * (JS port of SettlementPaymentCalculator.TryResolveCoveredPeriodRange).
 * PeriodEnd = last calendar day of the last covered cycle.
 * @returns {{ periodStart: moment.Moment, periodEnd: moment.Moment } | null}
 */
export function tryResolveCoveredPeriodRange(fixedAnchor, periodLength, periodsPaid, periodsCount) {
    const length = Number(periodLength);
    const paid = Number(periodsPaid);
    const count = Number(periodsCount);
    if (
        !fixedAnchor
        || !Number.isFinite(length)
        || length < PERIOD_LENGTH_MIN
        || length > PERIOD_LENGTH_MAX
        || !Number.isFinite(paid)
        || paid < 0
        || !Number.isFinite(count)
        || count <= 0
    ) {
        return null;
    }

    const periodStart = paid === 0
        ? moment(fixedAnchor).startOf("day")
        : nthPeriodBoundary(fixedAnchor, length, paid);
    const dueBoundary = nthPeriodBoundary(fixedAnchor, length, paid + count);
    if (!periodStart?.isValid() || !dueBoundary?.isValid()) return null;

    return {
        periodStart,
        periodEnd: dueBoundary.clone().startOf("day").subtract(1, "day"),
    };
}

/** JS port of SettlementPaymentCalculator.IsAlwaysAppliedFinalCatchUpDue. */
export function isAlwaysAppliedFinalCatchUpDue(
    targetToDate,
    now,
    periodsCount,
    currentTotalAtTargetEnd,
    alreadyPaid
) {
    if (periodsCount !== 0 || !targetToDate) return false;
    const end = moment(targetToDate).startOf("day");
    const asOf = moment(now).startOf("day");
    if (!end.isValid() || !asOf.isValid()) return false;
    return asOf.isAfter(end)
        && Number(currentTotalAtTargetEnd) > Number(alreadyPaid);
}

/**
 * JS port of SettlementPaymentCalculator.TryResolveFinalCatchUpPeriodRange.
 * @returns {{ periodStart: moment.Moment, periodEnd: moment.Moment } | null}
 */
export function tryResolveFinalCatchUpPeriodRange(
    fixedAnchor,
    periodLength,
    periodsPaid,
    targetFromDate,
    targetToDate
) {
    const length = Number(periodLength);
    const paid = Number(periodsPaid);
    if (
        !fixedAnchor
        || !targetFromDate
        || !targetToDate
        || !Number.isFinite(length)
        || length < PERIOD_LENGTH_MIN
        || length > PERIOD_LENGTH_MAX
        || !Number.isFinite(paid)
        || paid < 0
    ) {
        return null;
    }

    const periodEnd = moment(targetToDate).startOf("day").subtract(1, "day");
    const periodStart = paid === 0
        ? moment(targetFromDate).startOf("day")
        : nthPeriodBoundary(fixedAnchor, length, paid);
    if (!periodStart?.isValid() || !periodEnd?.isValid() || periodStart.isAfter(periodEnd)) {
        return null;
    }

    return { periodStart, periodEnd };
}

/** Inclusive: boundary counts as passed when boundary.date <= asOfDate.date. */
export function countBoundariesPassed(fixedAnchor, periodLength, now, contractEndDate = null, targetEndDate = null) {
    if (!fixedAnchor || periodLength == null) return 0;
    const asOf = capAsOfDate(now, contractEndDate, targetEndDate);
    let count = 0;
    for (let k = 1; k <= 120 * 12; k += 1) {
        const boundary = nthPeriodBoundary(fixedAnchor, periodLength, k);
        if (!boundary?.isValid() || boundary.isAfter(asOf)) break;
        count += 1;
    }
    return count;
}

const PERIODS_PAID_RATIO_EPSILON = 0.01;

export function countSettlementPeriodsInContract(contractStart, contractEnd, periodLength) {
    if (!contractStart || !contractEnd || periodLength == null) return 0;
    return countBoundariesPassed(contractStart, periodLength, contractEnd, contractEnd);
}

export function periodsPaidCountForFee(alreadyPaid, feeAmount, periodLength, contractStart, contractEnd) {
    const perPeriod = computeFeeSettlementAmount(feeAmount, periodLength, contractStart, contractEnd);
    if (perPeriod <= 0) return 0;
    const ratio = alreadyPaid / perPeriod;
    const rounded = Math.round(ratio);
    if (Math.abs(ratio - rounded) < PERIODS_PAID_RATIO_EPSILON) return rounded;
    return Math.floor((alreadyPaid + 1e-9) / perPeriod);
}

export function periodsPaidCountForTarget(fixedAnchor, periodLength, payments, contractEndDate = null, targetEndDate = null) {
    const last = lastProcessDate(payments);
    if (!last) return 0;
    return countBoundariesPassed(fixedAnchor, periodLength, last, contractEndDate, targetEndDate);
}

export function periodsOwed(fixedAnchor, periodLength, periodsPaidCount, now, contractEndDate = null, targetEndDate = null) {
    const passed = countBoundariesPassed(fixedAnchor, periodLength, now, contractEndDate, targetEndDate);
    return Math.max(0, passed - periodsPaidCount);
}

export function nextScheduledBoundary(fixedAnchor, periodLength, periodsPaidCount) {
    return nthPeriodBoundary(fixedAnchor, periodLength, periodsPaidCount + 1);
}

export function nextEligibleDate(fixedAnchor, periodLength, periodsPaidCount) {
    return formatSettlementDate(nextScheduledBoundary(fixedAnchor, periodLength, periodsPaidCount));
}

export function isPeriodDue(fixedAnchor, periodLength, periodsPaidCount, now = moment(), contractEndDate = null, targetEndDate = null) {
    return periodsOwed(fixedAnchor, periodLength, periodsPaidCount, now, contractEndDate, targetEndDate) > 0;
}

/** @deprecated Use periodsOwed with fixed anchor and periodsPaidCount. */
export function countElapsedPeriods(fixedAnchor, periodLength, now, contractEndDate, periodsPaidCount = 0, targetEndDate = null) {
    return periodsOwed(fixedAnchor, periodLength, periodsPaidCount, now, contractEndDate, targetEndDate);
}

export function computeCurrentTotal(target, sales, contractCurrency, now = moment()) {
    const result = evaluateTarget(target, sales, { asOf: now, contractCurrency });
    if (result.rebateAmounts && typeof result.rebateAmounts === "object") {
        return Number(result.rebateAmounts[contractCurrency] ?? result.rebateAmount ?? 0);
    }
    return Number(result.rebateAmount ?? 0);
}

/** Rebate total as of target end (Always Applied final catch-up gate). */
export function computeAlwaysAppliedTotalAtTargetEnd(target, sales, contractCurrency, targetEndDate) {
    const asOf = targetEndDate
        ? moment(targetEndDate).startOf("day").add(1, "day")
        : moment();
    return computeCurrentTotal(target, sales, contractCurrency, asOf);
}

export function computeTargetLiveTotal(target, targetResult, sales, contractCurrency, now = moment()) {
    if (isConditionedTarget(target)) {
        if (targetResult?.state === TARGET_STATE.MISSED) return 0;
        if (isTargetInProgress(target?.toDate ?? target?.ToDate, now)) return 0;
        if (targetResult?.state === TARGET_STATE.ACHIEVED) {
            if (targetResult.rebateAmounts && typeof targetResult.rebateAmounts === "object") {
                return Number(targetResult.rebateAmounts[contractCurrency] ?? targetResult.rebateAmount ?? 0);
            }
            return Number(targetResult.rebateAmount ?? 0);
        }
        return 0;
    }
    return computeCurrentTotal(target, sales, contractCurrency, now);
}

export function computeFeeSettlementAmount(feeAmount, periodLength, contractStart, contractEnd) {
    const amount = Number(feeAmount ?? 0);
    const period = Number(periodLength);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(period) || period < PERIOD_LENGTH_MIN) {
        return 0;
    }
    if (!contractStart || !contractEnd) {
        return amount / (12 / period);
    }
    const totalPeriods = countSettlementPeriodsInContract(contractStart, contractEnd, period);
    if (totalPeriods <= 0) return amount;
    return amount / totalPeriods;
}

export function computeFeeProcessAmount(
    feeAmount,
    periodLength,
    amountLeft,
    periodsCount = 1,
    contractStart,
    contractEnd
) {
    const left = Number(amountLeft ?? 0);
    if (left <= 0 || periodsCount <= 0) return 0;
    const settlementAmount = computeFeeSettlementAmount(feeAmount, periodLength, contractStart, contractEnd);
    return Math.min(settlementAmount * periodsCount, left);
}

export function getTargetSettlementDisplay({
    target,
    targetResult,
    sales,
    contractCurrency,
    payments = [],
    now = moment(),
}) {
    const targetId = target?.targetId ?? target?.targetID ?? target?.TargetID;
    const settledAmount = sumPaid(paymentsForTarget(payments, targetId));
    const currentTotal = computeTargetLiveTotal(
        target,
        targetResult,
        sales,
        contractCurrency,
        now
    );
    const owedAmount = Math.max(0, currentTotal - settledAmount);
    return { owedAmount, settledAmount, currentTotal, currency: contractCurrency ?? "USD" };
}

export function getFeeSettlementDisplay({
    fee,
    payments = [],
    contractCurrency,
}) {
    const feeId = fee?.feeId ?? fee?.feeID ?? fee?.FeeID;
    const settledAmount = sumPaid(paymentsForFee(payments, feeId));
    const feeAmount = Number(fee?.amount ?? 0);
    const owedAmount = Math.max(0, feeAmount - settledAmount);
    const currency = contractCurrency
        ?? (typeof fee?.currency === "object" ? fee.currency?.value ?? fee.currency?.label : fee?.currency)
        ?? "USD";
    return { owedAmount, settledAmount, feeAmount, currency: String(currency).trim() || "USD" };
}

export function sumSettlementTotals({
    targets = [],
    targetResults = [],
    salesByTargetId = {},
    fees = [],
    payments = [],
    contractCurrency = "USD",
}) {
    let rebateOwed = 0;
    let rebateSettled = 0;
    (targetResults || []).forEach((targetResult) => {
        const resultKey = String(targetResult.targetId ?? "");
        const target = targets.find((t) => resolveTargetSalesKey(t) === resultKey);
        if (!target) return;
        const sales = salesByTargetId[resultKey] ?? {};
        const { owedAmount, settledAmount } = getTargetSettlementDisplay({
            target,
            targetResult,
            sales,
            contractCurrency,
            payments,
        });
        rebateOwed += owedAmount;
        rebateSettled += settledAmount;
    });

    let feesOwed = 0;
    let feesSettled = 0;
    fees.forEach((fee) => {
        const { owedAmount, settledAmount } = getFeeSettlementDisplay({ fee, payments, contractCurrency });
        feesOwed += owedAmount;
        feesSettled += settledAmount;
    });

    return {
        rebateOwed,
        rebateSettled,
        feesOwed,
        feesSettled,
        grandOwed: rebateOwed + feesOwed,
        grandSettled: rebateSettled + feesSettled,
    };
}

export function getTargetEvaluation(target, sales, contractCurrency, now = moment()) {
    return evaluateTarget(target, sales, { asOf: now, contractCurrency });
}

function baseEligibility(status, reason, message, showProcess, extras = {}) {
    return { status, reason, message, showProcess, ...extras };
}

export function getConditionedTargetEligibility({
    target,
    targetResult,
    sales,
    contractCurrency,
    payments = [],
    now = moment(),
}) {
    const display = getTargetSettlementDisplay({
        target,
        targetResult,
        sales,
        contractCurrency,
        payments,
        now,
    });
    const targetId = target?.targetId ?? target?.targetID ?? target?.TargetID;
    const rows = paymentsForTarget(payments, targetId);
    const alreadyPaid = sumPaid(rows);
    const toDate = target?.toDate ?? target?.ToDate;
    const inProgress = isTargetInProgress(toDate, now);
    const increment = display.owedAmount;

    if (inProgress) {
        return baseEligibility(
            SETTLEMENT_STATUS.BLOCKED,
            "in_progress",
            `This target is still in progress. Settlement is available once the target period ends (${formatSettlementDate(toDate)}).`,
            true,
            { ...display, increment }
        );
    }

    if (targetResult?.state === TARGET_STATE.MISSED) {
        return baseEligibility(
            SETTLEMENT_STATUS.PERMANENT,
            "missed",
            "This target was missed. There is no rebate to process.",
            false,
            { ...display, increment: 0 }
        );
    }

    if (rows.length > 0 || alreadyPaid > 0) {
        return baseEligibility(
            SETTLEMENT_STATUS.PERMANENT,
            "fully_settled",
            "This target has already been fully settled.",
            false,
            { ...display, increment: 0 }
        );
    }

    if (targetResult?.state === TARGET_STATE.ACHIEVED && increment > 0) {
        return baseEligibility(SETTLEMENT_STATUS.ELIGIBLE, "ready", null, true, {
            ...display,
            increment,
        });
    }

    return baseEligibility(
        SETTLEMENT_STATUS.BLOCKED,
        "not_achieved",
        "This target is not eligible for settlement.",
        true,
        { ...display, increment: 0 }
    );
}

export function getAlwaysAppliedTargetEligibility({
    target,
    sales,
    contractCurrency,
    payments = [],
    settlementTypesMap = {},
    contractEndDate = null,
    now = moment(),
}) {
    const targetResult = evaluateTarget(target, sales, { asOf: now, contractCurrency });
    const display = getTargetSettlementDisplay({
        target,
        targetResult,
        sales,
        contractCurrency,
        payments,
        now,
    });
    const { owedAmount: increment, settledAmount: alreadyPaid, currentTotal } = display;
    const rows = paymentsForTarget(payments, target?.targetId ?? target?.targetID);
    const period = getPeriodLength(target?.settlementTypeId, settlementTypesMap);
    const toDate = target?.toDate ?? target?.ToDate;
    const inProgress = isTargetInProgress(toDate, now);
    const withPeriods = (extras) => ({ periodsCount: 0, ...extras });

    if (!period.valid) {
        return baseEligibility(SETTLEMENT_STATUS.BLOCKED, "invalid_period", period.message, true, withPeriods({
            ...display,
            currentTotal,
            alreadyPaid,
            increment,
        }));
    }

    const fixedAnchor = target?.fromDate ?? target?.FromDate;
    const targetEndDate = toDate ?? null;
    const periodsPaid = periodsPaidCountForTarget(fixedAnchor, period.value, rows, contractEndDate, targetEndDate);
    const periodsCount = periodsOwed(fixedAnchor, period.value, periodsPaid, now, contractEndDate, targetEndDate);

    if (periodsCount === 0) {
        const targetEnded = toDate && moment(now).startOf("day").isAfter(moment(toDate), "day");
        if (targetEnded) {
            const totalAtEnd = computeAlwaysAppliedTotalAtTargetEnd(
                target,
                sales,
                contractCurrency,
                toDate
            );
            const finalIncrement = Math.max(0, totalAtEnd - alreadyPaid);
            if (isAlwaysAppliedFinalCatchUpDue(
                toDate,
                now,
                periodsCount,
                totalAtEnd,
                alreadyPaid
            )) {
                return baseEligibility(SETTLEMENT_STATUS.ELIGIBLE, "final_catch_up", null, true, withPeriods({
                    ...display,
                    currentTotal: totalAtEnd,
                    alreadyPaid,
                    increment: finalIncrement,
                    isFinalCatchUp: true,
                }));
            }
            return baseEligibility(
                SETTLEMENT_STATUS.PERMANENT,
                "target_ended",
                `Target ended on ${formatSettlementDate(toDate)}; no further settlements are due.`,
                false,
                withPeriods({ ...display, currentTotal: totalAtEnd, alreadyPaid, increment: finalIncrement })
            );
        }
        return baseEligibility(
            SETTLEMENT_STATUS.BLOCKED,
            "period_not_due",
            `Next settlement available starting ${nextEligibleDate(fixedAnchor, period.value, periodsPaid)}.`,
            true,
            withPeriods({ ...display, currentTotal, alreadyPaid, increment })
        );
    }

    if (inProgress) {
        if (increment <= 0) {
            return baseEligibility(
                SETTLEMENT_STATUS.BLOCKED,
                "nothing_to_pay",
                "No new rebate has accrued.",
                true,
                withPeriods({ ...display, currentTotal, alreadyPaid, increment })
            );
        }
        return baseEligibility(SETTLEMENT_STATUS.ELIGIBLE, "ready", null, true, withPeriods({
            ...display,
            currentTotal,
            alreadyPaid,
            increment,
            periodsCount,
        }));
    }

    if (increment <= 0 && alreadyPaid > 0) {
        return baseEligibility(
            SETTLEMENT_STATUS.PERMANENT,
            "fully_settled",
            "This target has been fully settled.",
            false,
            withPeriods({ ...display, currentTotal, alreadyPaid, increment: 0 })
        );
    }

    if (increment <= 0) {
        return baseEligibility(
            SETTLEMENT_STATUS.PERMANENT,
            "fully_settled",
            "This target has been fully settled.",
            false,
            withPeriods({ ...display, currentTotal, alreadyPaid, increment: 0 })
        );
    }

    return baseEligibility(SETTLEMENT_STATUS.ELIGIBLE, "ready", null, true, withPeriods({
        ...display,
        currentTotal,
        alreadyPaid,
        increment,
        periodsCount,
    }));
}

export function getTargetEligibility({
    target,
    targetResult,
    sales,
    contractCurrency,
    payments = [],
    settlementTypesMap = {},
    contractEndDate = null,
    now = moment(),
}) {
    if (isConditionedTarget(target)) {
        return getConditionedTargetEligibility({
            target,
            targetResult,
            sales,
            contractCurrency,
            payments,
            now,
        });
    }
    return getAlwaysAppliedTargetEligibility({
        target,
        sales,
        contractCurrency,
        payments,
        settlementTypesMap,
        contractEndDate,
        now,
    });
}

export function getFeeEligibility({
    fee,
    payments = [],
    settlementTypesMap = {},
    contractStartDate,
    contractEndDate,
    contractCurrency,
    now = moment(),
}) {
    const display = getFeeSettlementDisplay({ fee, payments, contractCurrency });
    const { owedAmount: amountLeft, settledAmount: alreadyPaid, feeAmount } = display;
    const feeId = fee?.feeId ?? fee?.feeID ?? fee?.FeeID;
    const withPeriods = (extras) => ({ periodsCount: 0, ...extras });

    if (amountLeft <= 0) {
        return baseEligibility(
            SETTLEMENT_STATUS.PERMANENT,
            "fully_settled",
            "",
            false,
            withPeriods({
                ...display,
                amountLeft: 0,
                alreadyPaid,
                feeAmount,
                settlementAmount: 0,
                processAmount: 0,
            })
        );
    }

    const period = getPeriodLength(fee?.settlementTypeId, settlementTypesMap);

    if (!period.valid) {
        return baseEligibility(SETTLEMENT_STATUS.BLOCKED, "invalid_period", period.message, false, withPeriods({
            ...display,
            amountLeft,
            alreadyPaid,
            feeAmount,
            settlementAmount: 0,
            processAmount: 0,
        }));
    }

    const fixedAnchor = contractStartDate;
    if (!fixedAnchor) {
        return baseEligibility(
            SETTLEMENT_STATUS.BLOCKED,
            "missing_anchor",
            "Unable to determine settlement start date for this fee.",
            false,
            withPeriods({
                ...display,
                amountLeft,
                alreadyPaid,
                feeAmount,
                settlementAmount: 0,
                processAmount: 0,
            })
        );
    }

    const settlementAmount = computeFeeSettlementAmount(
        feeAmount,
        period.value,
        fixedAnchor,
        contractEndDate
    );

    const periodsPaid = periodsPaidCountForFee(
        alreadyPaid,
        feeAmount,
        period.value,
        fixedAnchor,
        contractEndDate
    );
    const periodsCount = periodsOwed(fixedAnchor, period.value, periodsPaid, now, contractEndDate);
    const processAmount = computeFeeProcessAmount(
        feeAmount,
        period.value,
        amountLeft,
        periodsCount,
        fixedAnchor,
        contractEndDate
    );

    if (periodsCount === 0) {
        return baseEligibility(
            SETTLEMENT_STATUS.BLOCKED,
            "period_not_due",
            `Available starting ${nextEligibleDate(fixedAnchor, period.value, periodsPaid)}.`,
            false,
            withPeriods({
                ...display,
                amountLeft,
                alreadyPaid,
                feeAmount,
                settlementAmount,
                processAmount: 0,
                periodsCount: 0,
            })
        );
    }

    if (processAmount <= 0) {
        return baseEligibility(
            SETTLEMENT_STATUS.BLOCKED,
            "nothing_to_pay",
            "No amount available to process.",
            false,
            withPeriods({
                ...display,
                amountLeft,
                alreadyPaid,
                feeAmount,
                settlementAmount,
                processAmount: 0,
                periodsCount,
            })
        );
    }

    return baseEligibility(SETTLEMENT_STATUS.ELIGIBLE, "ready", null, true, {
        ...display,
        amountLeft,
        alreadyPaid,
        feeAmount,
        settlementAmount,
        processAmount,
        periodsCount,
    });
}

export function buildTargetConfirmDetails({
    target,
    targetResult,
    sales,
    contractCurrency,
    payments = [],
    periodsCount = 0,
    isFinalCatchUp = false,
    trailingPeriod = null,
    now = moment(),
}) {
    const totalSales = resolveSalesBaseForRebate(sales, contractCurrency);
    const toDate = target?.toDate ?? target?.ToDate;
    const fromDate = target?.fromDate ?? target?.FromDate;
    const inProgress = isTargetInProgress(toDate, now);
    const display = getTargetSettlementDisplay({
        target,
        targetResult,
        sales,
        contractCurrency,
        payments,
        now,
    });

    if (isConditionedTarget(target)) {
        return {
            targetName: target?.targetName ?? "",
            period: `${formatSettlementDate(fromDate)} – ${formatSettlementDate(toDate)}`,
            isConditioned: true,
            amountToProcess: display.owedAmount,
            totalRebate: display.currentTotal,
            totalSales,
            currency: contractCurrency,
            owedAmount: display.owedAmount,
            settledAmount: display.settledAmount,
            footerNote: "This will create a single settlement payment for this target.",
        };
    }

    let footerNote = inProgress ? "Rebate owed may increase until the target period ends." : null;
    if (isFinalCatchUp) {
        const rangeLabel = trailingPeriod?.periodStart?.isValid?.() && trailingPeriod?.periodEnd?.isValid?.()
            ? `${formatSettlementDate(trailingPeriod.periodStart)} – ${formatSettlementDate(trailingPeriod.periodEnd)}`
            : null;
        footerNote = rangeLabel
            ? `Final settlement for remaining rebate (${rangeLabel}).`
            : "Final settlement for remaining rebate through target end.";
    }

    return {
        targetName: target?.targetName ?? "",
        period: `${formatSettlementDate(fromDate)} – ${formatSettlementDate(toDate)}`,
        isConditioned: false,
        isFinalCatchUp,
        owedAmount: display.owedAmount,
        settledAmount: display.settledAmount,
        currentTotal: display.currentTotal,
        amountToProcess: display.owedAmount,
        totalSales,
        currency: contractCurrency,
        inProgress,
        periodsCount,
        footerNote,
    };
}

export { resolveSalesBaseForRebate };
