import moment from "moment";
import { flatConditionsToGroups } from "./conditionGroups";
import { valueMeetsConstraint } from "../Forms/Plans/utils/targetConditionValidation";
import { conditionTypeOptions } from "../Forms/Plans/constants/planWorkspaceConstants";

export const TARGET_STATE = {
    IN_PROGRESS: "In Progress",
    ACHIEVED: "Achieved",
    MISSED: "Missed",
};

/** Stable key for sales lookup: persisted targetId, else editor localId. */
export function resolveTargetSalesKey(target) {
    const id = target?.targetId ?? target?.targetID ?? target?.TargetID;
    if (id != null && id !== "") return String(id);
    if (target?.localId != null && target.localId !== "") return String(target.localId);
    return "";
}

export function hasValidTargetDates(target) {
    const from = target?.fromDate ?? target?.FromDate;
    const to = target?.toDate ?? target?.ToDate;
    return !!(from && to && moment(from).isValid() && moment(to).isValid());
}

const PHASE1_TYPES = new Set(["S", "Q", "G"]);
const RANGE_TYPE_ALIASES = new Set(["R", "RANGE"]);

const parseNum = (v) => {
    if (v === "" || v == null || v === undefined) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
};

const typeLabel = (type) =>
    conditionTypeOptions.find((o) => o.value === type)?.label || type;

const metricForType = (type, sales, conditionCurrency = null) => {
    if (type === "S") {
        if (conditionCurrency && sales.salesAmounts) {
            return sales.salesAmounts[conditionCurrency] ?? 0;
        }
        return sales.salesAmount ?? 0;
    }
    if (type === "Q") return sales.salesQuantity ?? 0;
    if (type === "G") return sales.growthPercentageUSD ?? 0;
    return null;
};

const normalizeTargetType = (raw) => {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;
    return s.toUpperCase();
};

const isRangeTarget = (target) => {
    const tt =
        normalizeTargetType(
            target?.targetType ??
            target?.TargetType ??
            target?.TAR_TargetType ??
            target?.tar_TargetType
        );
    return tt === "R" || tt === "RANGE";
};

export { isRangeTarget };

const formatGap = (type, operator, required, actual) => {
    const field = typeLabel(type).toLowerCase();
    const unit = type === "Q" ? "Pcs" : type === "G" ? "%" : type === "S" ? "USD" : "";
    const req = required ?? "?";
    const act = actual ?? "?";
    return `needed ${field} ${operator} ${req}${unit ? ` ${unit}` : ""}, got ${act}${unit ? ` ${unit}` : ""}`;
};

export function matchRangeTier(tiers, salesMetric) {
    const metric = Number(salesMetric);
    if (!Number.isFinite(metric)) return null;

    const rows = Array.isArray(tiers) ? tiers : [];
    const withValues = rows
        .map((t) => ({ row: t, value: parseNum(t?.value) }))
        .filter((x) => x.value !== null)
        .sort((a, b) => a.value - b.value);

    let matched = null;
    for (const t of withValues) {
        if (metric > t.value) matched = t.row;
    }
    return matched;
}

const normalizeRebateType = (raw) => {
    const s = String(raw ?? "F").trim().toUpperCase();
    return s === "P" ? "P" : "F";
};

const computeTierRebate = (tier, sales, contractCurrency = null) => {
    const rebateType = normalizeRebateType(tier?.rebateValueType);
    const rebateValue = parseNum(tier?.rebateValue) ?? 0;

    if (rebateType === "P") {
        const base = resolveSalesBaseForRebate(sales, contractCurrency);
        return (base * rebateValue) / 100;
    }
    return rebateValue;
};

export function getTierCurrencyCode(tier, contractCurrency = null) {
    const rebateType = normalizeRebateType(tier?.rebateValueType);
    if (rebateType === "P") {
        return contractCurrency ?? "USD";
    }
    if (contractCurrency) return contractCurrency;
    const cur = tier?.currency ?? tier?._raw?.currency;
    if (cur == null || cur === "") return "USD";
    if (typeof cur === "object") return cur.value ?? cur.label ?? "USD";
    return String(cur).trim() || "USD";
}

