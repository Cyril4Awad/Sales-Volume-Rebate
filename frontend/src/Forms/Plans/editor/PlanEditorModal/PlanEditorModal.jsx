import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import moment from "moment";

import { ModalComp } from "../../../../ReusableComponents";

import PlanFormSection from "../PlanFormSection/PlanFormSection";
import PlanContractSection from "../PlanContractSection/PlanContractSection";
import PlanFeesSection from "../PlanFeesSection/PlanFeesSection";
import PlanWorkspaceAccordion from "../../components/PlanWorkspaceAccordion/PlanWorkspaceAccordion";
import TargetListNav, { TargetSelectorBar, useTargetNavCollapsed } from "../../targets/TargetListNav/TargetListNav";
import TargetEditorPanel from "../../targets/TargetEditorPanel/TargetEditorPanel";
import PlanModalValidationAlerts from "../../components/PlanModalValidationAlerts/PlanModalValidationAlerts";

import {
    normalizePlanDraft,
    normalizeRebateValueType,
    validatePlanDraft,
} from "../../../../utils/planWorkspaceValidation";

import { checkContractReferenceUnique } from "../../../../utils/checkContractReferenceUnique";
import { emptyContractForm } from "../../../../utils/contractWorkspaceMappers";
import { getApiBase } from "../../../../globals";
import {
    buildResolvedFromPlanDraft,
} from "../../../../utils/buildResolvedFromPlanDraft";
import { hydratePlanDraftCurrencies } from "../../../../utils/planWorkspaceMappers";
import { applyContractCurrencyToDraft, resolveContractCurrencyCode } from "../../../../utils/contractCurrency";
import { filterActiveSelectOptions } from "../../../../utils/definitionSelectOptions";
import { shiftResolvedForSimulation, resolveSimulationAsOf } from "../../../../utils/simulationDateShift";
import ComputationResultsPanel from "../../../Computation/ComputationResultsPanel/ComputationResultsPanel";
import { useLastAccountingGenerationDate } from "../../../Computation/hooks/useLastAccountingGenerationDate";
import { useComputationPreview } from "../../../Computation/hooks/useComputationPreview";

// @ts-ignore
import exportPlanToExcel from "../../../../utils/exportPlanToExcel";
import printPlanReport from "../../../../utils/printPlanReport";

import "../../styles/VRPlansWorkspace.css";
import "../../../Computation/VRComputationWorkspace.css";
import "./PlanEditorModal.css";

const EMPTY_CLIENT_IDS = [];

let _contractTempId = 0;

const initContractDraftIfNeeded = (draft) => {
    if (draft?.contractDraft) return draft;
    const id = `new_${Date.now()}_${_contractTempId++}`;
    return {
        ...draft,
        contractDraft: { ...emptyContractForm(), ContractID: id, _isNew: true },
    };
};

