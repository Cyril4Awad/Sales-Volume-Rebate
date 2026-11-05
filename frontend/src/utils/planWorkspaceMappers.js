import moment from "moment";
import { mapLoadedReferenceRow } from "./mapLoadedReferenceRow";
import {
    flatConditionsToGroups,
    conditionGroupsToFlat,
    createEmptyTarget,
    isEmptyTarget,
    isRangeCondition,
    tiersToFlatConditions,
} from "./conditionGroups";
import { normalizeRebateValueType } from "./planWorkspaceValidation";
import { resolveContractCurrencyCode } from "./contractCurrency";
import {
    conditionTypeOptions,
    operatorOptions,
    rebateValueTypeOptions,
} from "../Forms/Plans/constants/planWorkspaceConstants";

const getProp = (obj, key) => {
    if (!obj) return undefined;
    const match = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    return match !== undefined ? obj[match] : undefined;
};

const findOpt = (options, value) =>
    options.find((o) => o.value === String(value ?? "")) || null;

const normalizeApiDateToYmd = (v) => {
    if (!v) return null;
    if (typeof v === "string") {
        const s = v.trim();
        const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
        if (m) return m[1];
    }
    const m = moment(v);
    return m.isValid() ? m.format("YYYY-MM-DD") : null;
};

const formatLocalDateYmd = (v) => {
    if (!v) return null;
    const m = moment(v);
    return m.isValid() ? m.format("YYYY-MM-DD") : null;
};

const apiTargetTypeToUi = (apiType, conditions = []) => {
    const code = (apiType ?? "").toString().trim().toUpperCase();
    if (code === "R") return "range";
    if (code === "F") return "formula";
    if ((conditions || []).some(isRangeCondition)) return "range";
    return "formula";
};

const mapCurrencyOpt = (currencyOpts, code) => {
    if (!code) return null;
    return currencyOpts.find((o) => o.value === String(code).toUpperCase()) || null;
};

/** Resolve a stored currency (object, string code, or null) to a select option. */
export const resolveCurrencyOpt = (currencyOpts, val) => {
    if (!val || !currencyOpts?.length) return val ?? null;
    if (typeof val === "object" && val.value != null) {
        return mapCurrencyOpt(currencyOpts, val.value) ?? val;
    }
    return mapCurrencyOpt(currencyOpts, val);
};

export const mapCurrencyOptionsFromApi = (data) =>
    (Array.isArray(data) ? data : []).map((c) => ({
        value: String(c).toUpperCase(),
        label: String(c).toUpperCase(),
    }));

/** Re-bind currency fields to loaded dropdown options (canonical { value, label } objects). */
export function hydratePlanDraftCurrencies(draft, currencyOpts = []) {
    if (!draft || !currencyOpts?.length) return draft;

    const hc = (val) => resolveCurrencyOpt(currencyOpts, val);

    const hydrateCondition = (c) => ({
        ...c,
        salesAmountCurrency: c.salesAmountCurrency ? hc(c.salesAmountCurrency) : c.salesAmountCurrency,
    });

    const hydrateTarget = (t) => {
        const rebateType = t.rebateValueType ? normalizeRebateValueType(t.rebateValueType) : null;
        return {
            ...t,
            currency: rebateType === "P" ? null : hc(t.currency),
            salesAmountCurrency: t.salesAmountCurrency ? hc(t.salesAmountCurrency) : t.salesAmountCurrency,
            tiers: (t.tiers || []).map((tier) => ({
                ...tier,
                currency: normalizeRebateValueType(tier.rebateValueType) === "P"
                    ? null
                    : hc(tier.currency),
            })),
            conditionGroups: (t.conditionGroups || []).map((g) => ({
                ...g,
                conditions: (g.conditions || []).map(hydrateCondition),
            })),
        };
    };

    const contractCurrencyRaw =
        draft.contractDraft?.contractCurrency
        ?? draft.contractDraft?.ContractCurrency
        ?? null;

    return {
        ...draft,
        contractDraft: draft.contractDraft
            ? {
                ...draft.contractDraft,
                contractCurrency: contractCurrencyRaw ? hc(contractCurrencyRaw) : null,
            }
            : draft.contractDraft,
        fees: (draft.fees || []).map((f) => ({ ...f, currency: hc(f.currency) })),
        targets: (draft.targets || []).map(hydrateTarget),
    };
}

