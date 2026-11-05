import {
    buildContractPayload,
    contractRowChangedFromBaseline,
    subClientsChangedFromBaseline,
    syncSubClientsForContract,
    getContractsApi,
    getProp,
} from "../../../utils/contractWorkspaceMappers";

export function contractNeedsPersist(contractDraft, contractRecords = []) {
    if (!contractDraft) return false;
    if (contractDraft._isNew) return true;
    const baseline = contractRecords.find(
        (r) => String(r.ContractID) === String(contractDraft.ContractID)
    );
    return (
        contractRowChangedFromBaseline(contractDraft, baseline) ||
        subClientsChangedFromBaseline(contractDraft, baseline)
    );
}

/** Map API / SQL errors to user-friendly contract persist messages. */
export function mapContractPersistError(err) {
    const data = err?.response?.data;
    const raw = (
        (typeof data === "string" ? data : null)
        ?? data?.error
        ?? data?.title
        ?? err?.message
        ?? "Contract save failed"
    ).toString();

    if (/UQ_CVR_Contracts_Ref|2627|unique|duplicate/i.test(raw)) {
        return new Error("Contract reference must be unique");
    }
    if (/515|cannot insert the value null|NOT NULL/i.test(raw)) {
        if (/ContractReference|CTR_ContractReference/i.test(raw)) {
            return new Error("Contract reference is required");
        }
        if (/ClientID|CTR_ClientID/i.test(raw)) {
            return new Error("Main client is required");
        }
        return new Error("Required contract information is missing");
    }
    if (/547|FOREIGN KEY|FK_CVR_Contracts_Clients/i.test(raw)) {
        return new Error("Invalid client selected");
    }
    if (/8152|truncated/i.test(raw)) {
        return new Error("One or more contract fields exceed the maximum allowed length");
    }

    return err instanceof Error ? err : new Error(raw);
}

/**
 * Persists a staged contract draft. Returns numeric contract id.
 */
export async function persistPlanContract(authAxios, contractDraft, contractRecords = []) {
    if (!contractDraft) return null;

    const baseline = contractRecords.find(
        (r) => String(r.ContractID) === String(contractDraft.ContractID)
    );
    const headerChanged = contractDraft._isNew || contractRowChangedFromBaseline(contractDraft, baseline);
    const subChanged = subClientsChangedFromBaseline(contractDraft, baseline);

    if (!headerChanged && !subChanged) {
        const existingId = contractDraft.ContractID;
        return existingId != null && !String(existingId).startsWith("new_")
            ? Number(existingId)
            : null;
    }

    let contractId = contractDraft.ContractID;

    try {
        if (headerChanged) {
            if (contractDraft._isNew) {
                const res = await authAxios.post(getContractsApi(), buildContractPayload(contractDraft));
                contractId = getProp(res.data, "CTR_ContractID");
            } else {
                await authAxios.put(
                    `${getContractsApi()}/${contractId}`,
                    buildContractPayload(contractDraft)
                );
            }
        }

        if (subChanged) {
            await syncSubClientsForContract(authAxios, contractId, contractDraft, baseline);
        }
    } catch (err) {
        throw mapContractPersistError(err);
    }

    return Number(contractId);
}