export function accumulateRebateByCurrency(buckets, amount, currency) {
    const key = currency ?? "USD";
    const n = Number(amount);
    if (!Number.isFinite(n)) return buckets;
    buckets[key] = (buckets[key] ?? 0) + n;
    return buckets;
}

const resolveTargetCurrencyCode = (target, contractCurrency = null) => {
    if (contractCurrency) return contractCurrency;
    const cur = target?.currency ?? target?.Currency;
    if (cur == null || cur === "") return "USD";
    if (typeof cur === "object") return cur.value ?? cur.label ?? "USD";
    return String(cur).trim() || "USD";
};

const resolveSalesBaseForRebate = (sales, contractCurrency = null) => {
    const cur = contractCurrency ? String(contractCurrency).trim().toUpperCase() : null;
    if (cur && sales?.salesAmounts?.[cur] != null) {
        return parseNum(sales.salesAmounts[cur]) ?? 0;
    }
    return parseNum(sales?.salesAmountBase ?? sales?.salesAmount) ?? 0;
};

export { resolveSalesBaseForRebate };

const normalizeTierConditionType = (raw) => {
    const s = String(raw ?? "").trim().toUpperCase();
    if (!s) return null;
    if (s === "S" || s === "Q" || s === "G") return s;
    return null;
};

const resolveRangeMetricType = (target, tiers = []) => {
    const explicit = normalizeTierConditionType(
        target?.tierConditionType ??
        target?.TierConditionType ??
        target?.TAR_TierConditionType ??
        target?.tar_TierConditionType
    );
    if (explicit) return explicit;

    const inferred = normalizeTierConditionType(
        (Array.isArray(tiers) ? tiers : []).find((t) => t?.conditionType)?.conditionType
    );
    return inferred;
};

const normalizeConditionCurrency = (raw) => {
    if (raw == null || raw === "") return null;
    if (typeof raw === "object") return raw.value ?? raw.label ?? null;
    const s = String(raw).trim();
    return s || null;
};