export function mapApiTargetToDraft(t, lookups) {
    const { currencyOpts, compTypes, settTypes } = lookups;
    const allConditions = (t.conditions || []).map((c) => ({
        targetConditionID: c.targetConditionID ?? c.targetConditionId,
        conditionType: c.conditionType,
        operator: c.operator,
        value: c.value,
        logicalGroup: c.logicalGroup,
        logicalOperator: c.logicalOperator,
        type: c.type,
        currency: c.currency,
        salesAmountCurrency: c.salesAmountCurrency,
        rebateAmount: c.rebateAmount,
        override: c.override ?? false,
    }));

    const targetType = apiTargetTypeToUi(t.targetType, allConditions);
    const rangeRows = allConditions.filter(isRangeCondition);
    const formulaRows = allConditions.filter((c) => !isRangeCondition(c));

    const rebateType = targetType === "range"
        ? null
        : normalizeRebateValueType(t.rebateValueType ?? "F");

    const firstRange = rangeRows[0];
    const tierConditionType = firstRange?.conditionType ?? null;
    const salesAmountCurrency =
        tierConditionType === "S" && firstRange?.salesAmountCurrency
            ? mapCurrencyOpt(currencyOpts, firstRange.salesAmountCurrency)
            : null;

    const tiers = rangeRows.map((c) => ({
        localId: `tier_${c.targetConditionID ?? Date.now()}_${Math.random()}`,
        dbId: c.targetConditionID ?? null,
        operator: "=",
        value: c.value ?? "",
        rebateValueType: normalizeRebateValueType(c.type ?? "F"),
        currency: normalizeRebateValueType(c.type ?? "F") === "P"
            ? null
            : mapCurrencyOpt(currencyOpts, c.currency),
        rebateValue: c.rebateAmount ?? "",
    }));

    const formulaFlat = formulaRows.map((c) => ({
        ...c,
        salesAmountCurrency: c.salesAmountCurrency
            ? mapCurrencyOpt(currencyOpts, c.salesAmountCurrency)
            : null,
    }));

    return {
        targetId: t.targetID ?? t.targetId ?? null,
        localId: `t_${t.targetID ?? t.targetId ?? Date.now()}`,
        targetName: t.targetName || "",
        fromDate: normalizeApiDateToYmd(t.fromDate),
        toDate: normalizeApiDateToYmd(t.toDate),
        rebateValue: targetType === "range" ? "" : (t.rebateValue ?? ""),
        rebateValueType: rebateType
            ? (findOpt(rebateValueTypeOptions, rebateType)?.value ?? rebateType)
            : null,
        currency: targetType === "range" || rebateType === "P"
            ? null
            : mapCurrencyOpt(currencyOpts, t.currency),
        conditionGroups: flatConditionsToGroups(formulaFlat),
        references: (t.references || []).map((r) =>
            mapLoadedReferenceRow(r, "targetReferenceId")
        ),
        referenceType: null,
        targetType,
        computationTypeId: compTypes.find((o) => o.value === String(t.computationTypeID ?? "")) || null,
        settlementTypeId: settTypes.find((o) => o.value === String(t.settlementTypeID ?? "")) || null,
        tierConditionType,
        salesAmountCurrency,
        tiers,
        rangeOverride: !!(t.override ?? t.Override ?? t.TAR_Override ?? false),
    };
}

export function formatContractDisplayLabel(contractDraft) {
    if (!contractDraft) return "";
    const ref = contractDraft.ContractReference?.trim() || "";
    const name = contractDraft.ContractName?.trim() || "";
    if (ref && name) return `${ref} - ${name}`;
    return ref || name || "";
}

const resolveContractDraftFromRecords = (contractId, contractRecords = []) => {
    if (contractId == null || contractId === "" || !contractRecords?.length) return null;
    const row = contractRecords.find(
        (r) => String(r.ContractID) === String(contractId)
    );
    return row ? JSON.parse(JSON.stringify(row)) : null;
};

export function hydrateContractDraft(draft, contractRecords = []) {
    if (!draft) return draft;
    const contractId =
        draft.planContractId
        ?? draft.contractDraft?.ContractID
        ?? null;
    const resolved = resolveContractDraftFromRecords(contractId, contractRecords);
    return {
        ...draft,
        planContractId: contractId ?? draft.planContractId ?? null,
        contractDraft: draft.contractDraft ?? resolved ?? null,
    };
}

export function mapApiPlanToDraft(item, lookups) {
    const { contractRecords, types, compTypes, settTypes, currencyOpts } = lookups;
    const p = item?.plan ?? item?.Plan;
    if (!p) return null;

    const planContractId = getProp(p, "contractID") ?? p.contractID ?? p.ContractID;
    const contractDraft = resolveContractDraftFromRecords(planContractId, contractRecords);

    const targetLookups = { currencyOpts, compTypes, settTypes };
    const rawTargets = item.targets ?? item.Targets ?? [];
    const targets = (rawTargets.length ? rawTargets : []).map((t) =>
        mapApiTargetToDraft(t, targetLookups)
    );

    const rawFees = item.fees ?? item.Fees ?? [];
    const fees = rawFees.map((f) => ({
        feeId: f.feeID ?? f.feeId ?? null,
        localId: `fee_${f.feeID ?? f.feeId ?? Date.now()}`,
        typeLabel: f.name ?? f.Name ?? null,
        currency: mapCurrencyOpt(currencyOpts, f.currency ?? f.Currency),
        amount: f.amount ?? f.Amount ?? "",
        settlementTypeId: settTypes.find((o) => o.value === String(f.settlementType ?? f.SettlementType ?? "")) || null,
    }));

    return {
        recordId: p.planID ?? p.PlanID,
        _status: "saved",
        planContractId: planContractId ?? null,
        contractDraft,
        plan: {
            typeId: types.find((o) => o.value === String(p.typeID)) || null,
            planName: p.planName || "",
            remarks: (p.remarks ?? p.Remarks ?? "").slice(0, 500),
            active: contractDraft?.Active ?? !!p.active,
        },
        fees,
        targets: targets.length ? targets : [createEmptyTarget(1)],
    };
}

