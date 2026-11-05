import { getApiBase } from "../globals";
import { fetchAndMapContracts } from "./contractWorkspaceMappers";
import { fetchCurrencySelectOptions } from "./currencySelectOptions";
import { mapApiPlanToDraft } from "./planWorkspaceMappers";
import { inferContractCurrencyFromDraft, optionToCode } from "./contractCurrency";

// Import cache from Plans page — reuses the already-loaded workspace data
// when the user navigates Plans → Computation within the TTL window.
// If Plans wasn't visited or cache is stale, falls back to fetching fresh.
let _workspaceCache = null;
try {
    // Dynamic import to avoid circular dependency issues at build time
    const mod = require("../Forms/Plans/VRPlansWorkspace");
    _workspaceCache = mod?.workspaceCache ?? null;
} catch {
    _workspaceCache = null;
}

const toArray = (v) => (Array.isArray(v) ? v : []);

const getProp = (obj, key) => {
    if (!obj) return undefined;
    const match = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    return match !== undefined ? obj[match] : undefined;
};

const parseApiDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const pickMostRecentlyModified = (workspaceItems = []) => {
    const items = toArray(workspaceItems);
    if (items.length <= 1) return items[0] ?? null;
    const scored = items.map((item) => {
        const plan = item?.plan ?? item?.Plan ?? {};
        const md = parseApiDate(getProp(plan, "PLN_MDStamp") ?? getProp(plan, "mdStamp") ?? getProp(plan, "MDStamp"));
        const cd = parseApiDate(getProp(plan, "PLN_CDStamp") ?? getProp(plan, "cdStamp") ?? getProp(plan, "CDStamp"));
        const ts = (md ?? cd)?.getTime?.() ?? 0;
        return { item, ts };
    });
    scored.sort((a, b) => b.ts - a.ts);
    return scored[0]?.item ?? null;
};

const getClientIdFromContract = (c) =>
    Number(c?.ClientID?.value) ||
    Number(c?.clientId) ||
    Number(c?.ClientID) ||
    Number(c?.CTR_ClientID) ||
    0;

const clientMatchesContract = (clientId, contract) => {
    const id = Number(clientId);
    if (!Number.isFinite(id) || id <= 0) return false;
    if (getClientIdFromContract(contract) === id) return true;
    return toArray(contract?.SubClients).some(
        (sc) =>
            Number(sc?.ClientID?.value) === id ||
            Number(sc?.ClientID) === id ||
            Number(sc?.clientId) === id
    );
};

export function findClientContracts(clientId, contractRecords) {
    const id = Number(clientId);
    if (!Number.isFinite(id) || id <= 0) return [];
    return toArray(contractRecords).filter((c) => clientMatchesContract(id, c));
}

const getPlanContractId = (item) => {
    const plan = item?.plan ?? item?.Plan;
    if (!plan) return null;
    const planContractId = Number(
        getProp(plan, "ContractID") ?? getProp(plan, "PLN_ContractID") ??
        plan.contractID ?? plan.contractId
    );
    return Number.isFinite(planContractId) ? planContractId : null;
};

const findContractById = (contractRecords, contractId) =>
    toArray(contractRecords).find((c) => Number(c?.ContractID) === contractId) ?? null;

const buildClientContext = (contract, clientId) => {
    const id = Number(clientId);
    const isMainClient =
        Number(contract?.ClientID?.value) === id ||
        Number(contract?.clientId) === id ||
        Number(contract?.ClientID) === id ||
        Number(contract?.CTR_ClientID) === id;

    const clientRole = isMainClient ? "Master Client" : "Branch (Sub-client)";

    const mainClientId =
        Number(contract?.ClientID?.value) ||
        Number(contract?.clientId) ||
        Number(contract?.ClientID) ||
        Number(contract?.CTR_ClientID);

    const subClientIds = toArray(contract?.SubClients)
        .map((sc) =>
            Number(sc?.ClientID?.value) ||
            Number(sc?.ClientID) ||
            Number(sc?.clientId)
        )
        .filter((cid) => Number.isFinite(cid) && cid > 0);

    const allClientIds = [...new Set([mainClientId, ...subClientIds])].filter(
        (cid) => Number.isFinite(cid) && cid > 0
    );

    return { clientRole, mainClientId, subClientIds, allClientIds };
};