export function evaluateRangeTarget(target, sales, options = {}) {
    const contractCurrency = options.contractCurrency ?? null;
    const salesKey = resolveTargetSalesKey(target);
    const targetName = target.targetName ?? target.TargetName ?? "";

    if (!hasValidTargetDates(target)) {
        return {
            targetId: salesKey,
            targetName,
            state: TARGET_STATE.IN_PROGRESS,
            inProgress: true,
            targetAchieved: false,
            rebateAmount: 0,
            matchedTier: null,
            matchedTiers: [],
            gaps: [],
            tierResults: [],
        };
    }

    const asOf = options.asOf ?? moment();
    const toDate = target.toDate ?? target.ToDate;
    const inProgress = isTargetInProgress(toDate, asOf);

    const tiers = target.tiers ?? target.Tiers ?? target.rangeTiers ?? [];
    const metricType = resolveRangeMetricType(target, tiers);
    const tierCurrency =
        metricType === "S"
            ? (contractCurrency ?? normalizeConditionCurrency(
                  target.salesAmountCurrency ??
                  target.SalesAmountCurrency
              ))
            : null;
    const salesMetric = metricForType(metricType, sales, tierCurrency);

    const sortedTiers = (Array.isArray(tiers) ? tiers : [])
        .map((t) => ({
            value: parseNum(t?.value),
            rebateValueType: normalizeRebateType(t?.rebateValueType),
            rebateValue: parseNum(t?.rebateValue),
            currency: t?.currency ?? null,
            exceeded: false,
            _raw: t,
        }))
        .filter((t) => t.value !== null)
        .sort((a, b) => a.value - b.value);

    for (const t of sortedTiers) {
        t.exceeded = salesMetric != null ? Number(salesMetric) > t.value : false;
    }

    const tierResults = sortedTiers.map((t) => ({
        value: t.value,
        rebateValueType: t.rebateValueType,
        rebateValue: t.rebateValue,
        currency: t.currency,
        exceeded: t.exceeded,
    }));

    const rangeOverride = !!(target.rangeOverride ?? target.RangeOverride);

    const exceededTiers = sortedTiers.filter((t) => t.exceeded);

    const matchedRawTier =
        metricType && PHASE1_TYPES.has(metricType)
            ? matchRangeTier(sortedTiers.map((t) => t._raw), salesMetric)
            : null;

    const toMatchedTierDto = (raw) =>
        raw
            ? {
                value: parseNum(raw?.value ?? raw?._raw?.value),
                rebateValueType: normalizeRebateType(raw?.rebateValueType ?? raw?._raw?.rebateValueType),
                rebateValue: parseNum(raw?.rebateValue ?? raw?._raw?.rebateValue),
                currency: raw?.currency ?? raw?._raw?.currency ?? null,
            }
            : null;

    const matchedTier = matchedRawTier ? toMatchedTierDto(matchedRawTier) : null;

    const matchedTiers = rangeOverride
        ? exceededTiers.map((t) => toMatchedTierDto(t._raw ?? t))
        : matchedTier
            ? [matchedTier]
            : [];

    if (inProgress) {
        return {
            targetId: salesKey,
            targetName,
            state: TARGET_STATE.IN_PROGRESS,
            inProgress: true,
            targetAchieved: false,
            rebateAmount: 0,
            matchedTier,
            matchedTiers,
            gaps: [],
            tierResults,
        };
    }

    const targetAchieved = exceededTiers.length > 0;
    const state = targetAchieved ? TARGET_STATE.ACHIEVED : TARGET_STATE.MISSED;

    let rebateAmount = 0;
    let rebateAmounts = null;
    let rebateCurrency = null;

    if (targetAchieved) {
        if (rangeOverride) {
            rebateAmounts = {};
            exceededTiers.forEach((t) => {
                const dto = toMatchedTierDto(t._raw ?? t);
                const amt = computeTierRebate(dto, sales, contractCurrency);
                accumulateRebateByCurrency(rebateAmounts, amt, getTierCurrencyCode(dto, contractCurrency));
            });
            rebateAmount = Object.values(rebateAmounts).reduce((sum, v) => sum + v, 0);
        } else if (matchedTier) {
            rebateAmount = computeTierRebate(matchedTier, sales, contractCurrency);
            rebateCurrency = getTierCurrencyCode(matchedTier, contractCurrency);
        }
    }

    const gaps = [];
    if (!targetAchieved && sortedTiers.length > 0 && metricType && PHASE1_TYPES.has(metricType)) {
        const first = sortedTiers[0];
        gaps.push(formatGap(metricType, ">", first.value, salesMetric));
    }

    return {
        targetId: salesKey,
        targetName,
        state,
        inProgress: false,
        targetAchieved,
        rebateAmount,
        ...(rebateAmounts ? { rebateAmounts } : {}),
        ...(rebateCurrency ? { rebateCurrency } : {}),
        matchedTier,
        matchedTiers,
        gaps,
        tierResults,
    };
}

export function evaluateCondition(condition, sales) {
    const { conditionType, operator, value, salesAmountCurrency } = condition;
    const conditionCurrency = normalizeConditionCurrency(salesAmountCurrency);
    const bound = parseNum(value);
    const actual = metricForType(conditionType, sales, conditionCurrency);
    const currency = conditionCurrency;

    if (!PHASE1_TYPES.has(conditionType)) {
        return {
            conditionType,
            operator,
            required: value,
            actual: null,
            passed: null,
            skipped: true,
            label: typeLabel(conditionType),
            salesAmountCurrency: currency,
        };
    }

    if (bound === null || actual === null) {
        return {
            conditionType,
            operator,
            required: value,
            actual,
            passed: false,
            skipped: false,
            label: typeLabel(conditionType),
            salesAmountCurrency: currency,
            gap: formatGap(conditionType, operator, value, actual),
        };
    }

    const passed = valueMeetsConstraint(actual, operator, bound);
    return {
        conditionType,
        operator,
        required: bound,
        actual,
        passed,
        skipped: false,
        label: typeLabel(conditionType),
        salesAmountCurrency: currency,
        gap: passed ? null : formatGap(conditionType, operator, bound, actual),
    };
}

/** AND within group, OR between groups.
 *  If there are NO groups at all → unconditionally achieved (always-apply target). */
