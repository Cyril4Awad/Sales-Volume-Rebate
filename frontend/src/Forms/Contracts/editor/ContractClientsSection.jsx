import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdvancedTable, InputTextComponent, ModalComp } from "../../../ReusableComponents";
import {
    buildPickerCheckboxColumn,
    mapClientFieldColumns,
} from "../../../utils/clientPickerTableColumns";
import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "../../../utils/mobileTableCells";
import {
    CLIENT_PICKER_PAGE_SIZE,
    PICKER_SEARCH_DEBOUNCE_MS,
    mergeSubClientsSelection,
    mapApiClientDtoToPickerRow,
    normalizePagedClientsResponse,
    normalizeClientIdValue,
    getClientsApi,
} from "../../../utils/contractWorkspaceMappers";

export default function ContractClientsSection({
    draft,
    onChange,
    authAxios,
    clientLabelById,
    setClientLabelById,
    onValidationError,
    validationAttempted,
    readOnly = false,
}) {
    const [missingClient, setMissingClient] = useState(false);
    const [mainClientModalOpen, setMainClientModalOpen] = useState(false);
    const [subClientsModalOpen, setSubClientsModalOpen] = useState(false);
    const [mainClientPickerSelectedIds, setMainClientPickerSelectedIds] = useState([]);
    const [mainPickerSelectedOption, setMainPickerSelectedOption] = useState(null);
    const [mainPickerRows, setMainPickerRows] = useState([]);
    const [mainPickerTotal, setMainPickerTotal] = useState(0);
    const [mainPickerPage, setMainPickerPage] = useState(1);
    const mainPickerPagingRef = useRef({ page: 1, search: "" });
    const mainPickerDebounceTimer = useRef(null);
    const [subPickerRows, setSubPickerRows] = useState([]);
    const [subPickerTotal, setSubPickerTotal] = useState(0);
    const [subPickerPage, setSubPickerPage] = useState(1);
    const subPickerPagingRef = useRef({ page: 1, search: "" });
    const subPickerDebounceTimer = useRef(null);
    const subClientsPickerMapRef = useRef(new Map());
    const [subClientsPickerVersion, setSubClientsPickerVersion] = useState(0);

    // Keep a ref to latest onChange/setClientLabelById for use in auto-apply
    const onChangeRef = useRef(onChange);
    const setClientLabelByIdRef = useRef(setClientLabelById);
    const draftRef = useRef(draft);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { setClientLabelByIdRef.current = setClientLabelById; }, [setClientLabelById]);
    useEffect(() => { draftRef.current = draft; }, [draft]);

    const checkAllSubOnPage = useCallback(() => {
        const m = subClientsPickerMapRef.current;
        subPickerRows.forEach((row) => {
            const id = normalizeClientIdValue(row.clRecId ?? row.value);
            if (id == null) return;
            m.set(id, {
                value: id,
                label: row.label ?? "",
                code: row.code != null && String(row.code).length ? String(row.code) : String(id),
            });
        });
        setSubClientsPickerVersion((v) => v + 1);
    }, [subPickerRows]);

    const uncheckAllSub = useCallback(() => {
        subClientsPickerMapRef.current = new Map();
        setSubClientsPickerVersion((v) => v + 1);
    }, []);

    const toggleSubClientPickerRow = useCallback((row) => {
        const id = normalizeClientIdValue(row.clRecId ?? row.value);
        if (id == null) return;
        const m = subClientsPickerMapRef.current;
        if (m.has(id)) m.delete(id);
        else {
            m.set(id, { value: id, label: row.label ?? "", code: row.code ?? String(id) });
        }
        setSubClientsPickerVersion((v) => v + 1);
    }, []);

    const applySubClientsFromPicker = useCallback(() => {
        const pickedMap = subClientsPickerMapRef.current;
        const pickedIds = new Set(
            [...pickedMap.keys()].map(normalizeClientIdValue).filter((id) => id != null)
        );
        const mainVal = normalizeClientIdValue(draft.ClientID?.value);

        const kept = draft.SubClients.filter((sc) => {
            const id = normalizeClientIdValue(sc.ClientID?.value);
            return id != null && pickedIds.has(id);
        });

        const keptIds = new Set(
            kept.map((sc) => normalizeClientIdValue(sc.ClientID?.value)).filter(Boolean)
        );

        const toAdd = [...pickedMap.values()].filter((o) => {
            const id = normalizeClientIdValue(o?.value);
            return id != null && !keptIds.has(id) && id !== mainVal;
        });

        const { next } = mergeSubClientsSelection({ ...draft, SubClients: kept }, toAdd);

        setClientLabelById((prev) => {
            const updated = { ...prev };
            [...pickedMap.values()].forEach((o) => {
                const cid = normalizeClientIdValue(o.value);
                if (cid != null) updated[cid] = { ...o, value: cid };
            });
            return updated;
        });
        onChange({ ...draft, SubClients: next });
        setSubClientsModalOpen(false);
        subClientsPickerMapRef.current = new Map();
    }, [draft, onChange, setClientLabelById]);

    const loadMainPickerPage = useCallback(async (page, search) => {
        try {
            const skip = (page - 1) * CLIENT_PICKER_PAGE_SIZE;
            const { data } = await authAxios.get(getClientsApi(), {
                params: { skip, take: CLIENT_PICKER_PAGE_SIZE, search: search || undefined },
            });
            const { items, totalCount } = normalizePagedClientsResponse(data);
            setMainPickerRows((items || []).map(mapApiClientDtoToPickerRow));
            setMainPickerTotal(totalCount);
            setMainPickerPage(page);
            mainPickerPagingRef.current = { page, search };
        } catch (e) {
            onValidationError?.(`Failed to load clients: ${e.message}`);
        }
    }, [authAxios, onValidationError]);

    const loadSubPickerPage = useCallback(async (page, search, excludeClientId) => {
        try {
            const skip = (page - 1) * CLIENT_PICKER_PAGE_SIZE;
            const params = {
                skip,
                take: CLIENT_PICKER_PAGE_SIZE,
                search: search || undefined,
            };
            if (excludeClientId != null && Number.isFinite(excludeClientId) && excludeClientId > 0) {
                params.excludeClientId = excludeClientId;
            }
            const { data } = await authAxios.get(getClientsApi(), { params });
            const { items, totalCount } = normalizePagedClientsResponse(data);
            setSubPickerRows((items || []).map(mapApiClientDtoToPickerRow));
            setSubPickerTotal(totalCount);
            setSubPickerPage(page);
            subPickerPagingRef.current = { page, search };
        } catch (e) {
            onValidationError?.(`Failed to load clients: ${e.message}`);
        }
    }, [authAxios, onValidationError]);

    useEffect(() => {
        if (!mainClientModalOpen) return;
        setMainClientPickerSelectedIds(
            draft.ClientID?.value != null ? [draft.ClientID.value] : []
        );
        setMainPickerSelectedOption(draft.ClientID ?? null);
    }, [mainClientModalOpen, draft.ClientID]);

    useEffect(() => {
        if (!mainClientModalOpen) return;
        mainPickerPagingRef.current = { page: 1, search: "" };
        void loadMainPickerPage(1, "");
    }, [mainClientModalOpen, loadMainPickerPage]);

    useEffect(() => {
        if (!subClientsModalOpen) return;
        const m = new Map();
        draft.SubClients.forEach((sc) => {
            const o = sc.ClientID;
            const id = normalizeClientIdValue(o?.value);
            if (id != null) {
                m.set(id, {
                    value: id,
                    label: o.label ?? "",
                    code: o.code != null && String(o.code).length ? String(o.code) : String(id),
                });
            }
        });
        subClientsPickerMapRef.current = m;
        setSubClientsPickerVersion((v) => v + 1);
        subPickerPagingRef.current = { page: 1, search: "" };
        void loadSubPickerPage(1, "", draft.ClientID?.value);
    }, [subClientsModalOpen, draft.SubClients, draft.ClientID?.value, loadSubPickerPage]);

    const handleDeleteSubClient = useCallback((id) => {
        onChange({
            ...draft,
            SubClients: draft.SubClients.filter((x) => x.ContractClientID !== id),
        });
    }, [draft, onChange]);

    // Auto-apply when a main client row is toggled — select and immediately close
    const toggleMainClientPickerRow = useCallback((row) => {
        const value = row.clRecId;
        const opt = {
            value: row.value,
            label: row.label ?? "",
            code: row.code ?? String(row.value),
        };

        setMainClientPickerSelectedIds([value]);
        setMainPickerSelectedOption(opt);
        setMissingClient(false);

        // Auto-apply immediately
        setClientLabelByIdRef.current((prev) => ({ ...prev, [opt.value]: opt }));
        onChangeRef.current({ ...draftRef.current, ClientID: opt });
        setMainClientModalOpen(false);
    }, []);

    const handleMainClientTriggerPaging = useCallback((searchValue, _f, _s, counter) => {
        if (mainPickerDebounceTimer.current) clearTimeout(mainPickerDebounceTimer.current);
        mainPickerDebounceTimer.current = setTimeout(() => {
            const s = String(searchValue ?? "").trim();
            const prev = mainPickerPagingRef.current;
            let page = s !== prev.search ? 1 : counter ? Math.max(1, prev.page + counter) : 1;
            void loadMainPickerPage(page, s);
        }, PICKER_SEARCH_DEBOUNCE_MS);
    }, [loadMainPickerPage]);

    const handleSubClientTriggerPaging = useCallback((searchValue, _f, _s, counter) => {
        if (subPickerDebounceTimer.current) clearTimeout(subPickerDebounceTimer.current);
        subPickerDebounceTimer.current = setTimeout(() => {
            const s = String(searchValue ?? "").trim();
            const prev = subPickerPagingRef.current;
            let page = s !== prev.search ? 1 : counter ? Math.max(1, prev.page + counter) : 1;
            void loadSubPickerPage(page, s, draft.ClientID?.value);
        }, PICKER_SEARCH_DEBOUNCE_MS);
    }, [loadSubPickerPage, draft.ClientID?.value]);

    const pickerCheckboxCol = (checked, onToggle, { isLocked } = {}) =>
        buildPickerCheckboxColumn({
            checked,
            onToggle,
            isLocked,
        });

    const mainClientPickerColumns = useMemo(() => [
        pickerCheckboxCol(
            (row) => mainClientPickerSelectedIds.includes(row.clRecId),
            toggleMainClientPickerRow
        ),
        ...mapClientFieldColumns(),
    ], [mainClientPickerSelectedIds, toggleMainClientPickerRow]);

    const subClientPickerColumns = useMemo(() => [
        pickerCheckboxCol(
            (row) => {
                const id = normalizeClientIdValue(row.clRecId ?? row.value);
                return subClientsPickerMapRef.current.has(id);
            },
            toggleSubClientPickerRow,
            {
                isLocked: (row) => {
                    const id = normalizeClientIdValue(row.clRecId ?? row.value);
                    return draft.SubClients.some(
                        (sc) => normalizeClientIdValue(sc.ClientID?.value) === id
                    );
                },
            }
        ),
        ...mapClientFieldColumns(),
    ], [subClientsPickerVersion, toggleSubClientPickerRow, draft.SubClients]);

    const clientInvalid = missingClient || (validationAttempted && !draft.ClientID);

    const subClientsColumns = useMemo(() => [
        {
            Header: "Code/No",
            accessor: "ClientID",
            width: 120,
            style: { textAlign: "center" },
            Cell: (row) => {
                const o = row.value;
                const code = !o ? "" : (o.code ?? o.value);
                return (
                    <div style={{ textAlign: "center" }}>
                        {mobileDualCell(code, mobileLabeledRow("Code/No", code))}
                    </div>
                );
            },
        },
        {
            Header: "Client Name",
            accessor: "ClientID",
            id: "clientName",
            minWidth: 200,
            Cell: (row) => {
                const name = row.value?.label ?? "";
                return mobileDualCell(name, mobileLabeledRow("Client Name", name));
            },
        },
        {
            Header: "",
            accessor: "ContractClientID",
            width: 90,
            style: { textAlign: "center" },
            Cell: (row) => !readOnly ? mobileActionRow(
                <div style={{ textAlign: "center" }}>
                    <span
                        className="hyperlink-text"
                        onClick={() => handleDeleteSubClient(row.original.ContractClientID)}
                    >
                        Remove
                    </span>
                </div>
            ) : null,
        },
    ], [handleDeleteSubClient, readOnly]);

    return (
        <>
            <div className="card border-0 shadow-sm mb-3 plan-modal-card">
                <div className="card-header bg-light border-0">
                    <strong>Clients</strong>
                </div>
                <div className="card-body">
                    <div style={{ maxWidth: 850 }}>
                        {/* Main client row */}
                        <div className="d-flex align-items-end gap-2 mb-3">
                            <div className="flex-grow-1">
                                <InputTextComponent
                                    name="MainClientDisplay"
                                    value={
                                        draft.ClientID
                                            ? `${draft.ClientID.code ?? draft.ClientID.value} - ${draft.ClientID.label ?? ""}`
                                            : ""
                                    }
                                    placeholder={<>Master Client <span className="required">*</span></>}
                                    handleChange={() => { }}
                                    handleOnblur={() => {
                                        if (!draft.ClientID) setMissingClient(true);
                                    }}
                                    className={clientInvalid ? "alert-danger" : ""}
                                    readOnly
                                />
                            </div>
                            {!readOnly && (
                                <span
                                    className="hyperlink-text mb-2"
                                    style={{ whiteSpace: "nowrap" }}
                                    onClick={() => setMainClientModalOpen(true)}
                                >
                                    Select
                                </span>
                            )}
                        </div>

                        {/* Associated clients header row */}
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <small className="text-muted">Associated Clients</small>
                            {!readOnly && (
                                <span
                                    className="hyperlink-text"
                                    style={{ fontSize: 13 }}
                                    onClick={() => setSubClientsModalOpen(true)}
                                >
                                    + Add clients
                                </span>
                            )}
                        </div>

                        {/* Sub clients table */}
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={subClientsColumns}
                                dataArray={draft.SubClients}
                                enableSearch={false}
                                minRows={0}
                                showPagination={false}
                                recordCount={draft.SubClients.length}
                                pageSize={draft.SubClients.length || 1}
                                currentPage={1}
                                maxHeight="220px"
                                getTrProps={(_state, row) =>
                                    row?.original?._isNew ? { className: "sub-client-row--new" } : {}
                                }
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Main client picker modal — auto-applies on row click, Cancel only */}
            <ModalComp
                modal={mainClientModalOpen}
                modalTitle="Select Master Client"
                modalBody={(
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={mainClientPickerColumns}
                            dataArray={mainPickerRows}
                            enableSearch
                            isFilterOptionOneRow
                            minRows={0}
                            showPagination={false}
                            triggerPaging={handleMainClientTriggerPaging}
                            recordCount={mainPickerTotal}
                            pageSize={CLIENT_PICKER_PAGE_SIZE}
                            showRowSelectedAndRowCount={true}
                            currentPage={mainPickerPage}
                            maxHeight="420px"
                        />
                    </div>
                )}
                onClose={() => setMainClientModalOpen(false)}
                onCloseText="Cancel"
                size="xl"
            />

            {/* Sub clients picker modal */}
            <ModalComp
                modal={subClientsModalOpen}
                modalTitle="Select Associated Clients"
                modalBody={(
                    <>
                        <div className="d-flex gap-3 mb-2">
                            <span className="hyperlink-text" style={{ fontSize: 12 }} onClick={checkAllSubOnPage}>
                                Check All
                            </span>
                            <span className="hyperlink-text" style={{ fontSize: 12 }} onClick={uncheckAllSub}>
                                Uncheck All
                            </span>
                        </div>
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={subClientPickerColumns}
                                dataArray={subPickerRows}
                                enableSearch
                                isFilterOptionOneRow
                                minRows={0}
                                showPagination={false}
                                triggerPaging={handleSubClientTriggerPaging}
                                recordCount={subPickerTotal}
                                pageSize={CLIENT_PICKER_PAGE_SIZE}
                                currentPage={subPickerPage}
                                showRowSelectedAndRowCount={true}
                                maxHeight="300px"
                            />
                        </div>
                    </>
                )}
                onClose={() => setSubClientsModalOpen(false)}
                onAccept={applySubClientsFromPicker}
                onAcceptText="Apply"
                onCloseText="Cancel"
                size="xl"
            />
        </>
    );
}