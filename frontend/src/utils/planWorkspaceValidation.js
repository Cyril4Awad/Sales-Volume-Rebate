import moment from "moment";
import { CONTRACT_DOCUMENT_MIME } from "./contractWorkspaceMappers";
import { applyContractCurrencyToDraft, optionToCode, resolveContractCurrencyCode } from "./contractCurrency";
import {
    getConditionGroupSaveErrors,
    simplifyRedundantRangeConditions,
} from "../Forms/Plans/utils/targetConditionValidation";
import { getTierSaveErrors, resolveTierConditionType } from "../Forms/Plans/utils/targetTierValidation";
import {
    buildSettlementTypesMap,
    getPeriodLength,
    nthPeriodBoundary,
} from "./settlementPaymentLogic";
import { isEmptyTarget } from "./conditionGroups";

const fmtValidationDate = (d) => moment(d).format("DD-MM-YYYY");

const isFilled = (v) => v !== "" && v != null && v !== undefined;

const hasSelectValue = (sel) => {
    if (sel == null || sel === "") return false;
    if (typeof sel === "object") {
        const v = sel.value;
        return v != null && String(v).trim() !== "";
    }
    return String(sel).trim() !== "";
};

const isPercentageAlias = (s) => {
    const u = s.trim().toUpperCase();
    if (u === "P" || u === "PERCENTAGE" || u === "PERCENT" || u === "%") return true;
    return s.toLowerCase().includes("percent");
};

const isFixedAlias = (s) => {
    const u = s.trim().toUpperCase();
    if (u === "F" || u === "FIXED" || u === "FIX") return true;
    return s.toLowerCase().includes("fixed");
};

/** Normalize rebate type to 'F' | 'P' from string or select object. */
export function normalizeRebateValueType(raw) {
    if (raw == null || raw === "") return "F";
    const v = raw && typeof raw === "object" ? (raw.value ?? raw.label ?? raw) : raw;
    const s = String(v ?? "").trim();
    if (!s) return "F";
    if (isPercentageAlias(s)) return "P";
    if (isFixedAlias(s)) return "F";
    if (raw && typeof raw === "object" && raw.label) {
        const label = String(raw.label);
        if (label.toLowerCase().includes("percent")) return "P";
        if (label.toLowerCase().includes("fixed")) return "F";
    }
    return s.toUpperCase() === "P" ? "P" : "F";
};

/** True when contract start + one full settlement period falls on or before contract end. */
export function settlementPeriodFitsContract(startDate, endDate, periodLength) {
    if (!startDate || !endDate || periodLength == null) return true;
    const firstBoundary = nthPeriodBoundary(startDate, periodLength, 1);
    if (!firstBoundary?.isValid()) return false;
    return !firstBoundary.isAfter(moment(endDate), "day");
}

export function settlementPeriodErrorSuffix(startDate, endDate, periodLength, rangeKind = "contract") {
    const label = rangeKind === "target" ? "target" : "contract";
    return `(${label}: ${fmtValidationDate(startDate)} - ${fmtValidationDate(endDate)}, period: ${periodLength} months)`;
}

const SETTLEMENT_PERIOD_ERROR_CONTRACT =
    "Settlement period does not fit within the contract date range. The contract must run at least one full settlement period (contract start + period length must fall on or before contract end).";

const SETTLEMENT_PERIOD_ERROR_TARGET =
    "Settlement period does not fit within the target date range. The target must run at least one full settlement period (target start + period length must fall on or before target end).";

function checkSettlementPeriodFit(settlementTypeId, rangeStart, rangeEnd, settlementTypesMap, rangeKind = "contract") {
    if (!hasSelectValue(settlementTypeId) || !rangeStart || !rangeEnd) {
        return { fits: true, message: null };
    }
    const period = getPeriodLength(settlementTypeId, settlementTypesMap);
    if (!period.valid) return { fits: true, message: null };
    const fits = settlementPeriodFitsContract(rangeStart, rangeEnd, period.value);
    if (fits) return { fits: true, message: null };
    const prefix = rangeKind === "target" ? SETTLEMENT_PERIOD_ERROR_TARGET : SETTLEMENT_PERIOD_ERROR_CONTRACT;
    return {
        fits: false,
        message: `${prefix} ${settlementPeriodErrorSuffix(rangeStart, rangeEnd, period.value, rangeKind)}`,
    };
}