export function evaluateConditionGroups(conditionGroups = [], sales) {
    const groups = conditionGroups?.length ? conditionGroups : [];

    // FIX: no conditions = always achieved
    if (!groups.length) {
        return { groupResults: [], qualifyingGroups: [], targetAchieved: true };
    }

    const groupResults = groups.map((group) => {
        const conditionResults = (group.conditions || [])
            .filter((c) => c.conditionType && c.operator && c.value !== "" && c.value != null)
            .map((c) => evaluateCondition(c, sales));

        const evaluable = conditionResults.filter((r) => !r.skipped);
        const passed =
            evaluable.length > 0 && evaluable.every((r) => r.passed === true);

        return {
            groupId: group.id,
            joinWithPrevious: group.joinWithPrevious,
            conditionResults,
            passed,
        };
    });

    const qualifyingGroups = groupResults.filter((g) => g.passed);
    const targetAchieved = qualifyingGroups.length > 0;

    return { groupResults, qualifyingGroups, targetAchieved };
}

export function evaluateConditions(flatConditions = [], sales) {
    const groups = flatConditionsToGroups(
        (flatConditions || []).filter((c) => PHASE1_TYPES.has(c.conditionType))
    );
    return evaluateConditionGroups(groups, sales);
}

export function computeRebate(target, sales, contractCurrency = null) {
    const rebateType = String(target.rebateValueType ?? "F").trim().toUpperCase();
    const rebateValue = parseNum(target.rebateValue) ?? 0;

    if (rebateType === "P") {
        const base = resolveSalesBaseForRebate(sales, contractCurrency);
        return (base * rebateValue) / 100;
    }
    return rebateValue;
}

const endOfDay = (date) => {
    if (!date) return null;
    return moment(date).endOf("day");
};

export function isTargetInProgress(toDate, asOf = moment()) {
    const end = endOfDay(toDate);
    if (!end || !end.isValid()) return false;
    return end.isAfter(asOf);
}

export function evaluateTarget(target, sales, options = {}) {
    const contractCurrency = options.contractCurrency ?? null;
    if (isRangeTarget(target)) {
        return evaluateRangeTarget(target, sales, options);
    }

    const salesKey = resolveTargetSalesKey(target);
    const targetName = target.targetName ?? target.TargetName ?? "";

    if (!hasValidTargetDates(target)) {
        return {
            targetId: salesKey,
            targetName,
            state: TARGET_STATE.IN_PROGRESS,
            inProgress: true,
            targetAchieved: false,
            rebateAmount: 0,
            groupResults: [],
            qualifyingGroups: [],
            allConditionResults: [],
        };
    }

    const asOf = options.asOf ?? moment();
    const toDate = target.toDate ?? target.ToDate;
    const inProgress = isTargetInProgress(toDate, asOf);

    const flatConditions = target.conditions;
    const conditionGroups = target.conditionGroups;
    const evaluation = conditionGroups?.length
        ? evaluateConditionGroups(conditionGroups, sales)
        : evaluateConditions(flatConditions, sales);

    const allConditionResults = evaluation.groupResults.flatMap(
        (g) => g.conditionResults
    );

    const alwaysApplied =
        evaluation.targetAchieved &&
        (evaluation.groupResults?.length ?? 0) === 0;

    const rebateType = String(target.rebateValueType ?? "F").trim().toUpperCase();
    const resolveRebateCurrency = () =>
        rebateType === "P"
            ? (contractCurrency ?? "USD")
            : resolveTargetCurrencyCode(target, contractCurrency);

    if (inProgress) {
        const rebateAmount = alwaysApplied
            ? computeRebate(target, sales, contractCurrency)
            : 0;
        const rebateCurrency = alwaysApplied ? resolveRebateCurrency() : undefined;

        return {
            targetId: resolveTargetSalesKey(target),
            targetName: target.targetName ?? target.TargetName ?? "",
            state: TARGET_STATE.IN_PROGRESS,
            inProgress: true,
            targetAchieved: alwaysApplied,
            rebateAmount,
            ...(rebateCurrency != null ? { rebateCurrency } : {}),
            ...evaluation,
            allConditionResults,
        };
    }

    const targetAchieved = evaluation.targetAchieved;
    const state = targetAchieved ? TARGET_STATE.ACHIEVED : TARGET_STATE.MISSED;
    const rebateAmount = targetAchieved ? computeRebate(target, sales, contractCurrency) : 0;
    const rebateCurrency = targetAchieved ? resolveRebateCurrency() : undefined;

    const failedConditions = allConditionResults.filter(
        (r) => !r.skipped && r.passed === false
    );

    return {
        targetId: resolveTargetSalesKey(target),
        targetName: target.targetName ?? target.TargetName ?? "",
        state,
        inProgress: false,
        targetAchieved,
        rebateAmount,
        rebateCurrency,
        gaps: failedConditions.map((r) => r.gap).filter(Boolean),
        ...evaluation,
        allConditionResults,
    };
}