export const resolvePlanContractId = (draft) => {
    const cd = draft?.contractDraft;
    if (cd?.ContractID) {
        const id = cd.ContractID;
        if (String(id).startsWith("new_")) return null;
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) return n;
    }
    const fallback = draft?.planContractId;
    if (fallback == null || fallback === "") return null;
    const n = Number(fallback);
    return Number.isFinite(n) && n > 0 ? n : null;
};

export function getContractLabelForPlanRow(draft, contractRecords = []) {
    const hydrated = hydrateContractDraft(draft, contractRecords);
    const label = formatContractDisplayLabel(hydrated.contractDraft);
    if (label) {
        return { draft: hydrated, label };
    }
    const contractId = resolvePlanContractId(hydrated);
    if (contractId != null) {
        return { draft: hydrated, label: `Contract #${contractId}` };
    }
    return { draft: hydrated, label: "" };
}

export function mapDraftToPayload(draft) {
    const isNew = draft.recordId < 0;
    const p = draft.plan;
    const contractCurrency = resolveContractCurrencyCode(draft);

    return {
        plan: {
            planID: isNew ? null : draft.recordId,
            contractID: resolvePlanContractId(draft),
            typeID: p.typeId?.value ? Number(p.typeId.value) : null,
            planName: p.planName,
            remarks: p.remarks?.trim() || null,
            active: !!draft.contractDraft?.Active,
        },
        fees: (draft.fees || []).map((f) => ({
            feeID: f.feeId || null,
            name: f.typeLabel?.trim() || null,
            currency: contractCurrency ?? f.currency?.value ?? f.currency ?? null,
            amount: f.amount !== "" && f.amount != null ? Number(f.amount) : null,
            settlementType: f.settlementTypeId?.value ? Number(f.settlementTypeId.value) : null,
        })),
        targets: (draft.targets || [])
            .filter((t) => !isEmptyTarget(t))
            .map((t) => {
            const isRange = (t.targetType || "formula") === "range";
            const rebateValueType = isRange
                ? null
                : normalizeRebateValueType(t.rebateValueType);
            const flatConditions = isRange
                ? tiersToFlatConditions(t)
                : conditionGroupsToFlat(t.conditionGroups);
            const stampedConditions = contractCurrency
                ? flatConditions.map((c) => ({
                    ...c,
                    currency: normalizeRebateValueType(c.type ?? "F") === "P"
                        ? null
                        : contractCurrency,
                    salesAmountCurrency: c.conditionType === "S" ? contractCurrency : c.salesAmountCurrency,
                }))
                : flatConditions;
            return {
            targetID: t.targetId || null,
            targetName: t.targetName,
            fromDate: formatLocalDateYmd(t.fromDate),
            toDate: formatLocalDateYmd(t.toDate),
            rebateValue: isRange
                ? null
                : (t.rebateValue !== "" && t.rebateValue != null ? Number(t.rebateValue) : null),
            rebateValueType,
            currency: isRange
                ? null
                : (rebateValueType === "P" ? null : (contractCurrency ?? (t.currency?.value || null))),
            targetType: isRange ? "R" : "F",
            override: !!(t.rangeOverride ?? false),
            computationTypeID: t.computationTypeId?.value ? Number(t.computationTypeId.value) : null,
            settlementTypeID: t.settlementTypeId?.value ? Number(t.settlementTypeId.value) : null,
            conditions: stampedConditions,
            references: (t.references || []).map((r) => ({
                targetReferenceId: r.targetReferenceId || null,
                referenceType: r.referenceType,
                stkRecId: r.stkRecId || null,
                itemTypeRecId: r.itemTypeRecId || null,
            })),
        };
        }),
    };
}

export function summarizeDateRange(targets = []) {
    const dates = targets
        .flatMap((t) => [t.fromDate, t.toDate])
        .filter(Boolean)
        .map((d) => moment(d));
    if (!dates.length) return "-";
    const min = moment.min(dates);
    const max = moment.max(dates);
    return `${min.format("DD-MM-YYYY")} → ${max.format("DD-MM-YYYY")}`;
}

export function createEmptyPlanDraft(recordId) {
    return {
        recordId,
        _status: "new",
        planContractId: null,
        contractDraft: null,
        plan: {
            typeId: null,
            planName: "",
            remarks: null,
            active: true,
        },
        fees: [],
        targets: [createEmptyTarget(1)],
    };
}

export { getProp };