export function getTargetFieldErrors(t, contractDates = null, settlementContext = null) {
    const fieldErrors = {};
    if (!t.targetName?.trim()) fieldErrors.targetName = true;
    if (!t.fromDate) fieldErrors.fromDate = true;
    if (!t.toDate) fieldErrors.toDate = true;
    if (t.fromDate && t.toDate && moment(t.toDate).isBefore(moment(t.fromDate))) {
        fieldErrors.fromDate = true;
        fieldErrors.toDate = true;
    }
    if (contractDates) {
        if (t.fromDate && moment(t.fromDate).isBefore(moment(contractDates.startDate), "day"))
            fieldErrors.fromDate = true;
        if (t.toDate && moment(t.toDate).isAfter(moment(contractDates.endDate), "day"))
            fieldErrors.toDate = true;
    }
    if (!hasSelectValue(t.computationTypeId)) fieldErrors.computationTypeId = true;
    if (!hasSelectValue(t.settlementTypeId)) fieldErrors.settlementTypeId = true;

    const isRange = (t.targetType || "formula") === "range";
    if (isRange && !resolveTierConditionType(t.tierConditionType, t.tiers)) {
        fieldErrors.tierConditionType = true;
    }

    if (settlementContext?.settlementTypesMap && contractDates?.startDate && contractDates?.endDate) {
        const periodCheck = checkSettlementPeriodFit(
            t.settlementTypeId,
            contractDates.startDate,
            contractDates.endDate,
            settlementContext.settlementTypesMap
        );
        if (!periodCheck.fits) fieldErrors.settlementTypeId = true;
    }

    if (settlementContext?.settlementTypesMap && t.fromDate && t.toDate) {
        const targetPeriodCheck = checkSettlementPeriodFit(
            t.settlementTypeId,
            t.fromDate,
            t.toDate,
            settlementContext.settlementTypesMap,
            "target"
        );
        if (!targetPeriodCheck.fits) fieldErrors.settlementTypeId = true;
    }

    const rebateSet = t.rebateValue !== "" && t.rebateValue != null;
    const rebateNum = rebateSet ? Number(t.rebateValue) : NaN;

    if (!isRange) {
        if (!rebateSet || Number.isNaN(rebateNum) || rebateNum <= 0) {
            fieldErrors.rebateValue = true;
        }
        if (normalizeRebateValueType(t.rebateValueType) === "F" && !optionToCode(t.currency)) {
            fieldErrors.currency = true;
        }
    }
    return fieldErrors;
};

export function getFeeFieldErrors(f, settlementContext = null) {
    const fieldErrors = {};
    const amountSet = f.amount !== "" && f.amount != null;
    const amountNum = amountSet ? Number(f.amount) : NaN;

    if (!String(f.typeLabel ?? "").trim()) fieldErrors.typeLabel = true;
    if (!amountSet || Number.isNaN(amountNum)) fieldErrors.amount = true;
    if (amountSet && !Number.isNaN(amountNum) && !optionToCode(f.currency)) {
        fieldErrors.currency = true;
    }
    if (!hasSelectValue(f.settlementTypeId)) fieldErrors.settlementTypeId = true;

    if (settlementContext?.settlementTypesMap
        && settlementContext.contractStart
        && settlementContext.contractEnd) {
        const periodCheck = checkSettlementPeriodFit(
            f.settlementTypeId,
            settlementContext.contractStart,
            settlementContext.contractEnd,
            settlementContext.settlementTypesMap
        );
        if (!periodCheck.fits) fieldErrors.settlementTypeId = true;
    }

    return fieldErrors;
}

export function validateFees(fees = [], settlementContext = null) {
    const errors = [];
    const fieldErrorsByFee = {};
    const rows = fees ?? [];

    rows.forEach((f, index) => {
        const fe = getFeeFieldErrors(f, settlementContext);
        const label = String(f.typeLabel ?? "").trim() || `Fee ${index + 1}`;
        const amountNum = f.amount !== "" && f.amount != null ? Number(f.amount) : NaN;

        if (fe.typeLabel) errors.push(`${label}: fee name is required`);
        if (fe.amount && (f.amount === "" || f.amount == null || Number.isNaN(amountNum))) {
            errors.push(`${label}: amount is required`);
        }
        if (fe.currency) {
            const feeName = String(f.typeLabel ?? "").trim() || "unnamed";
            errors.push(`Fee "${feeName}": currency is required when fee amount is set`);
        }
        if (fe.settlementTypeId && !hasSelectValue(f.settlementTypeId)) {
            errors.push(`${label}: settlement type is required`);
        }

        if (settlementContext?.settlementTypesMap
            && settlementContext.contractStart
            && settlementContext.contractEnd
            && hasSelectValue(f.settlementTypeId)) {
            const periodCheck = checkSettlementPeriodFit(
                f.settlementTypeId,
                settlementContext.contractStart,
                settlementContext.contractEnd,
                settlementContext.settlementTypesMap
            );
            if (!periodCheck.fits) errors.push(`${label}: ${periodCheck.message}`);
        }

        if (Object.keys(fe).length && f.localId) {
            fieldErrorsByFee[f.localId] = fe;
        }
    });

    return { errors: [...new Set(errors)], fieldErrorsByFee };
}

