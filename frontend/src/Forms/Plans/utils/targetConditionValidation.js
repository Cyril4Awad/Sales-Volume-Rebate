import { conditionTypeOptions } from "../constants/planWorkspaceConstants";

const isFilled = (v) => v !== "" && v != null && v !== undefined;

const parseNum = (v) => {
    if (!isFilled(v)) return null;
    const n = Number(v);
    return Number.isNaN(n) ? null : n;
};

const typeLabel = (type) =>
    conditionTypeOptions.find((o) => o.value === type)?.label?.toLowerCase() || "field";

const opSymbol = (op) => op || "?";

const salesCurrencyCode = (c) => {
    const cur = c.salesAmountCurrency;
    if (!cur) return "USD";
    if (typeof cur === "object") return cur.value ?? cur.label ?? "USD";
    return String(cur).trim() || "USD";
};

export const fmtBuiltMetric = (val) =>
    Number(val).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });

export const fmtBuiltQuantity = (val) =>
    Number(val).toLocaleString("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    });

/** Convert amount to USD for cross-currency comparison (LBP / rate = USD). */
export function toUsdAmount(value, currency, usdRate) {
    const n = parseNum(value);
    if (n === null) return null;
    const cur = String(currency ?? "USD").trim().toUpperCase();
    if (cur === "USD") return n;
    if (cur === "LBP") {
        const rate = Number(usdRate);
        if (!Number.isFinite(rate) || rate <= 0) return null;
        return n / rate;
    }
    return n;
};

/** Human-readable single condition (lowercase field name). */
export function formatConditionLabel(c) {
    if (!c.conditionType || !c.operator) return "";
    if (!isFilled(c.value)) return "";

    const op = opSymbol(c.operator);
    const val = c.value;

    if (c.conditionType === "S") {
        const cur = salesCurrencyCode(c) || "USD";
        return `Sales Amount ${op} ${fmtBuiltMetric(val)} ${cur}`;
    }
    if (c.conditionType === "Q") {
        return `Sales Quantity ${op} ${Number(val).toLocaleString()} Pcs`;
    }
    if (c.conditionType === "G") {
        return `Growth ${op} ${val} %`;
    }
    return `${typeLabel(c.conditionType)} ${op} ${val}`;
}

/** AND-joined summary for one OR group. */
export function formatGroupBuiltLabel(group) {
    const parts = (group.conditions || [])
        .map(formatConditionLabel)
        .filter(Boolean);
    if (!parts.length) return "";
    if (parts.length === 1) return parts[0];
    return `(${parts.join(" AND ")})`;
}

/** OR-joined summary across all condition groups. */
export function formatAllGroupsBuiltLabel(groups = []) {
    const parts = groups.map(formatGroupBuiltLabel).filter(Boolean);
    if (!parts.length) return "";
    return parts.join(" OR ");
}

/**
 * Merge complete >= X and <= X on the same conditionType into = X.
 * If = X already exists, only removes the redundant bounds.
 */
export function simplifyRedundantRangeConditions(group) {
    const conditions = group.conditions || [];
    const idsToRemove = new Set();
    const toInsert = [];
    let message = null;

    const byType = {};
    for (const c of conditions) {
        if (!isConditionComplete(c)) continue;
        if (!byType[c.conditionType]) byType[c.conditionType] = [];
        byType[c.conditionType].push(c);
    }

    for (const [conditionType, fieldConds] of Object.entries(byType)) {
        const gteRows = fieldConds.filter((c) => c.operator === ">=");
        const lteRows = fieldConds.filter((c) => c.operator === "<=");
        const usedLte = new Set();

        for (const ge of gteRows) {
            if (idsToRemove.has(ge.id)) continue;
            const geVal = parseNum(ge.value);
            if (geVal === null) continue;

            const matchingLe = lteRows.find(
                (le) =>
                    !idsToRemove.has(le.id) &&
                    !usedLte.has(le.id) &&
                    parseNum(le.value) === geVal
            );
            if (!matchingLe) continue;

            const existingEq = fieldConds.find(
                (c) =>
                    c.operator === "=" &&
                    !idsToRemove.has(c.id) &&
                    parseNum(c.value) === geVal
            );

            idsToRemove.add(ge.id);
            idsToRemove.add(matchingLe.id);
            usedLte.add(matchingLe.id);

            if (!existingEq) {
                toInsert.push({
                    ...ge,
                    operator: "=",
                    value: ge.value,
                });
            }

            if (!message) {
                message = `Condition simplified to ${formatConditionLabel({
                    conditionType,
                    operator: "=",
                    value: ge.value,
                })}`;
            }
        }
    }

    if (!idsToRemove.size) {
        return { group, simplified: false, message: null };
    }

    const nextConditions = [
        ...conditions.filter((c) => !idsToRemove.has(c.id)),
        ...toInsert,
    ];

    return {
        group: { ...group, conditions: nextConditions },
        simplified: true,
        message,
    };
}

export function isConditionComplete(c) {
    return !!(c.conditionType && c.operator && isFilled(c.value));
}

/** Value constraint errors for a single condition (empty if ok). */
export function validateConditionValue(c) {
    if (!isConditionComplete(c)) return [];
    const n = parseNum(c.value);
    if (n === null) return [`${typeLabel(c.conditionType)}: value must be a number`];

    if (c.conditionType === "Q") {
        if (!Number.isInteger(n) || n < 0) {
            return ["Sales quantity must be a whole number greater than or equal to 0"];
        }
    } else if (c.conditionType === "S") {
        if (n < 0) {
            return ["Sales amount must be greater than or equal to 0"];
        }
        if (!Number.isInteger(n)) {
            return ["Sales amount must be a whole number"];
        }
    }
    return [];
}

const satisfiesLower = (value, op, bound) => {
    if (op === ">") return value > bound;
    if (op === ">=") return value >= bound;
    return false;
};

const satisfiesUpper = (value, op, bound) => {
    if (op === "<") return value < bound;
    if (op === "<=") return value <= bound;
    return false;
};

/** Check if value V satisfies constraint {op, bound}. */
export const valueMeetsConstraint = (v, op, bound) => {
    if (op === "=") return v === bound;
    if (op === ">") return v > bound;
    if (op === ">=") return v >= bound;
    if (op === "<") return v < bound;
    if (op === "<=") return v <= bound;
    return true;
};

/** Interval feasibility for lower/upper bounds. */
function intervalEmpty(lowers, uppers, equalities) {
    if (equalities.length > 1) {
        const vals = new Set(equalities.map((e) => e.value));
        if (vals.size > 1) return true;
    }

    const eqVal = equalities.length === 1 ? equalities[0].value : null;

    if (eqVal !== null) {
        for (const l of lowers) {
            if (!valueMeetsConstraint(eqVal, l.op, l.value)) return true;
        }
        for (const u of uppers) {
            if (!valueMeetsConstraint(eqVal, u.op, u.value)) return true;
        }
    }

    let bestLower = null;
    let bestLowerInclusive = true;
    for (const l of lowers) {
        if (bestLower === null) {
            bestLower = l.value;
            bestLowerInclusive = l.op === ">=";
        } else if (l.op === ">") {
            if (l.value > bestLower || (l.value === bestLower && bestLowerInclusive)) {
                bestLower = l.value;
                bestLowerInclusive = false;
            }
        } else if (l.op === ">=") {
            if (l.value > bestLower || (!bestLowerInclusive && l.value === bestLower)) {
                bestLower = l.value;
                bestLowerInclusive = true;
            }
        }
    }

    let bestUpper = null;
    let bestUpperInclusive = true;
    for (const u of uppers) {
        if (bestUpper === null) {
            bestUpper = u.value;
            bestUpperInclusive = u.op === "<=";
        } else if (u.op === "<") {
            if (u.value < bestUpper || (u.value === bestUpper && bestUpperInclusive)) {
                bestUpper = u.value;
                bestUpperInclusive = false;
            }
        } else if (u.op === "<=") {
            if (u.value < bestUpper || (!bestUpperInclusive && u.value === bestUpper)) {
                bestUpper = u.value;
                bestUpperInclusive = true;
            }
        }
    }

    if (bestLower !== null && bestUpper !== null) {
        if (bestLower > bestUpper) return true;
        if (bestLower === bestUpper && (!bestLowerInclusive || !bestUpperInclusive)) return true;
    }

    return false;
}

function detectRedundantBounds(fieldConds, field) {
    const warnings = [];
    const lowers = fieldConds
        .map((c) => ({ op: c.operator, value: parseNum(c.value) }))
        .filter((c) => c.value !== null && (c.op === ">" || c.op === ">="));
    const uppers = fieldConds
        .map((c) => ({ op: c.operator, value: parseNum(c.value) }))
        .filter((c) => c.value !== null && (c.op === "<" || c.op === "<="));

    for (let i = 0; i < lowers.length; i++) {
        for (let j = i + 1; j < lowers.length; j++) {
            const a = lowers[i];
            const b = lowers[j];
            const aStricter =
                (a.op === ">" && b.op === ">=" && a.value >= b.value) ||
                (b.op === ">" && a.op === ">=" && b.value >= a.value) ||
                (a.op === b.op && a.value !== b.value && (
                    (a.op === ">" && a.value > b.value) ||
                    (a.op === ">=" && a.value > b.value)
                ));
            const bStricter =
                (b.op === ">" && a.op === ">=" && b.value >= a.value) ||
                (a.op === ">" && b.op === ">=" && a.value >= b.value) ||
                (a.op === b.op && a.value !== b.value && (
                    (b.op === ">" && b.value > a.value) ||
                    (b.op === ">=" && b.value > a.value)
                ));
            if (aStricter || bStricter) {
                warnings.push(
                    `${typeLabel(field)}: Stricter condition overrides the other`
                );
                break;
            }
        }
    }

    for (let i = 0; i < uppers.length; i++) {
        for (let j = i + 1; j < uppers.length; j++) {
            const a = uppers[i];
            const b = uppers[j];
            const aStricter =
                (a.op === "<" && b.op === "<=" && a.value <= b.value) ||
                (b.op === "<" && a.op === "<=" && b.value <= a.value) ||
                (a.op === b.op && a.value !== b.value && (
                    (a.op === "<" && a.value < b.value) ||
                    (a.op === "<=" && a.value < b.value)
                ));
            const bStricter =
                (b.op === "<" && a.op === "<=" && b.value <= a.value) ||
                (a.op === "<" && b.op === "<=" && a.value <= b.value) ||
                (a.op === b.op && a.value !== b.value && (
                    (b.op === "<" && b.value < a.value) ||
                    (b.op === "<=" && b.value < a.value)
                ));
            if (aStricter || bStricter) {
                warnings.push(
                    `${typeLabel(field)}: Stricter condition overrides the other`
                );
                break;
            }
        }
    }

    return [...new Set(warnings)];
}

function validateFieldConstraints(conditions, field, usdRate = null) {
    const errors = [];
    let parsed;

    if (field === "S") {
        const currencies = new Set(
            conditions.map((c) => salesCurrencyCode(c).toUpperCase())
        );
        const mixed = currencies.size > 1;
        parsed = conditions
            .map((c) => {
                const rawVal = parseNum(c.value);
                if (rawVal === null) return null;
                const val = mixed
                    ? toUsdAmount(rawVal, salesCurrencyCode(c), usdRate)
                    : rawVal;
                if (val === null && mixed) {
                    return { op: c.operator, value: null, _missingRate: true };
                }
                return { op: c.operator, value: val };
            })
            .filter(Boolean);
        if (parsed.some((p) => p._missingRate)) {
            errors.push(
                `${typeLabel(field)}: cannot compare mixed currencies without a valid USD/LBP daily rate`
            );
            return [...new Set(errors)];
        }
    } else {
        parsed = conditions
            .map((c) => ({ op: c.operator, value: parseNum(c.value) }))
            .filter((c) => c.value !== null);
    }

    const equalities = parsed.filter((c) => c.op === "=");
    const lowers = parsed.filter((c) => c.op === ">" || c.op === ">=");
    const uppers = parsed.filter((c) => c.op === "<" || c.op === "<=");
    const fieldName = typeLabel(field);

    if (equalities.length > 1) {
        const vals = [...new Set(equalities.map((e) => e.value))];
        if (vals.length > 1) {
            errors.push(
                `${fieldName}: conflicting equal conditions (${equalities.map((e) => `${fieldName} = ${e.value}`).join(" AND ")})`
            );
        }
    }

    if (equalities.length === 1) {
        const v = equalities[0].value;
        for (const l of parsed.filter((c) => c.op === ">" || c.op === "<")) {
            if (l.op === ">" && l.value === v) {
                errors.push(
                    `${fieldName}: cannot have ${fieldName} = ${v} and ${fieldName} > ${v}`
                );
            }
            if (l.op === "<" && l.value === v) {
                errors.push(
                    `${fieldName}: cannot have ${fieldName} = ${v} and ${fieldName} < ${v}`
                );
            }
        }
        for (const l of lowers) {
            if (l.op === ">=" && v < l.value) {
                errors.push(
                    `${fieldName}: ${fieldName} = ${v} conflicts with ${fieldName} >= ${l.value}`
                );
            }
            if (l.op === ">" && v <= l.value) {
                errors.push(
                    `${fieldName}: ${fieldName} = ${v} conflicts with ${fieldName} > ${l.value}`
                );
            }
        }
        for (const u of uppers) {
            if (u.op === "<=" && v > u.value) {
                errors.push(
                    `${fieldName}: ${fieldName} = ${v} conflicts with ${fieldName} <= ${u.value}`
                );
            }
            if (u.op === "<" && v >= u.value) {
                errors.push(
                    `${fieldName}: ${fieldName} = ${v} conflicts with ${fieldName} < ${u.value}`
                );
            }
        }
    }

    if (intervalEmpty(lowers, uppers, equalities)) {
        const parts = conditions.map((c) => formatConditionLabel(c)).filter(Boolean);
        errors.push(
            `${fieldName}: conditions cannot all be true (${parts.join(" AND ")})`
        );
    }

    return [...new Set(errors)];
}

/**
 * NEW: Detect mixed currencies within the same AND block.
 * Returns a warning string if Sales Amount conditions use more than one currency.
 */
function detectMixedCurrenciesInBlock(conditions, blockLabel) {
    const salesConditions = conditions.filter(
        (c) => isConditionComplete(c) && c.conditionType === "S"
    );
    if (salesConditions.length < 2) return null;

    const currencies = [...new Set(
        salesConditions.map((c) => salesCurrencyCode(c).toUpperCase())
    )];
    if (currencies.length < 2) return null;

    return `${blockLabel}: Sales Amount conditions must use the same currency (${currencies.join(", ")} mixed). Use separate OR blocks for different currencies.`;
}

/** Per-group validation for UI and save. */
export function validateConditionGroup(group, groupIndex = 0, usdRate = null) {
    const errors = [];
    const warnings = [];
    const blockLabel = `Block ${groupIndex + 1}`;

    const conditions = group.conditions || [];

    for (const c of conditions) {
        const parts = [!!c.conditionType, !!c.operator, isFilled(c.value)];
        const any = parts.some(Boolean);
        const all = parts.every(Boolean);
        if (any && !all) {
            errors.push(`${blockLabel}: incomplete condition (type, operator, and value are all required)`);
        }
        if (all) {
            errors.push(...validateConditionValue(c).map((e) => `${blockLabel}: ${e}`));
        }
    }

    const complete = conditions.filter(isConditionComplete);
    const byField = {};
    for (const c of complete) {
        const key = fieldKeyForCondition(c);
        if (!byField[key]) byField[key] = [];
        byField[key].push(c);
    }

    for (const [key, fieldConds] of Object.entries(byField)) {
        const field = key.startsWith("S:") ? "S" : key;
        errors.push(
            ...validateFieldConstraints(fieldConds, field, usdRate).map(
                (e) => `${blockLabel}: ${e}`
            )
        );
        warnings.push(...detectRedundantBounds(fieldConds, field).map((w) => `${blockLabel}: ${w}`));
    }

    // Block save if Sales Amount conditions in this block use mixed currencies
    const mixedCurrencyWarning = detectMixedCurrenciesInBlock(complete, blockLabel);
    if (mixedCurrencyWarning) {
        errors.push(mixedCurrencyWarning);
    }

    return {
        errors: [...new Set(errors)],
        warnings: [...new Set(warnings)],
        builtLabel: formatGroupBuiltLabel(group),
    };
}

const DOMAIN_BOUNDS = {
    S: { min: 0, minInclusive: true, max: Infinity, maxInclusive: false },
    Q: { min: 0, minInclusive: true, max: Infinity, maxInclusive: false },
    G: { min: -100, minInclusive: false, max: Infinity, maxInclusive: false },
};

const fieldKeyForCondition = (c) => {
    if (c.conditionType === "S") {
        return `S:${salesCurrencyCode(c).toUpperCase()}`;
    }
    return c.conditionType;
};

const constraintToInterval = (op, value) => {
    if (value === null) return null;
    switch (op) {
        case ">":
            return { low: value, lowInclusive: false, high: Infinity, highInclusive: false };
        case ">=":
            return { low: value, lowInclusive: true, high: Infinity, highInclusive: false };
        case "<":
            return { low: -Infinity, lowInclusive: false, high: value, highInclusive: false };
        case "<=":
            return { low: -Infinity, lowInclusive: false, high: value, highInclusive: true };
        case "=":
            return { low: value, lowInclusive: true, high: value, highInclusive: true };
        default:
            return null;
    }
};

const intersectIntervals = (a, b) => {
    if (!a || !b) return null;
    let low = a.low;
    let lowInclusive = a.lowInclusive;
    if (b.low > low || (b.low === low && !b.lowInclusive && lowInclusive)) {
        low = b.low;
        lowInclusive = b.lowInclusive;
    } else if (b.low === low && !b.lowInclusive) {
        lowInclusive = false;
    }
    let high = a.high;
    let highInclusive = a.highInclusive;
    if (b.high < high || (b.high === high && !b.highInclusive && highInclusive)) {
        high = b.high;
        highInclusive = b.highInclusive;
    } else if (b.high === high && !b.highInclusive) {
        highInclusive = false;
    }
    if (low > high || (low === high && (!lowInclusive || !highInclusive))) return null;
    return { low, lowInclusive, high, highInclusive };
};

const mergeIntervals = (intervals) => {
    const sorted = intervals
        .filter(Boolean)
        .map((iv) => ({ ...iv }))
        .sort((a, b) => a.low - b.low || Number(b.lowInclusive) - Number(a.lowInclusive));
    if (!sorted.length) return [];
    const out = [sorted[0]];
    for (let i = 1; i < sorted.length; i++) {
        const prev = out[out.length - 1];
        const cur = sorted[i];
        const canMerge =
            cur.low < prev.high
            || (cur.low === prev.high && (cur.lowInclusive || prev.highInclusive));
        if (canMerge) {
            if (cur.high > prev.high || (cur.high === prev.high && cur.highInclusive)) {
                prev.high = cur.high;
                prev.highInclusive = cur.highInclusive;
            }
        } else {
            out.push(cur);
        }
    }
    return out;
};

const intervalWithinDomain = (iv, domain) => {
    if (!iv || !domain) return iv;
    let { low, lowInclusive, high, highInclusive } = iv;
    if (low < domain.min || (low === domain.min && !domain.minInclusive && lowInclusive)) {
        low = domain.min;
        lowInclusive = domain.minInclusive;
    }
    if (high > domain.max || (high === domain.max && !domain.maxInclusive && highInclusive)) {
        high = domain.max;
        highInclusive = domain.maxInclusive;
    }
    if (low > high || (low === high && (!lowInclusive || !highInclusive))) return null;
    return { low, lowInclusive, high, highInclusive };
};

const unionCoversDomain = (intervals, fieldType) => {
    const domain = DOMAIN_BOUNDS[fieldType];
    if (!domain || !intervals.length) return false;
    const clipped = intervals
        .map((iv) => intervalWithinDomain(iv, domain))
        .filter(Boolean);
    const merged = mergeIntervals(clipped);
    if (!merged.length) return false;

    const first = merged[0];
    const coversLow =
        first.low < domain.min
        || (first.low === domain.min && first.lowInclusive && domain.minInclusive)
        || (first.low === domain.min && domain.minInclusive);

    if (!coversLow) return false;

    let cursor = first.high;
    let cursorInclusive = first.highInclusive;
    if (cursor === Infinity) return true;

    for (let i = 1; i < merged.length; i++) {
        const iv = merged[i];
        const gap =
            iv.low > cursor
            || (iv.low === cursor && !iv.lowInclusive && !cursorInclusive);
        if (gap) return false;
        if (iv.high > cursor || (iv.high === cursor && iv.highInclusive)) {
            cursor = iv.high;
            cursorInclusive = iv.highInclusive;
        }
        if (cursor === Infinity) return true;
    }

    return cursor === Infinity || (cursor === domain.max && cursorInclusive && domain.maxInclusive);
};

const groupFeasibleInterval = (conditions, fieldType, currencyKey, usdRate) => {
    const relevant = conditions.filter((c) => {
        if (!isConditionComplete(c) || c.conditionType !== fieldType) return false;
        if (fieldType === "S") {
            return fieldKeyForCondition(c) === currencyKey;
        }
        return true;
    });
    if (!relevant.length) return null;

    let interval = {
        low: -Infinity,
        lowInclusive: false,
        high: Infinity,
        highInclusive: false,
    };

    for (const c of relevant) {
        let val = parseNum(c.value);
        if (val === null) return null;
        if (fieldType === "S") {
            const cur = salesCurrencyCode(c);
            const currencies = new Set(relevant.map((x) => salesCurrencyCode(x).toUpperCase()));
            if (currencies.size > 1) {
                val = toUsdAmount(val, cur, usdRate);
                if (val === null) return null;
            }
        }
        const next = constraintToInterval(c.operator, val);
        interval = intersectIntervals(interval, next);
        if (!interval) return null;
    }
    return interval;
};

const intervalSubset = (inner, outer) => {
    if (!inner || !outer) return false;
    const lowOk =
        inner.low > outer.low
        || (inner.low === outer.low && (!inner.lowInclusive || outer.lowInclusive));
    const highOk =
        inner.high < outer.high
        || (inner.high === outer.high && (!inner.highInclusive || outer.highInclusive));
    return lowOk && highOk;
};

export function validateCrossGroupConditions(groups = [], usdRate = null) {
    const errors = [];
    const completeGroups = (groups ?? []).map((g) =>
        (g.conditions || []).filter(isConditionComplete)
    );
    if (completeGroups.length < 2) return errors;

    // ── Cross-block currency consistency ──────────────────────────────────────
    // All OR blocks that have Sales Amount must use the same currency.
    const salesCurrenciesPerBlock = completeGroups.map((conds) => {
        const salesConds = conds.filter((c) => c.conditionType === "S");
        if (!salesConds.length) return null;
        const currencies = [...new Set(salesConds.map((c) => salesCurrencyCode(c).toUpperCase()))];
        return currencies[0];
    }).filter(Boolean);

    if (salesCurrenciesPerBlock.length > 1) {
        const uniqueCurrencies = [...new Set(salesCurrenciesPerBlock)];
        if (uniqueCurrencies.length > 1) {
            errors.push(
                `Sales Amount across OR blocks must use the same currency (${uniqueCurrencies.join(", ")} mixed). Use a single currency across all blocks.`
            );
        }
    }

    // ── Per-field always-true / always-false checks ───────────────────────────
    const fieldKeys = new Set();
    completeGroups.forEach((conds) => {
        conds.forEach((c) => fieldKeys.add(fieldKeyForCondition(c)));
    });

    for (const key of fieldKeys) {
        const fieldType = key.startsWith("S:") ? "S" : key;
        const groupIntervals = completeGroups.map((conds) =>
            groupFeasibleInterval(conds, fieldType, key, usdRate)
        );

        const validIntervals = groupIntervals.filter(Boolean);
        if (validIntervals.length === 0) {
            errors.push(
                `${typeLabel(fieldType)}: OR groups cannot all be satisfied (always false)`
            );
            continue;
        }

        const mergedUnion = mergeIntervals(validIntervals);
        if (unionCoversDomain(mergedUnion, fieldType)) {
            errors.push(
                `${typeLabel(fieldType)}: OR combination is always true (covers all possible values) `
            );
        }
    }

    // ── Redundancy check ──────────────────────────────────────────────────────
    // Block i is redundant when Block j passes if:
    // 1. Block j checks no field keys that Block i doesn't also check
    //    (if Block j has extra conditions, it's stricter and can fail when Block i passes)
    // 2. For every key Block j checks, Block i's interval contains Block j's interval
    //    (Block i is easier or equal on every dimension Block j checks)
    for (let i = 0; i < completeGroups.length; i++) {
        for (let j = 0; j < completeGroups.length; j++) {
            if (i === j) continue;

            const keysI = new Set(completeGroups[i].map(fieldKeyForCondition));
            const keysJ = new Set(completeGroups[j].map(fieldKeyForCondition));

            if (keysI.size === 0 || keysJ.size === 0) continue;

            // If Block j checks a field that Block i doesn't, Block j can fail
            // on that field when Block i would have passed — not redundant
            const jHasExtraKeys = [...keysJ].some((k) => !keysI.has(k));
            if (jHasExtraKeys) continue;

            // If Block i checks a field that Block j doesn't, Block i can fail
            // on that field even when Block j passes — so Block i is NOT redundant
            const iHasExtraKeys = [...keysI].some((k) => !keysJ.has(k));
            if (iHasExtraKeys) continue;

            // For every key Block j checks, Block i's interval must be a superset
            // (easier) — meaning whenever Block j passes on that key, Block i also passes
            let iIsRedundant = true;
            for (const key of keysJ) {
                const fieldType = key.startsWith("S:") ? "S" : key;
                const ivI = groupFeasibleInterval(completeGroups[i], fieldType, key, usdRate);
                const ivJ = groupFeasibleInterval(completeGroups[j], fieldType, key, usdRate);
                // ivJ must be subset of ivI (Block j is stricter, Block i is easier)
                if (!ivI || !ivJ || !intervalSubset(ivJ, ivI)) {
                    iIsRedundant = false;
                    break;
                }
            }

            if (iIsRedundant) {
                errors.push(
                    `Block ${i + 1} is redundant - its conditions are always satisfied when Block ${j + 1} passes`
                );
            }
        }
    }

    return [...new Set(errors)];
}

/** All hard errors for save (flat strings). */
export function getConditionGroupSaveErrors(groups = [], usdRate = null) {
    const errors = [];
    groups.forEach((group, gIdx) => {
        const { errors: groupErrors } = validateConditionGroup(group, gIdx, usdRate);
        errors.push(...groupErrors);
    });
    errors.push(...validateCrossGroupConditions(groups, usdRate));
    return errors;
}