async function loadResolverContext(authAxios) {
    const workspacePromise = (_workspaceCache?.isValid())
        ? Promise.resolve({ data: _workspaceCache.data })
        : authAxios.get(`${getApiBase()}/CVRPlanWorkspace`);

    const [contractsResult, workspaceRes, currencyOpts, typesRes, settTypesRes] = await Promise.all([
        fetchAndMapContracts(authAxios),
        workspacePromise,
        fetchCurrencySelectOptions().catch(() => []),
        authAxios.get(`${getApiBase()}/CVRTypes`).catch(() => ({ data: [] })),
        authAxios.get(`${getApiBase()}/CVRSettlementTypes`).catch(() => ({ data: [] })),
    ]);

    if (!_workspaceCache?.isValid() && _workspaceCache && workspaceRes?.data) {
        _workspaceCache.set(workspaceRes.data);
    }

    const contractRecords = contractsResult?.mappedContracts ?? [];
    const workspaceItems = toArray(workspaceRes?.data);

    const types = toArray(typesRes?.data).map((t) => ({
        value: String(getProp(t, "VRT_TypeID") ?? t.typeID ?? ""),
        label: getProp(t, "VRT_TypeName") ?? t.typeName ?? "",
    }));

    const settTypes = toArray(settTypesRes?.data).map((t) => ({
        value: String(t.STT_SettlementTypeID ?? t.sTT_SettlementTypeID ?? t.settlementTypeID ?? ""),
        label: t.STT_SettlementTypeName ?? t.sTT_SettlementTypeName ?? t.settlementTypeName ?? "",
        periodLength: Number(getProp(t, "STT_PeriodLength") ?? t.periodLength ?? 0),
    }));

    const mapLookups = { contractRecords, types, compTypes: [], settTypes, currencyOpts };

    return { contractRecords, workspaceItems, mapLookups };
}

function buildCandidatesForClient(clientId, contractRecords, workspaceItems, mapLookups) {
    const contracts = findClientContracts(clientId, contractRecords);
    const candidates = [];

    for (const contract of contracts) {
        if (!contract?.Active) continue;
        const contractId = Number(contract?.ContractID);
        if (!Number.isFinite(contractId)) continue;

        const matchingPlans = workspaceItems.filter((item) => getPlanContractId(item) === contractId);
        for (const workspaceItem of matchingPlans) {
            const draft = mapApiPlanToDraft(workspaceItem, mapLookups);
            if (draft?.plan) {
                candidates.push({ contract, workspaceItem, draft });
            }
        }
    }

    return { contracts, candidates };
}

export async function listClientPlanCandidates(clientId, authAxios) {
    const id = Number(clientId);
    if (!Number.isFinite(id) || id <= 0) return { contractRecords: [], contracts: [], candidates: [] };
    if (!authAxios) throw new Error("authAxios is required");

    const { contractRecords, workspaceItems, mapLookups } = await loadResolverContext(authAxios);
    const { contracts, candidates } = buildCandidatesForClient(id, contractRecords, workspaceItems, mapLookups);

    return { contractRecords, contracts, candidates };
}

function resolveFromWorkspaceItem(clientId, workspaceItem, contractRecords, mapLookups) {
    const contractId = getPlanContractId(workspaceItem);
    const contract = contractId != null ? findContractById(contractRecords, contractId) : null;
    if (!contract) return { error: "No plan linked to this client's contract" };

    const draft = mapApiPlanToDraft(workspaceItem, mapLookups);
    if (!draft?.plan) return { error: "No plan linked to this client's contract" };

    const { clientRole, mainClientId, allClientIds } = buildClientContext(contract, clientId);

    const contractCurrency =
        optionToCode(contract?.contractCurrency)
        ?? (() => {
            const raw = getProp(contract, "CTR_ContractCurrency");
            return raw ? String(raw).trim().toUpperCase() : null;
        })()
        ?? inferContractCurrencyFromDraft(draft)
        ?? "USD";

    return {
        contract,
        contractCurrency,
        planId: draft.recordId ?? null,
        plan: draft.plan,
        targets: draft.targets ?? [],
        fees: draft.fees ?? [],
        settlementTypeOptions: mapLookups?.settTypes ?? [],
        clientRole,
        allClientIds,
        mainClientId,
    };
}

export async function resolveClientPlan(clientId, authAxios, { workspaceItem } = {}) {
    const id = Number(clientId);
    if (!Number.isFinite(id) || id <= 0) return null;
    if (!authAxios) throw new Error("authAxios is required");

    const { contractRecords, workspaceItems, mapLookups } = await loadResolverContext(authAxios);

    if (workspaceItem) {
        return resolveFromWorkspaceItem(id, workspaceItem, contractRecords, mapLookups);
    }

    const { candidates } = buildCandidatesForClient(id, contractRecords, workspaceItems, mapLookups);
    if (!candidates.length) return { error: "No plan linked to this client's contract" };

    const selectedItem = pickMostRecentlyModified(candidates.map((c) => c.workspaceItem));
    if (!selectedItem) return { error: "No plan linked to this client's contract" };

    return resolveFromWorkspaceItem(id, selectedItem, contractRecords, mapLookups);
}
