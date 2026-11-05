export function getSimulationPreCheckErrors() {
    return [];
}

export function buildResolvedFromPlanDraft(draft, { settlementTypeOptions = [] } = {}) {
    const cd = draft?.contractDraft;
    if (!cd) return { error: "Contract is required" };

    const mainClientId = Number(
        cd.ClientID?.value ?? cd.ClientID ?? cd.clientId ?? 0
    );
    if (!Number.isFinite(mainClientId) || mainClientId <= 0) {
        return { error: "Main client is required" };
    }

    const subClientIds = (cd.SubClients ?? [])
        .map((sc) => Number(sc?.ClientID?.value ?? sc?.ClientID ?? sc?.clientId ?? 0))
        .filter((id) => Number.isFinite(id) && id > 0);

    const allClientIds = [...new Set([mainClientId, ...subClientIds])];

    const contractCurrency =
        cd.contractCurrency?.value
        ?? cd.contractCurrency?.label
        ?? cd.contractCurrency
        ?? null;

    return {
        contract: cd,
        contractCurrency: contractCurrency ? String(contractCurrency).trim().toUpperCase() : null,
        plan: draft.plan ?? {},
        targets: draft.targets ?? [],
        fees: draft.fees ?? [],
        settlementTypeOptions,
        mainClientId,
        allClientIds,
        clientRole: "Master Client",
    };
}
