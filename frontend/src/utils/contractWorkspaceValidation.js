import moment from "moment";
import { normalizeContractRef, CONTRACT_DOCUMENT_MIME } from "./contractWorkspaceMappers";

const sameContractId = (a, b) => String(a ?? "") === String(b ?? "");

export function validateContractDraft(draft, allRecords = [], editingContractId = null) {
    const errors = [];
    if (!draft) {
        return { valid: false, errors: ["Contract data is missing"] };
    }

    if (!draft.ClientID) {
        errors.push("Main client is required");
    }
    if (!draft.ContractReference?.trim()) {
        errors.push("Contract reference is required");
    }
    if (!draft.ContractName?.trim()) {
        errors.push("Contract name is required");
    }
    if (!draft.StartDate) {
        errors.push("Start date is required");
    }
    if (!draft.EndDate) {
        errors.push("End date is required");
    }
    if (draft.StartDate && draft.EndDate && moment(draft.StartDate).isAfter(moment(draft.EndDate))) {
        errors.push("End date must be on or after start date");
    }

    const currentYear = moment().year();
    if (draft.StartDate && moment(draft.StartDate).year() < currentYear) {
        errors.push(`Contract start date cannot be in a year before ${currentYear}`);
    }
    if (draft.EndDate && moment(draft.EndDate).year() < currentYear) {
        errors.push(`Contract end date cannot be in a year before ${currentYear}`);
    }

    const refN = normalizeContractRef(draft.ContractReference);
    const dupRef = allRecords.some(
        (row) =>
            normalizeContractRef(row.ContractReference) === refN &&
            !sameContractId(row.ContractID, editingContractId)
    );
    if (dupRef) {
        errors.push("Contract with the same reference already exists");
    }

    const doc = draft.Document;
    if (doc?.file instanceof File) {
        const name = (doc.file.name ?? "").toLowerCase();
        const type = (doc.file.type ?? "").toLowerCase();
        const extOk = name.endsWith(".pdf");
        const typeOk = !type || type === CONTRACT_DOCUMENT_MIME;
        if (!extOk || !typeOk) {
            errors.push("Contract document must be a PDF file");
        }
    }

    return { valid: errors.length === 0, errors };
}
