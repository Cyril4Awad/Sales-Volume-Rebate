import { useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import axios from "axios";
import { getApiBase } from "../../globals";
import { AuthContext } from "../../ContextProvider/AuthContext";
import {
    fetchAndMapContracts,
    mergeContractRecordsForValidation,
    upsertContractInRecords,
} from "../../utils/contractWorkspaceMappers";
import { AdvancedTable, Notification } from "../../ReusableComponents";
import { triggerSessionExpired } from "../../utils/sessionExpired";
import { updateTokenFromResponse } from "../../utils/updateTokenFromResponse";
import PlanEditorModal from "./editor/PlanEditorModal/PlanEditorModal";
import {
    normalizePlanDraft,
    validatePlanDraft,
} from "../../utils/planWorkspaceValidation";
import {
    contractNeedsPersist,
    persistPlanContract,
} from "./utils/persistPlanContract";
import useUnsavedChangesBlocker from "../../CustomHooks/useUnsavedChangesBlocker";
import "./styles/VRPlansWorkspace.css";
import {
    mapApiPlanToDraft,
    mapDraftToPayload,
    createEmptyPlanDraft,
    getProp,
    hydrateContractDraft,
    hydratePlanDraftCurrencies,
    mapCurrencyOptionsFromApi,
    resolvePlanContractId,
} from "../../utils/planWorkspaceMappers";
import { buildPlanTableRow, getPlanWorkspaceTableColumns } from "../../utils/planWorkspaceTable";

// ─── Module-level workspace cache ─────────────────────────────────────────────
// Shared with computationPlanResolver so it never re-fetches what Plans already loaded.
// TTL: 2 minutes — stale after a save or explicit refresh.
const workspaceCache = {
    data: null,
    timestamp: 0,
    TTL_MS: 2 * 60 * 1000,
    isValid() { return this.data != null && (Date.now() - this.timestamp) < this.TTL_MS; },
    set(data) { this.data = data; this.timestamp = Date.now(); },
    invalidate() { this.data = null; this.timestamp = 0; },
};
export { workspaceCache };
// ──────────────────────────────────────────────────────────────────────────────

const toArray = (data) => (Array.isArray(data) ? data : []);

const stripUiFields = (draft) => {
    if (!draft) return draft;
    return {
        ...draft,
        targets: (draft.targets || []).map(({ referenceType, ...rest }) => rest),
    };
};

const EMPTY_MODAL_VALIDATION = {
    errors: [],
    fieldErrorsByTarget: {},
    fieldErrorsByFee: {},
    fieldErrorsContract: {},
};

const getErrMsg = (err) => {
    const raw =
        err?.response?.data?.error
        ?? err?.response?.data?.message
        ?? (typeof err?.response?.data === "string" ? err.response.data : null)
        ?? err?.message
        ?? "An unexpected error occurred";
    if (raw != null && typeof raw === "object") {
        return JSON.stringify(raw);
    }
    return String(raw);
};

export default function VRPlansWorkspace() {
    const { userData } = useContext(AuthContext);

    const authAxios = useMemo(() => {
        const instance = axios.create({
            headers: {
                Authorization: userData?.token ? `Bearer ${userData.token}` : "",
            },
        });
        instance.interceptors.request.use((config) => {
            const token = localStorage.getItem("token");
            if (token) config.headers.Authorization = `Bearer ${token}`;
            return config;
        });
        instance.interceptors.response.use(
            (response) => {
                updateTokenFromResponse(response);
                return response;
            },
            (error) => {
                if (error?.response?.status === 401) {
                    triggerSessionExpired();
                    return Promise.reject(error);
                }
                return Promise.reject(error);
            }
        );
        return instance;
    }, [userData]);

    const [contractRecords, setContractRecords]       = useState([]);
    const [clientLabelById, setClientLabelById]       = useState({});
    const [typeOptions, setTypeOptions]               = useState([]);
    const [computationTypeOptions, setComputationTypeOptions] = useState([]);
    const [settlementTypeOptions, setSettlementTypeOptions]   = useState([]);
    const [currencyOptions, setCurrencyOptions]       = useState([]);
    const [records, setRecords]                       = useState([]);
    const [loading, setLoading]                       = useState(false);
    const [modalOpen, setModalOpen]                   = useState(false);
    const [editingDraft, setEditingDraft]             = useState(null);
    const [modalValidation, setModalValidation] = useState(EMPTY_MODAL_VALIDATION);
    const [notification, setNotification]             = useState({
        type: "", title: "", message: "", display: "none",
    });
    const [usdRate, setUsdRate] = useState(null);
    const [lockStatusByContractId, setLockStatusByContractId] = useState({});
    const [editingReadOnly, setEditingReadOnly] = useState(false);

    const tempIdRef = useRef(-1);
    const lookupsRef = useRef({});

    const isDirty = useMemo(
        () => records.some((r) => ["new", "modified", "deleted"].includes(r._status)),
        [records]
    );
    const { discardModal } = useUnsavedChangesBlocker(isDirty);

    const showNotification = useCallback((type, title, message = "", duration = 3000) => {
        setNotification({ type, title, message, display: "block" });
        setTimeout(() => setNotification((prev) => ({ ...prev, display: "none" })), duration);
    }, []);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const contractPromise = fetchAndMapContracts(authAxios).catch((e) => {
                showNotification("error", "Failed to load contracts", getErrMsg(e));
                return { mappedContracts: [], labelMap: {} };
            });

            const currenciesPromise = authAxios
                .get(`${getApiBase()}/CVRPlanWorkspace/appCurrencies`)
                .catch(() => ({ data: [] }));

            const [contractResult, typesRes, compRes, settRes, workspaceRes, currenciesRes] = await Promise.all([
                contractPromise,
                authAxios.get(`${getApiBase()}/CVRTypes`),
                authAxios.get(`${getApiBase()}/CVRComputationTypes`),
                authAxios.get(`${getApiBase()}/CVRSettlementTypes`),
                authAxios.get(`${getApiBase()}/CVRPlanWorkspace`),
                currenciesPromise,
            ]);

            const typesData = typesRes.data;
            const compData = compRes.data;
            const settData = settRes.data;
            const workspaceData = workspaceRes.data;

            workspaceCache.set(workspaceData);

            const currencyOpts = mapCurrencyOptionsFromApi(currenciesRes?.data ?? []);
            setCurrencyOptions(currencyOpts);

            const { mappedContracts, labelMap } = contractResult;
            setContractRecords(mappedContracts);
            setClientLabelById(labelMap);

            const types = toArray(typesData).map((t) => ({
                value: String(getProp(t, "VRT_TypeID") ?? t.typeID ?? ""),
                label: getProp(t, "VRT_TypeName") ?? t.typeName ?? "",
                active: !!getProp(t, "VRT_Active"),
            }));
            const compTypes = toArray(compData).map((t) => ({
                value: String(t.FRT_ComputationTypeID ?? t.fRT_ComputationTypeID ?? t.computationTypeID ?? ""),
                label: t.FRT_ComputationTypeName ?? t.fRT_ComputationTypeName ?? t.computationTypeName ?? "",
                active: !!getProp(t, "FRT_Active"),
            }));
            const settTypes = toArray(settData).map((t) => ({
                value: String(t.STT_SettlementTypeID ?? t.sTT_SettlementTypeID ?? t.settlementTypeID ?? ""),
                label: t.STT_SettlementTypeName ?? t.sTT_SettlementTypeName ?? t.settlementTypeName ?? "",
                periodLength: Number(t.STT_PeriodLength ?? t.sTT_PeriodLength ?? t.periodLength ?? 0),
                active: !!getProp(t, "STT_Active"),
            }));

            setTypeOptions(types);
            setComputationTypeOptions(compTypes);
            setSettlementTypeOptions(settTypes);

            const lookups = {
                contractRecords: mappedContracts,
                types, compTypes, settTypes,
                currencyOpts,
            };
            lookupsRef.current = lookups;

            setRecords(
                toArray(workspaceData)
                    .map((item) => mapApiPlanToDraft(item, lookups))
                    .filter(Boolean)
            );
            return true;
        } catch (e) {
            console.error(e);
            showNotification("error", "Failed to load data", getErrMsg(e));
            return false;
        } finally {
            setLoading(false);
        }
    }, [authAxios, showNotification]);

    const loadLockStatuses = useCallback(async (planRecords) => {
        const ids = [...new Set(
            planRecords
                .map((r) => resolvePlanContractId(r))
                .filter((id) => id != null && Number(id) > 0)
        )];
        if (!ids.length) {
            setLockStatusByContractId({});
            return;
        }
        try {
            const { data } = await authAxios.get(`${getApiBase()}/CVRComputation/lock-status`, {
                params: { contractIds: ids.join(",") },
            });
            setLockStatusByContractId(data ?? {});
        } catch {
            setLockStatusByContractId({});
        }
    }, [authAxios]);

    useEffect(() => {
        if (records.length) void loadLockStatuses(records);
    }, [records, loadLockStatuses]);

    const isContractLocked = useCallback((row) => {
        const cid = resolvePlanContractId(row?._draft ?? row);
        if (cid == null) return false;
        return lockStatusByContractId[String(cid)]?.locked === true;
    }, [lockStatusByContractId]);

    useEffect(() => {
        authAxios.get(`${getApiBase()}/CVRDailyRates/current`)
            .then(({ data }) => setUsdRate(data?.rate ?? null))
            .catch(() => setUsdRate(null));
    }, [authAxios]);

    useEffect(() => { void fetchData(); }, [fetchData]);

    const visibleRecords = useMemo(
        () => records.filter((r) => r._status !== "deleted"),
        [records]
    );

    const contractRecordsForValidation = useMemo(
        () => mergeContractRecordsForValidation(contractRecords, records),
        [contractRecords, records]
    );

    const tableRows = useMemo(
        () => visibleRecords.map((r) => buildPlanTableRow(r, contractRecords)),
        [visibleRecords, contractRecords]
    );

    const openAdd = () => {
        const id = tempIdRef.current--;
        setModalValidation(EMPTY_MODAL_VALIDATION);
        setEditingReadOnly(false);
        setEditingDraft(createEmptyPlanDraft(id));
        setModalOpen(true);
    };

    const openEdit = useCallback((row) => {
        setModalValidation(EMPTY_MODAL_VALIDATION);
        setEditingReadOnly(isContractLocked(row));
        const cloned = JSON.parse(JSON.stringify(row._draft));
        setEditingDraft(hydratePlanDraftCurrencies(
            hydrateContractDraft(cloned, contractRecords),
            currencyOptions
        ));
        setModalOpen(true);
    }, [contractRecords, currencyOptions, isContractLocked]);

    const handleModalApply = (draft) => {
        const normalized = normalizePlanDraft(draft, currencyOptions);
        const {
            valid,
            errors,
            fieldErrorsByTarget,
            fieldErrorsByFee,
            fieldErrorsContract,
        } = validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
        if (!valid) {
            setEditingDraft(normalized);
            setModalValidation({
                errors,
                fieldErrorsByTarget: fieldErrorsByTarget || {},
                fieldErrorsByFee: fieldErrorsByFee || {},
                fieldErrorsContract: fieldErrorsContract || {},
            });
            setModalOpen(true);
            return;
        }
        const cd = normalized.contractDraft;
        let planContractId = normalized.planContractId ?? null;
        if (cd && !cd._isNew && cd.ContractID && !String(cd.ContractID).startsWith("new_")) {
            const n = Number(cd.ContractID);
            if (Number.isFinite(n) && n > 0) planContractId = n;
        }
        const withContract = { ...normalized, planContractId };

        const exists = records.some((r) => r.recordId === withContract.recordId);
        if (exists) {
            setRecords((prev) =>
                prev.map((r) => {
                    if (r.recordId !== withContract.recordId) return r;
                    const prevNormalized = stripUiFields(normalizePlanDraft(r, currencyOptions));
                    const nextNormalized = stripUiFields(normalizePlanDraft(withContract, currencyOptions));
                    const actuallyChanged = JSON.stringify(prevNormalized) !== JSON.stringify(nextNormalized);
                    return {
                        ...withContract,
                        _status: r._status === "new" ? "new" : actuallyChanged ? "modified" : r._status,
                    };
                })
            );

            const prevJson = JSON.stringify(stripUiFields(normalizePlanDraft(
                records.find((r) => r.recordId === withContract.recordId),
                currencyOptions
            )));
            const nextJson = JSON.stringify(stripUiFields(normalizePlanDraft(withContract, currencyOptions)));
            if (prevJson !== nextJson) showNotification("success", "Contract updated");
        } else {
            setRecords((prev) => [...prev, { ...withContract, _status: "new" }]);
            showNotification("success", "Contract added");
        }
        setModalOpen(false);
        setEditingDraft(null);
        setModalValidation(EMPTY_MODAL_VALIDATION);
    };

    const handleDelete = useCallback((recordId) => {
        const row = records.find((r) => r.recordId === recordId);
        if (!row) return;
        if (isContractLocked(row)) {
            showNotification("error", "Contract locked", "This contract cannot be deleted after computation save.");
            return;
        }
        if (row._status === "new") {
            setRecords((prev) => prev.filter((r) => r.recordId !== recordId));
        } else {
            setRecords((prev) =>
                prev.map((r) => (r.recordId === recordId ? { ...r, _status: "deleted" } : r))
            );
        }
        showNotification("success", "Contract marked for deletion");
    }, [records, showNotification, isContractLocked]);

    const prepareDraftForSave = async (row, recordsSnapshot) => {
        let draft = hydrateContractDraft(normalizePlanDraft(row, currencyOptions), recordsSnapshot);
        if (!contractNeedsPersist(draft.contractDraft, recordsSnapshot)) return draft;
        const contractId = await persistPlanContract(authAxios, draft.contractDraft, recordsSnapshot);
        return {
            ...draft,
            planContractId: contractId,
            contractDraft: { ...draft.contractDraft, ContractID: contractId, _isNew: false },
        };
    };

    const handleSave = async () => {
        const staged = records.filter((r) => r._status === "new" || r._status === "modified");
        for (const row of staged) {
            const normalized = normalizePlanDraft(row, currencyOptions);
            const {
                valid,
                errors,
                fieldErrorsByTarget,
                fieldErrorsByFee,
                fieldErrorsContract,
            } = validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });
            if (!valid) {
                setEditingDraft(JSON.parse(JSON.stringify(normalized)));
                setModalValidation({
                    errors,
                    fieldErrorsByTarget: fieldErrorsByTarget || {},
                    fieldErrorsByFee: fieldErrorsByFee || {},
                    fieldErrorsContract: fieldErrorsContract || {},
                });
                setModalOpen(true);
                return;
            }
        }

        const deletedPlanIds = records
            .filter((r) => r._status === "deleted" && r.recordId > 0)
            .map((r) => r.recordId);

        if (!staged.length && !deletedPlanIds.length) {
            showNotification("error", "No changes detected");
            return;
        }

        setLoading(true);
        try {
            let recordsSnapshot = [...contractRecords];
            const preparedById = new Map();

            for (const row of staged) {
                const prepared = await prepareDraftForSave(row, recordsSnapshot);
                preparedById.set(row.recordId, prepared);
                if (prepared.contractDraft)
                    recordsSnapshot = upsertContractInRecords(recordsSnapshot, prepared.contractDraft);
            }

            const newPlans = records
                .filter((r) => r._status === "new")
                .map((r) => mapDraftToPayload(preparedById.get(r.recordId) || r));
            const modifiedPlans = records
                .filter((r) => r._status === "modified")
                .map((r) => mapDraftToPayload(preparedById.get(r.recordId) || r));

            await authAxios.post(`${getApiBase()}/CVRPlanWorkspace/bulk-save`, {
                newPlans, modifiedPlans, deletedPlanIds,
            });

            workspaceCache.invalidate();
            const refreshed = await fetchData();
            if (refreshed) {
                showNotification("success", "Saved successfully");
            }
        } catch (e) {
            workspaceCache.invalidate();
            showNotification("error", "Save failed", getErrMsg(e));
        } finally {
            setLoading(false);
        }
    };

    const columns = useMemo(
        () => getPlanWorkspaceTableColumns({
            includeActions: true,
            openEdit,
            handleDelete,
            isContractLocked,
        }),
        [openEdit, handleDelete, isContractLocked]
    );

    return (
        <div className="p-3 vr-plans-page" style={{ minHeight: "100%", background: "#f7f9fc", overflowY: "auto" }}>
            {discardModal}
            <div className="d-flex justify-content-between align-items-start mb-3">
                <div><h5 className="mb-1">Contracts</h5></div>
                <div className="d-flex gap-3 align-items-center">
                    <span className="hyperlink-text" onClick={openAdd}>Add</span>
                    <span style={{ color: "#0078bb" }}>|</span>
                    <span
                        className="hyperlink-text"
                        onClick={loading ? undefined : handleSave}
                        style={{ opacity: loading ? 0.5 : 1, pointerEvents: loading ? "none" : "auto" }}
                    >
                        {loading ? "Loading…" : "Save"}
                    </span>
                </div>
            </div>

            <Notification
                type={notification.type}
                title={notification.title}
                message={notification.message}
                display={notification.display}
            />

            {loading && tableRows.length === 0 ? (
                <div className="text-muted py-4">Loading contracts…</div>
            ) : (
                <div className="adv-mobile-table">
                    <AdvancedTable
                        columns={columns}
                        dataArray={tableRows}
                        enableSearch
                        minRows={5}
                        recordCount={tableRows.length}
                        showRowSelectedAndRowCount
                        pageSize={tableRows.length || 5}
                        currentPage={1}
                        isFilterOptionOneRow
                    />
                </div>
            )}

            {modalOpen && editingDraft && (
                <PlanEditorModal
                    open={modalOpen}
                    initialDraft={editingDraft}
                    isNew={editingDraft.recordId < 0}
                    readOnly={editingReadOnly}
                    onClose={() => {
                        setModalOpen(false);
                        setEditingDraft(null);
                        setModalValidation(EMPTY_MODAL_VALIDATION);
                    }}
                    onApply={handleModalApply}
                    typeOptions={typeOptions}
                    computationTypeOptions={computationTypeOptions}
                    settlementTypeOptions={settlementTypeOptions}
                    currencyOptions={currencyOptions}
                    initialValidationErrors={modalValidation.errors}
                    initialFieldErrorsByTarget={modalValidation.fieldErrorsByTarget}
                    initialFieldErrorsByFee={modalValidation.fieldErrorsByFee}
                    initialFieldErrorsContract={modalValidation.fieldErrorsContract}
                    authAxios={authAxios}
                    contractRecords={contractRecords}
                    contractRecordsForValidation={contractRecordsForValidation}
                    clientLabelById={clientLabelById}
                    setClientLabelById={setClientLabelById}
                />
            )}
        </div>
    );
}