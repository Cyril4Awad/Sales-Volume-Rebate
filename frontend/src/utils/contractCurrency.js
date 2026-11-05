import { normalizeRebateValueType } from "./planWorkspaceValidation";
import { resolveCurrencyOpt } from "./planWorkspaceMappers";

export const optionToCode = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "object") return (v.value ?? v.label ?? "").trim() || null;
    return null;
};

export function resolveContractCurrencyCode(draft) {
    return optionToCode(draft?.contractDraft?.contractCurrency);
}

export function resolveContractCurrencyOpt(draft, currencyOpts = []) {
    const code = resolveContractCurrencyCode(draft);
    if (!code) return null;
    return resolveCurrencyOpt(currencyOpts, code);
}

function stampConditionGroups(groups, currencyOpt) {
    return (groups ?? []).map((g) => ({
        ...g,
        conditions: (g.conditions ?? []).map((c) =>
            c.conditionType === "S"
                ? { ...c, salesAmountCurrency: currencyOpt }
                : c
        ),
    }));
}

export function inferContractCurrencyFromDraft(draft) {
    for (const f of draft?.fees ?? []) {
        const code = optionToCode(f.currency);
        if (code) return code;
    }
    for (const t of draft?.targets ?? []) {
        const code = optionToCode(t.currency) ?? optionToCode(t.salesAmountCurrency);
        if (code) return code;
        for (const g of t.conditionGroups ?? []) {
            for (const c of g.conditions ?? []) {
                const cCode = optionToCode(c.salesAmountCurrency);
                if (cCode) return cCode;
            }
        }
    }
    return null;
}

export function applyContractCurrencyToDraft(draft, currencyOpts = []) {
    if (!draft) return draft;
    const currencyOpt = resolveContractCurrencyOpt(draft, currencyOpts)
        ?? draft.contractDraft?.contractCurrency
        ?? null;
    const code = optionToCode(currencyOpt);
    if (!code) return draft;

    const contractDraft = draft.contractDraft
        ? { ...draft.contractDraft, contractCurrency: currencyOpt }
        : draft.contractDraft;

    const fees = (draft.fees ?? []).map((f) => ({ ...f, currency: currencyOpt }));

    const targets = (draft.targets ?? []).map((t) => {
        const rebateType = normalizeRebateValueType(t.rebateValueType);
        const isRange = (t.targetType || "formula") === "range";
        const next = { ...t };

        if (isRange) {
            next.salesAmountCurrency =
                next.tierConditionType === "S" ? currencyOpt : next.salesAmountCurrency;
            next.tiers = (next.tiers ?? []).map((tier) => ({
                ...tier,
                currency: normalizeRebateValueType(tier.rebateValueType) === "P"
                    ? null
                    : currencyOpt,
            }));
        } else {
            next.currency = rebateType === "P" ? null : currencyOpt;
            next.conditionGroups = stampConditionGroups(next.conditionGroups, currencyOpt);
        }

        return next;
    });

    return { ...draft, contractDraft, fees, targets };
}
