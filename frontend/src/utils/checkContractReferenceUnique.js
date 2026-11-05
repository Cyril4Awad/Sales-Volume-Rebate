import { getContractsApi } from "./contractWorkspaceMappers";

/**
 * Returns true when the reference is available (not used by another contract).
 */
export async function checkContractReferenceUnique(authAxios, reference, excludeContractId = null) {
    const ref = (reference ?? "").trim();
    if (!ref) return true;

    const params = { reference: ref };
    const id = excludeContractId;
    if (id != null && !String(id).startsWith("new_")) {
        const n = Number(id);
        if (Number.isFinite(n) && n > 0) params.excludeContractId = n;
    }

    const { data } = await authAxios.get(`${getContractsApi()}/reference-exists`, { params });
    return !(data?.exists ?? data?.Exists);
}