export function evaluatePlan(targets = [], salesByTargetId = {}, options = {}) {
    const contractCurrency = options.contractCurrency ?? null;
    const targetResults = (targets || []).map((target) => {
        const key = resolveTargetSalesKey(target);
        const sales = salesByTargetId[key] ?? {
            salesAmounts: {},
            salesAmount: 0,
            salesAmountBase: 0,
            salesQuantity: 0,
            systemCurrency: "USD",
        };
        return evaluateTarget(target, sales, { ...options, contractCurrency });
    });

    const grandTotalRebate = targetResults
        .filter((r) => r.targetAchieved && (r.rebateAmount ?? 0) > 0)
        .reduce((sum, r) => sum + (r.rebateAmount ?? 0), 0);

    return {
        targetResults,
        grandTotalRebate,
        achievedCount: targetResults.filter((r) => r.state === TARGET_STATE.ACHIEVED).length,
        missedCount: targetResults.filter((r) => r.state === TARGET_STATE.MISSED).length,
        inProgressCount: targetResults.filter((r) => r.state === TARGET_STATE.IN_PROGRESS).length,
    };
}

export function projectCurrentRebate(target, sales) {
    if (!target || !sales) return { projectedRebate: 0, currency: null };

    const systemCurrency = sales.systemCurrency ?? null;

    if (isRangeTarget(target)) {
        const tiers = target.tiers ?? target.Tiers ?? target.rangeTiers ?? [];
        const metricType = resolveRangeMetricType(target, tiers);
        const tierCurrency =
            metricType === "S"
                ? normalizeConditionCurrency(
                      target.salesAmountCurrency ??
                      target.SalesAmountCurrency
                  )
                : null;
        const salesMetric = metricForType(metricType, sales, tierCurrency);
        const rangeOverride = !!(target.rangeOverride ?? target.RangeOverride);

        const sortedTiers = (Array.isArray(tiers) ? tiers : [])
            .map((t) => ({ row: t, value: parseNum(t?.value) }))
            .filter((x) => x.value !== null)
            .sort((a, b) => a.value - b.value);

        const exceeded = sortedTiers.filter(
            (t) => salesMetric != null && Number(salesMetric) > t.value
        );

        if (!exceeded.length) return { projectedRebate: 0, currency: null };

        if (rangeOverride) {
            const projectedRebateAmounts = {};
            exceeded.forEach((t) => {
                const amt = computeTierRebate(t.row, sales);
                accumulateRebateByCurrency(projectedRebateAmounts, amt, getTierCurrencyCode(t.row));
            });
            const projectedRebate = Object.values(projectedRebateAmounts).reduce((sum, v) => sum + v, 0);
            return { projectedRebate, projectedRebateAmounts, currency: systemCurrency };
        }

        const matchedTier =
            metricType && PHASE1_TYPES.has(metricType)
                ? matchRangeTier(Array.isArray(tiers) ? tiers : [], salesMetric)
                : null;
        if (!matchedTier) return { projectedRebate: 0, currency: null };
        const projectedRebate = computeTierRebate(matchedTier, sales);
        return {
            projectedRebate,
            currency: getTierCurrencyCode(matchedTier) ?? systemCurrency,
        };
    }

    const flatConditions = target.conditions;
    const conditionGroups = target.conditionGroups;
    const evaluation = conditionGroups?.length
        ? evaluateConditionGroups(conditionGroups, sales)
        : evaluateConditions(flatConditions, sales);

    if (!evaluation?.targetAchieved) return { projectedRebate: 0, currency: null };

    const projectedRebate = computeRebate(target, sales);
    const rebateType = String(target.rebateValueType ?? "F").trim().toUpperCase();
    const currency = rebateType === "P" ? "USD" : resolveTargetCurrencyCode(target);
    return { projectedRebate, currency: currency ?? systemCurrency };
}