export function validateConditionGroups(groups = [], usdRate = null) {
    return getConditionGroupSaveErrors(groups, usdRate);
}

const hasClientId = (cd) => {
    if (!cd?.ClientID) return false;
    return hasSelectValue(cd.ClientID);
};

const hasContractDraft = (draft) => !!draft?.contractDraft;

export function validateContractDraft(cd) {
    const errors = [];
    const fieldErrors = {};

    if (!cd) {
        return { errors, fieldErrors };
    }

    if (!hasClientId(cd)) {
        errors.push("Main client is required");
    }
    if (!cd.ContractReference?.trim()) {
        errors.push("Contract reference is required");
        fieldErrors.ContractReference = true;
    }
    if (!cd.ContractName?.trim()) {
        errors.push("Contract name is required");
        fieldErrors.ContractName = true;
    }
    if (!cd.StartDate) {
        errors.push("Contract start date is required");
        fieldErrors.StartDate = true;
    }
    if (!cd.EndDate) {
        errors.push("Contract end date is required");
        fieldErrors.EndDate = true;
    }
    if (cd.StartDate && cd.EndDate && moment(cd.StartDate).isAfter(moment(cd.EndDate))) {
        errors.push("Contract end date must be on or after start date");
        fieldErrors.StartDate = true;
        fieldErrors.EndDate = true;
    }

    const currentYear = moment().year();
    if (cd.StartDate && moment(cd.StartDate).year() < currentYear) {
        errors.push(`Contract start date cannot be in a year before ${currentYear}`);
        fieldErrors.StartDate = true;
    }
    if (cd.EndDate && moment(cd.EndDate).year() < currentYear) {
        errors.push(`Contract end date cannot be in a year before ${currentYear}`);
        fieldErrors.EndDate = true;
    }

    if (!hasSelectValue(cd.contractCurrency)) {
        errors.push("Contract currency is required");
        fieldErrors.contractCurrency = true;
    }

    const doc = cd.Document;
    if (doc?.file instanceof File) {
        const name = (doc.file.name ?? "").toLowerCase();
        const type = (doc.file.type ?? "").toLowerCase();
        const extOk = name.endsWith(".pdf");
        const typeOk = !type || type === CONTRACT_DOCUMENT_MIME;
        if (!extOk || !typeOk) {
            errors.push("Contract document must be a PDF file");
        }
    }

    return { errors: [...new Set(errors)], fieldErrors };
}

/** Clears currency on percentage targets (silent; no validation message). */
export function normalizePlanDraftRebateCurrency(draft) {
    if (!draft?.targets?.length) return draft;
    return {
        ...draft,
        targets: draft.targets.map((t) => {
            const type = normalizeRebateValueType(t.rebateValueType);
            return type === "P" ? { ...t, currency: null } : t;
        }),
    };
}

/** Merges matching >= X and <= X into = X on each target's condition groups. */
export function normalizePlanDraftConditionGroups(draft) {
    if (!draft?.targets?.length) return draft;
    return {
        ...draft,
        targets: draft.targets.map((t) => ({
            ...t,
            conditionGroups: (t.conditionGroups || []).map(
                (g) => simplifyRedundantRangeConditions(g).group
            ),
        })),
    };
}

/** Rebate currency + condition simplification before validate/apply/save. */
export function normalizePlanDraft(draft, currencyOpts = []) {
    return applyContractCurrencyToDraft(
        normalizePlanDraftConditionGroups(
            normalizePlanDraftRebateCurrency(draft)
        ),
        currencyOpts
    );
}

/**
 * Validates a plan workspace draft. Returns all error messages (empty when valid).
 */