export default function PlanEditorModal({
    open,
    initialDraft,
    isNew,
    onClose,
    onApply,
    typeOptions,
    computationTypeOptions,
    settlementTypeOptions,
    currencyOptions,
    initialValidationErrors = [],
    initialFieldErrorsByTarget = {},
    initialFieldErrorsByFee = {},
    initialFieldErrorsContract = {},
    authAxios,
    contractRecords = [],
    contractRecordsForValidation,
    clientLabelById,
    setClientLabelById,
    readOnly = false,
    // Optional: pass your company name from app config / context
    companyName = "",
}) {
    const [draft, setDraft] = useState(initialDraft);
    const [activeTargetId, setActiveTargetId] = useState(null);
    const [validationErrors, setValidationErrors] = useState([]);
    const [fieldErrorsByTarget, setFieldErrorsByTarget] = useState({});
    const [contractFieldErrors, setContractFieldErrors] = useState({});
    const [fieldErrorsByFee, setFieldErrorsByFee] = useState({});
    const [validationAttempted, setValidationAttempted] = useState(false);
    const [usdRate, setUsdRate] = useState(null);
    const [simulationOpen, setSimulationOpen] = useState(false);
    const [simulationModePickerOpen, setSimulationModePickerOpen] = useState(false);
    const [simulationMode, setSimulationMode] = useState("current");
    const [simulationResolved, setSimulationResolved] = useState(null);
    const [pendingSimulationResolved, setPendingSimulationResolved] = useState(null);
    const [simulationErrors, setSimulationErrors] = useState([]);
    const modalContentRef = useRef(null);
    const targetNavCollapsed = useTargetNavCollapsed(open);
    const currenciesHydratedRef = useRef(false);

    const {
        previewResults: simulationPreview,
        salesByTargetId: simulationSalesById,
        salesMetaByTargetId: simulationSalesMeta,
        loadingSales: simulationLoadingSales,
        runPreview: runSimulationPreview,
        resetPreview: resetSimulationPreview,
        fetchSalesForDraftWindows: fetchSimulationSalesForDraftWindows,
    } = useComputationPreview(authAxios, { dailyRate: usdRate });

    const { generationDate: lastAccountingGenerationDate } = useLastAccountingGenerationDate(authAxios);

    const simulationClientIds = simulationResolved?.allClientIds ?? EMPTY_CLIENT_IDS;
    const simulationAsOfDate = useMemo(() => {
        if (simulationMode === "previousYear") {
            const resolvedAsOf = resolveSimulationAsOf(
                simulationResolved,
                simulationResolved?.targets ?? [],
                -1
            );
            return resolvedAsOf
                ? moment(resolvedAsOf).format("YYYY-MM-DD")
                : moment().format("YYYY-MM-DD");
        }
        return moment().format("YYYY-MM-DD");
    }, [simulationMode, simulationResolved]);

    useEffect(() => {
        if (open && initialDraft) {
            let nextDraft = initContractDraftIfNeeded(initialDraft);
            if (currencyOptions?.length) {
                nextDraft = hydratePlanDraftCurrencies(nextDraft, currencyOptions);
                currenciesHydratedRef.current = true;
            } else {
                currenciesHydratedRef.current = false;
            }
            setDraft(nextDraft);
            setActiveTargetId(nextDraft.targets?.[0]?.localId ?? null);
            setValidationErrors([]);
            setFieldErrorsByTarget({});
            setContractFieldErrors({});
            setFieldErrorsByFee({});
            setValidationAttempted(false);
        }
        if (!open) {
            currenciesHydratedRef.current = false;
        }
    }, [open, initialDraft]);

    useEffect(() => {
        if (!open || !currencyOptions?.length || currenciesHydratedRef.current) return;
        currenciesHydratedRef.current = true;
        setDraft((d) => hydratePlanDraftCurrencies(d, currencyOptions));
    }, [open, currencyOptions]);

    useEffect(() => {
        if (!open || !authAxios) return;
        let cancelled = false;
        authAxios.get(`${getApiBase()}/CVRDailyRates/current`)
            .then((res) => {
                if (cancelled) return;
                const rate = res?.data?.rate;
                setUsdRate(rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null);
            })
            .catch(() => { if (!cancelled) setUsdRate(null); });
        return () => { cancelled = true; };
    }, [open, authAxios]);

    useEffect(() => {
        if (!open) return;
        const hasErrors = initialValidationErrors?.length > 0;
        const hasFieldErrors =
            Object.keys(initialFieldErrorsByTarget || {}).length > 0
            || Object.keys(initialFieldErrorsByFee || {}).length > 0
            || Object.keys(initialFieldErrorsContract || {}).length > 0;
        if (!hasErrors && !hasFieldErrors) return;

        setValidationErrors(initialValidationErrors || []);
        setFieldErrorsByTarget(initialFieldErrorsByTarget || {});
        setFieldErrorsByFee(initialFieldErrorsByFee || {});
        setContractFieldErrors(initialFieldErrorsContract || {});
        setValidationAttempted(true);
    }, [
        open,
        initialValidationErrors,
        initialFieldErrorsByTarget,
        initialFieldErrorsByFee,
        initialFieldErrorsContract,
    ]);

    const appendValidationErrors = useCallback((messages) => {
        const list = Array.isArray(messages) ? messages : [messages];
        setValidationErrors((prev) => [...prev, ...list.filter(Boolean)]);
    }, []);

    const selectMenuProps = useMemo(() => ({
        menuPortalTarget: document.body,
        menuPosition: "fixed",
        menuPlacement: "auto",
        styles: {
            menuPortal: (b) => ({ ...b, zIndex: 999999 }),
            menu: (b) => ({ ...b, zIndex: 999999 }),
            menuList: (b) => ({ ...b, zIndex: 999999 }),
        },
        ...(readOnly ? { disabled: true } : {}),
    }), [readOnly]);

    useEffect(() => {
        if (!open || !readOnly) return undefined;
        document.body.classList.add("plan-editor-readonly-active");
        return () => document.body.classList.remove("plan-editor-readonly-active");
    }, [open, readOnly]);

    const activeTarget = draft?.targets?.find((t) => t.localId === activeTargetId) ?? draft?.targets?.[0];

    const contractCurrencyCode = useMemo(
        () => resolveContractCurrencyCode(draft) ?? "",
        [draft]
    );

    const visibleTypeOptions = useMemo(
        () => filterActiveSelectOptions(typeOptions, draft?.plan?.typeId),
        [typeOptions, draft?.plan?.typeId]
    );

    const visibleSettlementTypeOptions = useMemo(
        () => filterActiveSelectOptions(
            settlementTypeOptions,
            (draft?.fees ?? []).map((f) => f.settlementTypeId).concat(
                (draft?.targets ?? []).map((t) => t.settlementTypeId)
            )
        ),
        [settlementTypeOptions, draft?.fees, draft?.targets]
    );

    const visibleComputationTypeOptions = useMemo(
        () => filterActiveSelectOptions(
            computationTypeOptions,
            activeTarget?.computationTypeId
        ),
        [computationTypeOptions, activeTarget?.computationTypeId]
    );

    const scrollModalToTop = () => {
        if (modalContentRef.current) {
            modalContentRef.current.scrollTop = 0;
        }
    };

    const handleContractChange = (contractDraft) => {
        const planContractId = contractDraft._isNew ? null : contractDraft.ContractID;
        setDraft((d) => applyContractCurrencyToDraft(
            { ...d, planContractId, contractDraft },
            currencyOptions
        ));
    };

    const runSimulationWithMode = useCallback(async (resolved, mode) => {
        setSimulationMode(mode);
        const yearOffset = mode === "previousYear" ? -1 : 0;
        const displayResolved = yearOffset
            ? shiftResolvedForSimulation(resolved, yearOffset)
            : resolved;
        setSimulationResolved(displayResolved);
        setSimulationOpen(true);
        setSimulationErrors([]);

        const previewOptions = { useDraftDates: true };
        if (mode === "previousYear") {
            previewOptions.yearOffset = -1;
        }

        await runSimulationPreview(resolved, previewOptions);
    }, [runSimulationPreview]);

    const handleViewSimulation = useCallback(async () => {
        const normalized = normalizePlanDraft(draft, currencyOptions);
        const { valid, errors, fieldErrorsByTarget: fe, fieldErrorsByFee: feeFe, fieldErrorsContract: contractFe } =
            validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });

        if (!valid) {
            setValidationAttempted(true);
            setValidationErrors(errors);
            setFieldErrorsByTarget(fe || {});
            setFieldErrorsByFee(feeFe || {});
            setContractFieldErrors(contractFe || {});
            scrollModalToTop();
            resetSimulationPreview();
            setSimulationOpen(false);
            setSimulationModePickerOpen(false);
            setPendingSimulationResolved(null);
            setSimulationErrors([]);
            setSimulationResolved(null);
            return;
        }

        const resolved = buildResolvedFromPlanDraft(normalized, { settlementTypeOptions });
        if (resolved?.error) {
            setValidationAttempted(true);
            setValidationErrors([resolved.error]);
            scrollModalToTop();
            resetSimulationPreview();
            setSimulationOpen(false);
            setSimulationResolved(null);
            return;
        }

        setSimulationErrors([]);
        setPendingSimulationResolved(resolved);
        setSimulationModePickerOpen(true);
        setValidationErrors([]);
        setFieldErrorsByTarget({});
        setFieldErrorsByFee({});
        setContractFieldErrors({});
        setValidationAttempted(false);
    }, [draft, currencyOptions, resetSimulationPreview, usdRate, settlementTypeOptions]);

    const handleSimulationModeChoice = useCallback(async (mode) => {
        setSimulationModePickerOpen(false);
        if (!pendingSimulationResolved) return;
        await runSimulationWithMode(pendingSimulationResolved, mode);
        setPendingSimulationResolved(null);
    }, [pendingSimulationResolved, runSimulationWithMode]);

    const handleApply = async () => {
        const normalized = normalizePlanDraft(draft, currencyOptions);
        const { valid, errors, fieldErrorsByTarget: fe, fieldErrorsByFee: feeFe, fieldErrorsContract: contractFe } =
            validatePlanDraft(normalized, { usdRate, currencyOpts: currencyOptions, settlementTypeOptions });

        if (!valid) {
            setValidationAttempted(true);
            setValidationErrors(errors);
            setFieldErrorsByTarget(fe || {});
            setFieldErrorsByFee(feeFe || {});
            setContractFieldErrors(contractFe || {});
            scrollModalToTop();
            return;
        }

        const ref = normalized.contractDraft?.ContractReference?.trim();
        if (ref && authAxios) {
            try {
                const unique = await checkContractReferenceUnique(
                    authAxios,
                    ref,
                    normalized.contractDraft?.ContractID
                );
                if (!unique) {
                    setValidationAttempted(true);
                    setContractFieldErrors({ ContractReference: "Contract reference must be unique" });
                    setValidationErrors(["Contract reference must be unique"]);
                    scrollModalToTop();
                    return;
                }
            } catch {
                setValidationErrors(["Could not verify contract reference uniqueness"]);
                scrollModalToTop();
                return;
            }
        }

        setValidationErrors([]);
        setFieldErrorsByTarget({});
        setFieldErrorsByFee({});
        setContractFieldErrors({});
        setValidationAttempted(false);
        onApply(normalized);
    };

    // ── Export / Print handlers ──────────────────────────────────────────────

    const handleExportExcel = useCallback(() => {
        if (!draft) return;
        exportPlanToExcel(draft);
    }, [draft]);

    const handlePrint = useCallback(() => {
        if (!draft) return;
        printPlanReport(draft, companyName);
    }, [draft, companyName]);

    // ────────────────────────────────────────────────────────────────────────

    if (!draft) return null;

    const activeFieldErrors = activeTarget?.localId
        ? fieldErrorsByTarget[activeTarget.localId]
        : undefined;

    // Toolbar shown top-right of modal, aligned with the modal title
    const modalHeaderToolbar = !isNew && (
        <div className="plan-editor-toolbar">
            <button
                type="button"
                className="plan-editor-toolbar-btn"
                title="Export to Excel"
                onClick={handleExportExcel}
            >
                <i className="fa fa-file-excel-o" />
                <span>Excel</span>
            </button>
            <button
                type="button"
                className="plan-editor-toolbar-btn"
                title="Print Report"
                onClick={handlePrint}
            >
                <i className="fa fa-print" />
                <span>Print</span>
            </button>
        </div>
    );

    const modalBody = (
        <div className={`plan-editor-modal-shell${readOnly ? " plan-editor-readonly" : ""}`}>
            <div className="plan-editor-modal-scroll" ref={modalContentRef}>
            <PlanModalValidationAlerts errors={validationErrors} />

            <PlanContractSection
                contractDraft={draft.contractDraft}
                onChange={(cd) => {
                    if (readOnly) return;
                    setContractFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.ContractReference;
                        delete next.contractCurrency;
                        return next;
                    });
                    handleContractChange(cd);
                }}
                authAxios={authAxios}
                clientLabelById={clientLabelById}
                setClientLabelById={setClientLabelById}
                onValidationError={appendValidationErrors}
                fieldErrors={contractFieldErrors}
                validationAttempted={validationAttempted}
                currencyOptions={currencyOptions}
                selectMenuProps={selectMenuProps}
                readOnly={readOnly}
            />

            <PlanWorkspaceAccordion
                title="Plan Details"
                defaultOpen
                level="primary"
            >
                <PlanFormSection
                    plan={draft.plan}
                    onChange={(plan) => {
                        if (readOnly) return;
                        setDraft((d) => ({ ...d, plan }));
                    }}
                    typeOptions={visibleTypeOptions}
                    selectMenuProps={selectMenuProps}
                    validationAttempted={validationAttempted}
                    readOnly={readOnly}
                />

                <PlanWorkspaceAccordion
                    title="Fees"
                    defaultOpen={false}
                    level="nested"
                >
                    <PlanFeesSection
                        fees={draft.fees}
                        onChange={(fees) => {
                            if (readOnly) return;
                            setDraft((d) => ({ ...d, fees }));
                        }}
                        contractCurrencyCode={contractCurrencyCode}
                        settlementTypeOptions={visibleSettlementTypeOptions}
                        selectMenuProps={selectMenuProps}
                        validationAttempted={validationAttempted}
                        fieldErrorsByFee={fieldErrorsByFee}
                        readOnly={readOnly}
                    />
                </PlanWorkspaceAccordion>

                <PlanWorkspaceAccordion
                    title="Targets"
                    defaultOpen
                    level="nested"
                >
                    <div className="d-flex plan-targets-layout" style={{ minHeight: 480, flexWrap: "wrap" }}>
                        {!targetNavCollapsed && (
                            <TargetListNav
                                targets={draft.targets}
                                fees={draft.fees}
                                activeLocalId={activeTarget?.localId}
                                onSelect={setActiveTargetId}
                                onChange={(targets) => {
                                    if (readOnly) return;
                                    setDraft((d) => ({ ...d, targets }));
                                }}
                                selectMenuProps={selectMenuProps}
                                readOnly={readOnly}
                            />
                        )}

                        <TargetEditorPanel
                            target={activeTarget}
                            inlineTargetNav={targetNavCollapsed ? (
                                <TargetSelectorBar
                                    targets={draft.targets}
                                    fees={draft.fees}
                                    activeLocalId={activeTarget?.localId}
                                    onSelect={setActiveTargetId}
                                    onChange={(targets) => {
                                        if (readOnly) return;
                                        setDraft((d) => ({ ...d, targets }));
                                    }}
                                    selectMenuProps={selectMenuProps}
                                    readOnly={readOnly}
                                />
                            ) : null}
                            fieldErrors={activeFieldErrors}
                            validationAttempted={validationAttempted}
                            usdRate={usdRate}
                            computationTypeOptions={visibleComputationTypeOptions}
                            settlementTypeOptions={visibleSettlementTypeOptions}
                            onChange={(t) => {
                                if (readOnly) return;
                                setDraft((d) => ({
                                    ...d,
                                    targets: d.targets.map((x) => (x.localId === t.localId ? t : x)),
                                }));

                                if (!t.localId || !fieldErrorsByTarget[t.localId]) return;

                                const prevTarget = draft?.targets?.find((x) => x.localId === t.localId);
                                const prevType = normalizeRebateValueType(prevTarget?.rebateValueType);
                                const nextType = normalizeRebateValueType(t.rebateValueType);

                                setFieldErrorsByTarget((prev) => {
                                    const next = { ...prev };
                                    const fe = next[t.localId];
                                    if (!fe) return next;

                                    if (prevType !== nextType && nextType === "P") {
                                        const { currency: _c, ...rest } = fe;
                                        if (Object.keys(rest).length === 0) delete next[t.localId];
                                        else next[t.localId] = rest;
                                    } else {
                                        delete next[t.localId];
                                    }
                                    return next;
                                });
                            }}
                            contractCurrencyCode={contractCurrencyCode}
                            selectMenuProps={selectMenuProps}
                            readOnly={readOnly}
                            authAxios={authAxios}
                            onNotify={(type, title, message) => {
                                if (readOnly) return;
                                if (type === "error") {
                                    const text = message ? `${title}: ${message}` : title;
                                    appendValidationErrors(text);
                                }
                            }}
                        />
                    </div>
                </PlanWorkspaceAccordion>
            </PlanWorkspaceAccordion>
            </div>
            <div className="plan-editor-modal-footer-bar">
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => void handleViewSimulation()}
                >
                    View Simulation
                </button>
                <div className="plan-editor-modal-footer-bar__primary">
                    {!readOnly && (
                        <button
                            type="button"
                            className="btn btn-info"
                            onClick={() => void handleApply()}
                        >
                            Apply
                        </button>
                    )}
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={onClose}
                    >
                        {readOnly ? "Close" : "Cancel"}
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <>
        <ModalComp
            modal={open}
            modalTitle={
                <div style={{ display: "flex", alignItems: "center", width: "100%" }}>
                    <span style={{ flex: 1 }}>
                        {readOnly ? "View Contract (locked)" : isNew ? "Add Contract" : "Edit Contract"}
                    </span>
                    {!isNew && (
                        <div className="plan-editor-toolbar" style={{ marginLeft: "auto", paddingRight: "32px" }}>
                            {/* <button
                                type="button"
                                className="plan-editor-toolbar-btn"
                                title="Export to Excel"
                                onClick={handleExportExcel}
                            >
                                <i className="fa fa-file-excel-o" />
                                <span>Excel</span>
                            </button> */}
                            <button
                                type="button"
                                className="plan-editor-toolbar-btn"
                                title="Print Report"
                                onClick={handlePrint}
                            >
                                <i className="fa fa-print" />
                                <span>Print</span>
                            </button>
                        </div>
                    )}
                </div>
            }
            modalBody={modalBody}
            onClose={onClose}
            hideFooterButtons
            size="xl"
            className="importDataModal planEditorModal"
        />

        <ModalComp
            modal={simulationModePickerOpen}
            modalTitle="Choose simulation view:"
            modalBody={(
                <div className="d-flex gap-3 py-2">
                    <button
                        type="button"
                        className="btn btn-success flex-grow-1"
                        onClick={() => void handleSimulationModeChoice("current")}
                    >
                        View Current Simulation
                    </button>
                    <button
                        type="button"
                        className="btn btn-primary flex-grow-1"
                        onClick={() => void handleSimulationModeChoice("previousYear")}
                    >
                        View Previous Year Simulation
                    </button>
                </div>
            )}
            onClose={() => {
                setSimulationModePickerOpen(false);
                setPendingSimulationResolved(null);
            }}
            onCloseText="Cancel"
            size="md"
        />

        <ModalComp
            modal={simulationOpen}
            modalTitle={
                simulationMode === "previousYear"
                    ? "Computation Simulation - Previous Year"
                    : "Computation Simulation - Current"
            }
            modalBody={(
                <div className="cvr-workspace-root py-2 computation-simulation-modal">
                    {simulationErrors.length > 0 && (
                        <div className="alert alert-warning py-2 px-3 mb-3">
                            {simulationErrors.map((msg) => (
                                <div key={msg}>{msg}</div>
                            ))}
                        </div>
                    )}
                    {simulationLoadingSales && !simulationPreview && (
                        <div className="d-flex align-items-center gap-2 text-muted py-3">
                            <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                            <span>Loading computation simulation...</span>
                        </div>
                    )}
                    {simulationResolved && (
                        <ComputationResultsPanel
                            resolved={simulationResolved}
                            previewResults={simulationPreview}
                            salesByTargetId={simulationSalesById}
                            salesMetaByTargetId={simulationSalesMeta}
                            loadingSales={simulationLoadingSales}
                            isLoading={simulationLoadingSales}
                            dailyRate={usdRate}
                            showDetailsLink={false}
                            layoutVariant="simulation"
                            showBreakdowns
                            fetchSalesForDraftWindows={fetchSimulationSalesForDraftWindows}
                            allClientIds={simulationClientIds}
                            asOf={simulationAsOfDate}
                            lastAccountingGenerationDate={lastAccountingGenerationDate}
                        />
                    )}
                </div>
            )}
            onClose={() => {
                setSimulationOpen(false);
                setSimulationErrors([]);
                setSimulationMode("current");
                resetSimulationPreview();
            }}
            onCloseText="Close"
            hideFooterButtons={false}
            size="xl"
            className="importDataModal planEditorModal"
        />
        </>
    );
}