export function validatePlanDraft(draft, { usdRate = null, currencyOpts = [], settlementTypeOptions = [] } = {}) {
    draft = normalizePlanDraft(draft, currencyOpts);
    const errors = [];
    const fieldErrorsByTarget = {};
    let fieldErrorsByFee = {};
    let fieldErrorsContract = {};

    const settlementTypesMap = buildSettlementTypesMap(settlementTypeOptions);

    if (!draft) {
        return {
            valid: false,
            errors: ["Plan data is missing"],
            fieldErrorsByTarget,
            fieldErrorsByFee,
            fieldErrorsContract,
        };
    }

    const p = draft.plan || {};
    const planChecks = [
        [!hasContractDraft(draft), "Contract is required"],
        [!hasSelectValue(p.typeId), "VR Type is required"],
        [!p.planName?.trim(), "Plan name is required"],
    ];
    for (const [fail, msg] of planChecks) {
        if (fail) errors.push(msg);
    }

    if (draft.contractDraft) {
        const contractValidation = validateContractDraft(draft.contractDraft);
        errors.push(...contractValidation.errors);
        fieldErrorsContract = contractValidation.fieldErrors;
    }

    const contractStart = draft.contractDraft?.StartDate;
    const contractEnd = draft.contractDraft?.EndDate;
    const contractDates = contractStart || contractEnd
        ? { startDate: contractStart, endDate: contractEnd }
        : null;
    const settlementContext = {
        settlementTypesMap,
        contractStart,
        contractEnd,
    };

    const feeValidation = validateFees(draft.fees, settlementContext);
    errors.push(...feeValidation.errors);
    fieldErrorsByFee = feeValidation.fieldErrorsByFee;

    const targets = draft.targets || [];
    const fees = draft.fees || [];
    if (!targets.length && !fees.length) {
        errors.push("Plan must have at least one fee or target");
    }

    for (const t of targets) {
        if (isEmptyTarget(t) && fees.length > 0) continue;

        const name = t.targetName?.trim() || "Unnamed target";
        const isRange = (t.targetType || "formula") === "range";

        if (!t.targetName?.trim()) {
            errors.push("Each target needs a name");
        }
        if (!t.fromDate || !t.toDate) {
            errors.push(`Target "${name}": from and to dates are required`);
        } else if (moment(t.toDate).isBefore(moment(t.fromDate))) {
            errors.push(`Target "${name}": end date must be on or after start date`);
        }

        if (contractStart && t.fromDate
            && moment(t.fromDate).isBefore(moment(contractStart), "day")) {
            errors.push(
                `Target "${name}": start date cannot be before contract start (${fmtValidationDate(contractStart)})`
            );
        }

        if (contractEnd && t.toDate
            && moment(t.toDate).isAfter(moment(contractEnd), "day")) {
            errors.push(
                `Target "${name}": end date cannot be after contract end (${fmtValidationDate(contractEnd)})`
            );
        }

        if (!hasSelectValue(t.computationTypeId)) {
            errors.push(`Target "${name}": computation type is required`);
        }
        if (!hasSelectValue(t.settlementTypeId)) {
            errors.push(`Target "${name}": settlement type is required`);
        }

        if (contractStart && contractEnd && hasSelectValue(t.settlementTypeId)) {
            const periodCheck = checkSettlementPeriodFit(
                t.settlementTypeId,
                contractStart,
                contractEnd,
                settlementTypesMap
            );
            if (!periodCheck.fits) {
                errors.push(`Target "${name}": ${periodCheck.message}`);
            }
        }

        if (t.fromDate && t.toDate && hasSelectValue(t.settlementTypeId)) {
            const targetPeriodCheck = checkSettlementPeriodFit(
                t.settlementTypeId,
                t.fromDate,
                t.toDate,
                settlementTypesMap,
                "target"
            );
            if (!targetPeriodCheck.fits) {
                errors.push(`Target "${name}": ${targetPeriodCheck.message}`);
            }
        }

        if (isRange) {
            errors.push(...getTierSaveErrors(t, resolveContractCurrencyCode(draft)));
        } else {
            const rebateSet = t.rebateValue !== "" && t.rebateValue != null;
            const rebateNum = rebateSet ? Number(t.rebateValue) : NaN;
            const rebateType = normalizeRebateValueType(t.rebateValueType);

            // Rebate value always required for formula targets
            if (!rebateSet || Number.isNaN(rebateNum) || rebateNum <= 0) {
                errors.push(`Target "${name}": rebate value is required and must be greater than zero`);
                const fe = fieldErrorsByTarget[t.localId] ?? {};
                fe.rebateValue = true;
                if (t.localId) fieldErrorsByTarget[t.localId] = fe;
            }

            if (rebateType === "F" && !optionToCode(t.currency)) {
                errors.push(`Target "${name}": currency is required for fixed rebate`);
            }

            const condErrors = validateConditionGroups(t.conditionGroups, usdRate);
            for (const msg of condErrors) {
                errors.push(`Target "${name}": ${msg}`);
            }
        }

        for (const r of t.references || []) {
            if (r.referenceType === "StockItem" && !(Number(r.stkRecId) > 0)) {
                errors.push(`Target "${name}": a stock item reference has an invalid or missing item ID`);
            }
            if (r.referenceType === "ProductGroup" && !(Number(r.itemTypeRecId) > 0)) {
                errors.push(`Target "${name}": a product group reference has an invalid or missing item ID`);
            }
        }

        const fe = getTargetFieldErrors(t, contractDates, settlementContext);
        if (Object.keys(fe).length && t.localId) {
            fieldErrorsByTarget[t.localId] = { ...(fieldErrorsByTarget[t.localId] ?? {}), ...fe };
        }
    }

    return {
        valid: errors.length === 0,
        errors,
        fieldErrorsByTarget,
        fieldErrorsByFee,
        fieldErrorsContract,
    };
}
