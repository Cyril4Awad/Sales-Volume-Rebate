import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import moment from "moment";

import { AuthContext } from "../../ContextProvider/AuthContext";
import { getApiBase } from "../../globals";
import { AdvancedTable, InputTextComponent, ModalComp, Notification } from "../../ReusableComponents";
import { triggerSessionExpired } from "../../utils/sessionExpired";
import { updateTokenFromResponse } from "../../utils/updateTokenFromResponse";
import "./VRComputationWorkspace.css";
import "../Plans/styles/VRPlansWorkspace.css";
import "../Plans/editor/PlanEditorModal/PlanEditorModal.css";

import { resolveTargetSalesKey } from "../../utils/computationEngine";
import { listClientPlanCandidates, resolveClientPlan } from "../../utils/computationPlanResolver";
import {
    buildSettlementTypesMap,
    buildTargetConfirmDetails,
    formatProcessAmountWithPeriods,
    getFeeEligibility,
    getPeriodLength,
    isConditionedTarget,
    paymentsForTarget,
    periodsPaidCountForTarget,
    SETTLEMENT_STATUS,
    sumSettlementTotals,
    tryResolveCoveredPeriodRange,
    tryResolveFinalCatchUpPeriodRange,
} from "../../utils/settlementPaymentLogic";
import { buildPlanTableRow, getPlanWorkspaceTableColumns } from "../../utils/planWorkspaceTable";
import {
    getClientsApi,
    CLIENT_PICKER_PAGE_SIZE,
    PICKER_SEARCH_DEBOUNCE_MS,
    normalizePagedClientsResponse,
    mapApiClientDtoToPickerRow,
} from "../../utils/contractWorkspaceMappers";

import exportComputationToExcel from "../../utils/exportComputationToExcel";
import printComputationReport from "../../utils/printComputationReport";
import ComputationResultsPanel from "./ComputationResultsPanel/ComputationResultsPanel";
import {
    buildFeeBatchModalColumns,
    formatFeeAmount,
    formatMetricAmount,
    fmtQty,
    fmtRebateAmount,
} from "./utils/computationDisplayUtils";
import { useComputationPreview } from "./hooks/useComputationPreview";
import { useSettlementPayments } from "./hooks/useSettlementPayments";
import { useLastAccountingGenerationDate } from "./hooks/useLastAccountingGenerationDate";
import {
    buildPickerCheckboxColumn,
    mapClientFieldColumns,
} from "../../utils/clientPickerTableColumns";
import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "../../utils/mobileTableCells";

const LoadingStep = ({ message }) => (
    <div className="d-flex align-items-center gap-2 text-muted small mt-2">
        <div className="spinner-border spinner-border-sm text-secondary" role="status" aria-hidden="true" />
        <span>{message}</span>
    </div>
);

/** Returns a blockedModal message when Location/CashReg session flags are null or invalid; otherwise null. */
function getLocationCashRegBlockMessage(locationValid, cashRegValid) {
    if (locationValid == null || cashRegValid == null) {
        return "Unable to verify location configuration.";
    }
    const parts = [];
    if (!locationValid) parts.push("Invalid location code.");
    if (!cashRegValid) parts.push("Invalid cash register code.");
    return parts.length > 0 ? parts.join("\n") : null;
}

export default function VRComputationWorkspace() {
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

    const [notification, setNotification] = useState({
        type: "", title: "", message: "", display: "none",
    });
    const showNotification = useCallback((type, title, message = "") => {
        setNotification({ type, title, message, display: "block" });
        setTimeout(() => setNotification((prev) => ({ ...prev, display: "none" })), 3000);
    }, []);

    const [selectedClient, setSelectedClient] = useState(null);
    const [missingClient, setMissingClient] = useState(false);

    const [clientModalOpen, setClientModalOpen] = useState(false);
    const [clientPickerRows, setClientPickerRows] = useState([]);
    const [clientPickerTotal, setClientPickerTotal] = useState(0);
    const [clientPickerPage, setClientPickerPage] = useState(1);
    const clientPickerPagingRef = useRef({ page: 1, search: "" });
    const clientPickerDebounceTimer = useRef(null);
    const [clientPickerSelectedIds, setClientPickerSelectedIds] = useState([]);

    const [planPickerOpen, setPlanPickerOpen] = useState(false);
    const [planPickerRows, setPlanPickerRows] = useState([]);
    const [planPickerSelectedIds, setPlanPickerSelectedIds] = useState([]);
    const [pendingClientOpt, setPendingClientOpt] = useState(null);

    const [resolved, setResolved] = useState(null);
    const [loadingResolve, setLoadingResolve] = useState(false);
    const [detailsModal, setDetailsModal] = useState({
        open: false, targetId: null, targetName: "", items: [], currencies: [], loading: false,
    });
    const [dailyRate, setDailyRate] = useState(null);
    const [blockedModal, setBlockedModal] = useState({ open: false, message: "" });
    const [confirmModal, setConfirmModal] = useState({
        open: false, target: null, targetResult: null, details: null,
        inlineError: null, inlineErrorType: null,
    });
    const [feeBatchModal, setFeeBatchModal] = useState({ open: false, rows: [], inlineError: null, inlineErrorType: null });
    const [contractLocked, setContractLocked] = useState(false);
    const [saveConfirmModal, setSaveConfirmModal] = useState({ open: false });
    const [savingComputation, setSavingComputation] = useState(false);
    const [isComputationSaved, setIsComputationSaved] = useState(false);

    const {
        salesByTargetId,
        salesMetaByTargetId,
        previewResults,
        totalSalesAmountBase,
        loadingSales,
        runPreview,
        resetPreview,
        fetchSalesForDraftWindows,
    } = useComputationPreview(authAxios, { dailyRate });

    const {
        payments,
        loadingPayments,
        processing,
        loadPayments,
        resetPayments,
        processTarget,
        processFeesBatch,
    } = useSettlementPayments(authAxios);

    const { generationDate: lastAccountingGenerationDate } = useLastAccountingGenerationDate(authAxios);

    const resetWorkspace = useCallback(() => {
        setResolved(null);
        resetPreview();
        resetPayments();
        setIsComputationSaved(false);
        setBlockedModal({ open: false, message: "" });
        setConfirmModal({ open: false, target: null, targetResult: null, details: null, inlineError: null, inlineErrorType: null });
        setFeeBatchModal({ open: false, rows: [], inlineError: null, inlineErrorType: null });
    }, [resetPreview, resetPayments]);

    const loadClientPickerPage = useCallback(async (page, search) => {
        try {
            const skip = (page - 1) * CLIENT_PICKER_PAGE_SIZE;
            const { data } = await authAxios.get(getClientsApi(), {
                params: {
                    skip,
                    take: CLIENT_PICKER_PAGE_SIZE,
                    search: search || undefined,
                    onlyContractMainClients: true,
                },
            });
            const { items, totalCount } = normalizePagedClientsResponse(data);
            setClientPickerRows((items || []).map(mapApiClientDtoToPickerRow));
            setClientPickerTotal(totalCount);
            setClientPickerPage(page);
            clientPickerPagingRef.current = { page, search };
        } catch (e) {
            showNotification("error", "Failed to load clients", e?.message || "");
        }
    }, [authAxios, showNotification]);

    useEffect(() => {
        authAxios.get(`${getApiBase()}/CVRDailyRates/current`)
            .then(({ data }) => {
                const rate = data?.rate;
                setDailyRate(rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null);
            })
            .catch(() => setDailyRate(null));
    }, [authAxios]);

    useEffect(() => {
        const contractId = resolved?.contract?.ContractID
            ?? resolved?.contract?.contractId
            ?? resolved?.contract?.CTR_ContractID;
        if (!contractId || !authAxios) {
            setContractLocked(false);
            return;
        }
        authAxios.get(`${getApiBase()}/CVRComputation/lock-status`, {
            params: { contractIds: String(contractId) },
        })
            .then(({ data }) => setContractLocked(!!data?.[String(contractId)]?.locked))
            .catch(() => setContractLocked(false));
    }, [authAxios, resolved?.contract]);

    useEffect(() => {
        if (!clientModalOpen) return;
        clientPickerPagingRef.current = { page: 1, search: "" };
        void loadClientPickerPage(1, "");
        return () => {
            if (clientPickerDebounceTimer.current) clearTimeout(clientPickerDebounceTimer.current);
        };
    }, [clientModalOpen, loadClientPickerPage]);

    useEffect(() => {
        const main = document.querySelector(".app-body .main");
        const fluid = main?.querySelector(":scope > .container-fluid");
        if (!main) return undefined;

        const prevMainOverflowY = main.style.overflowY;
        const prevMainOverflowX = main.style.overflowX;
        const prevFluidHeight = fluid?.style.height ?? "";
        const prevFluidOverflow = fluid?.style.overflow ?? "";

        main.style.setProperty("overflow-y", "auto", "important");
        main.style.setProperty("overflow-x", "auto", "important");
        if (fluid) {
            fluid.style.height = "auto";
            fluid.style.overflow = "visible";
        }

        return () => {
            main.style.overflowY = prevMainOverflowY;
            main.style.overflowX = prevMainOverflowX;
            main.scrollTop = 0;
            if (fluid) {
                fluid.style.height = prevFluidHeight;
                fluid.style.overflow = prevFluidOverflow;
            }
        };
    }, []);

    const handleClientTriggerPaging = useCallback((searchValue, _f, _s, counter) => {
        if (clientPickerDebounceTimer.current) clearTimeout(clientPickerDebounceTimer.current);
        clientPickerDebounceTimer.current = setTimeout(() => {
            const s = String(searchValue ?? "").trim();
            const prev = clientPickerPagingRef.current;
            const page = s !== prev.search ? 1 : (counter ? Math.max(1, prev.page + counter) : 1);
            void loadClientPickerPage(page, s);
        }, PICKER_SEARCH_DEBOUNCE_MS);
    }, [loadClientPickerPage]);

    const itemBreakdownColumns = useMemo(() => {
        const currencies = detailsModal.currencies ?? [];
        const effectiveCurrencies = currencies.length > 0 ? currencies : ["USD"];
        const amountCols = effectiveCurrencies.map((cur) => ({
            Header: `Net Sales (${cur})`,
            accessor: `netSales_${cur}`,
            width: 140,
            style: { textAlign: "center" },
            Cell: (cell) => {
                const formatted = formatMetricAmount(cell.value, cur);
                return (
                    <div style={{ textAlign: "center" }}>
                        {mobileDualCell(
                            formatted,
                            mobileLabeledRow(`Net Sales (${cur})`, formatted)
                        )}
                    </div>
                );
            },
        }));
        return [
            {
                Header: "Item Ref",
                accessor: "itemRef",
                minWidth: 100,
                style: { textAlign: "center" },
                Cell: (cell) => (
                    <div style={{ paddingLeft: 10, textAlign: "center" }}>
                        {mobileDualCell(cell.value, mobileLabeledRow("Item Ref", cell.value))}
                    </div>
                ),
            },
            {
                Header: "Description",
                accessor: "itemDesc",
                minWidth: 200,
                Cell: (cell) => mobileDualCell(cell.value, mobileLabeledRow("Description", cell.value)),
            },
            {
                Header: "Net Qty",
                accessor: "netQty",
                width: 90,
                style: { textAlign: "center" },
                Cell: (cell) => (
                    <div style={{ textAlign: "center" }}>
                        {mobileDualCell(cell.value, mobileLabeledRow("Net Qty", cell.value))}
                    </div>
                ),
            },
            ...amountCols,
        ];
    }, [detailsModal.currencies]);

    const itemBreakdownRows = useMemo(() => {
        const items = detailsModal.items ?? [];
        const currencies = detailsModal.currencies ?? [];
        const effectiveCurrencies = currencies.length > 0 ? currencies : ["USD"];

        const getItemAmount = (item, cur) => {
            if (cur === "USD") return Number(item.netSalesAmountUSD ?? item.netSalesAmount ?? 0);
            if (cur === "LBP") return Number(item.netSalesAmountLBP ?? 0);
            return 0;
        };

        const grouped = {};
        items.forEach((item) => {
            const key = `${item.itemRef}|${item.itemDesc}`;
            if (!grouped[key]) {
                grouped[key] = {
                    itemRef: item.itemRef ?? "-",
                    itemDesc: item.itemDesc ?? "-",
                    netQty: 0,
                };
                effectiveCurrencies.forEach((cur) => { grouped[key][`netSales_${cur}`] = 0; });
            }
            grouped[key].netQty += Number(item.netQty ?? 0);
            effectiveCurrencies.forEach((cur) => {
                grouped[key][`netSales_${cur}`] =
                    (grouped[key][`netSales_${cur}`] ?? 0) + getItemAmount(item, cur);
            });
        });

        return Object.values(grouped);
    }, [detailsModal.items, detailsModal.currencies]);

    const runComputation = useCallback(async (clientOpt, workspaceItem) => {
        setSelectedClient(clientOpt);
        if (clientOpt?.value) setMissingClient(false);
        resetWorkspace();
        if (!clientOpt?.value) return;

        setLoadingResolve(true);
        try {
            const res = await resolveClientPlan(clientOpt.value, authAxios, { workspaceItem });
            setResolved(res);
            if (res?.targets?.length) {
                await runPreview(res);
            }
            if (res?.planId) {
                await loadPayments(res.planId);
            }
        } catch (e) {
            console.error(e);
            showNotification("error", "Failed to resolve plan", e?.message || "");
            setResolved({ error: "No contract linked to this client" });
        } finally {
            setLoadingResolve(false);
        }
    }, [authAxios, resetWorkspace, runPreview, showNotification, loadPayments]);

    const resolveAndPrefetch = useCallback(async (clientOpt) => {
        setSelectedClient(clientOpt);
        if (clientOpt?.value) setMissingClient(false);
        resetWorkspace();
        if (!clientOpt?.value) return;

        setLoadingResolve(true);
        try {
            const { contractRecords, candidates } = await listClientPlanCandidates(clientOpt.value, authAxios);

            if (!candidates.length) {
                setResolved({ error: "No contract linked to this client" });
                return;
            }

            if (candidates.length === 1) {
                await runComputation(clientOpt, candidates[0].workspaceItem);
                return;
            }

            const rows = candidates.map((c) =>
                buildPlanTableRow(c.draft, contractRecords, { workspaceItem: c.workspaceItem })
            );
            setPendingClientOpt(clientOpt);
            setPlanPickerRows(rows);
            setPlanPickerSelectedIds([]);
            setPlanPickerOpen(true);
        } catch (e) {
            console.error(e);
            showNotification("error", "Failed to resolve plan", e?.message || "");
            setResolved({ error: "No contract linked to this client" });
        } finally {
            setLoadingResolve(false);
        }
    }, [authAxios, resetWorkspace, runComputation, showNotification]);

    const toggleClientPickerRow = useCallback((row) => {
        const id = Number(row?.clRecId ?? row?.value);
        if (!Number.isFinite(id) || id <= 0) return;

        const opt = {
            value: row.value,
            label: row.label ?? "",
            code: row.code ?? String(row.value),
        };

        setClientPickerSelectedIds([id]);
        setClientModalOpen(false);
        void resolveAndPrefetch(opt);
    }, [resolveAndPrefetch]);

    const clientPickerColumns = useMemo(() => [
        buildPickerCheckboxColumn({
            checked: (row) => clientPickerSelectedIds.includes(row.clRecId),
            onToggle: toggleClientPickerRow,
            ariaLabel: "Select client",
        }),
        ...mapClientFieldColumns(),
    ], [clientPickerSelectedIds, toggleClientPickerRow]);

    const planPickerColumns = useMemo(
        () => getPlanWorkspaceTableColumns({ includeActions: false }),
        []
    );

    const togglePlanPickerRow = useCallback((row) => {
        const workspaceItem = row?._workspaceItem;
        if (!workspaceItem || !pendingClientOpt) return;

        setPlanPickerSelectedIds([row.recordId]);
        setPlanPickerOpen(false);
        void runComputation(pendingClientOpt, workspaceItem);
    }, [pendingClientOpt, runComputation]);

    const settlementTypesMap = useMemo(
        () => buildSettlementTypesMap(resolved?.settlementTypeOptions ?? []),
        [resolved?.settlementTypeOptions]
    );

    const contractStartDate = resolved?.contract?.StartDate
        ?? resolved?.contract?.startDate
        ?? resolved?.contract?.CTR_StartDate
        ?? null;
    const contractEndDate = resolved?.contract?.EndDate
        ?? resolved?.contract?.endDate
        ?? resolved?.contract?.CTR_EndDate
        ?? null;

    const contractStartFormatted = contractStartDate && moment(contractStartDate).isValid()
        ? moment(contractStartDate).format("DD-MM-YYYY")
        : "-";
    const contractEndFormatted = contractEndDate && moment(contractEndDate).isValid()
        ? moment(contractEndDate).format("DD-MM-YYYY")
        : "-";

    const refreshSettlementData = useCallback(async () => {
        if (resolved?.planId) {
            await loadPayments(resolved.planId);
        }
    }, [loadPayments, resolved?.planId]);

    const handleProcessTarget = useCallback(async (target, targetResult, eligibility) => {
        if (!target || !eligibility) return;

        const locBlock = getLocationCashRegBlockMessage(
            userData?.locationValid,
            userData?.cashRegValid,
        );
        if (locBlock) {
            setBlockedModal({ open: true, message: locBlock });
            return;
        }

        if (eligibility.status === SETTLEMENT_STATUS.BLOCKED) {
            setBlockedModal({ open: true, message: eligibility.message ?? "Process is not available." });
            return;
        }

        if (eligibility.status !== SETTLEMENT_STATUS.ELIGIBLE) return;

        const resultKey = resolveTargetSalesKey(target);
        let sales = salesByTargetId[resultKey] ?? {};

        // Always Applied: confirm amounts must match Process (capped sales + period resolution).
        let trailingPeriod = null;
        if (!isConditionedTarget(target)) {
            try {
                const periodsCount = eligibility.periodsCount ?? 0;
                const period = getPeriodLength(target?.settlementTypeId, settlementTypesMap);
                const fixedAnchor = target?.fromDate ?? target?.FromDate;
                const targetFromDate = fixedAnchor;
                const targetEndDate = target?.toDate ?? target?.ToDate ?? null;
                const targetId = target?.targetId ?? target?.targetID ?? target?.TargetID;
                const periodsPaid = periodsPaidCountForTarget(
                    fixedAnchor,
                    period.value,
                    paymentsForTarget(payments, targetId),
                    contractEndDate,
                    targetEndDate
                );

                let exclusiveTo;
                if (eligibility.isFinalCatchUp) {
                    if (!targetEndDate) {
                        showNotification(
                            "error",
                            "Settlement failed ",
                            "Unable to resolve the trailing settlement period for this target."
                        );
                        return;
                    }
                    trailingPeriod = tryResolveFinalCatchUpPeriodRange(
                        fixedAnchor,
                        period.value,
                        periodsPaid,
                        targetFromDate,
                        targetEndDate
                    );
                    if (!trailingPeriod?.periodEnd?.isValid()) {
                        showNotification(
                            "error",
                            "Settlement failed ",
                            "Unable to resolve the trailing settlement period for this target."
                        );
                        return;
                    }
                    exclusiveTo = moment(targetEndDate).startOf("day");
                } else {
                    const covered = tryResolveCoveredPeriodRange(
                        fixedAnchor,
                        period.value,
                        periodsPaid,
                        periodsCount
                    );
                    if (!covered?.periodEnd?.isValid()) {
                        showNotification(
                            "error",
                            "Settlement failed ",
                            "Unable to resolve the closed settlement period for this target."
                        );
                        return;
                    }
                    exclusiveTo = covered.periodEnd.clone().startOf("day").add(1, "day");
                }

                const mapped = await fetchSalesForDraftWindows(
                    target,
                    resolved?.allClientIds ?? [],
                    [{ key: "payable", toDate: exclusiveTo.toDate() }]
                );
                const capped = mapped[`${resultKey}:payable`];
                if (!capped) {
                    showNotification(
                        "error",
                        "Settlement failed ",
                        "Unable to load capped sales for confirmation."
                    );
                    return;
                }
                sales = capped;
            } catch (e) {
                const msg = e?.response?.data ?? e?.message ?? "Unable to load capped sales for confirmation.";
                showNotification("error", "Settlement failed ", String(msg));
                return;
            }
        }

        const details = buildTargetConfirmDetails({
            target,
            targetResult,
            sales,
            contractCurrency: resolved?.contractCurrency ?? "USD",
            payments,
            periodsCount: eligibility.periodsCount ?? 0,
            isFinalCatchUp: eligibility.isFinalCatchUp ?? false,
            trailingPeriod,
        });

        setConfirmModal({ open: true, target, targetResult, details, inlineError: null, inlineErrorType: null });
    }, [
        contractEndDate,
        fetchSalesForDraftWindows,
        payments,
        resolved?.allClientIds,
        resolved?.contractCurrency,
        salesByTargetId,
        settlementTypesMap,
        showNotification,
        userData?.cashRegValid,
        userData?.locationValid,
    ]);

    const handleConfirmTargetProcess = useCallback(async () => {
        const target = confirmModal.target;
        if (!target) return;

        try {
            await processTarget({
                targetId: target.targetId ?? target.targetID ?? target.TargetID,
                clientIds: resolved?.allClientIds ?? [],
            });
            showNotification(
                "success",
                `Settled: ${confirmModal.details?.targetName ?? "Target"} - ${fmtRebateAmount(confirmModal.details?.amountToProcess ?? 0, confirmModal.details?.currency)} ${confirmModal.details?.currency ?? ""}`.trim(),
                ""
            );
            setConfirmModal({ open: false, target: null, targetResult: null, details: null, inlineError: null, inlineErrorType: null });
            await refreshSettlementData();
        } catch (e) {
            const raw = e?.response?.data;
            const msg = typeof raw === "string"
                ? raw
                : raw?.title ?? raw?.message ?? e?.message ?? "Failed to process settlement.";
            setConfirmModal((prev) => ({
                ...prev,
                inlineError: String(msg),
                inlineErrorType: "danger",
            }));
        }
    }, [confirmModal.details, confirmModal.target, processTarget, refreshSettlementData, resolved?.allClientIds, showNotification]);

    const openFeeBatchModal = useCallback(() => {
        const locBlock = getLocationCashRegBlockMessage(
            userData?.locationValid,
            userData?.cashRegValid,
        );
        if (locBlock) {
            setBlockedModal({ open: true, message: locBlock });
            return;
        }

        const fees = resolved?.fees ?? [];
        const contractCurrency = resolved?.contractCurrency ?? "USD";
        const rows = fees.map((fee) => {
            const eligibility = getFeeEligibility({
                fee,
                payments,
                settlementTypesMap,
                contractStartDate,
                contractEndDate,
                contractCurrency,
            });
            const feeId = String(fee.feeId ?? fee.feeID ?? "");
            const { currency } = formatFeeAmount(fee);
            const isEligible = eligibility.status === SETTLEMENT_STATUS.ELIGIBLE;
            const processAmount = eligibility.processAmount ?? 0;
            const periodsCount = eligibility.periodsCount ?? 0;
            const settlementDisplay = isEligible && processAmount > 0
                ? formatProcessAmountWithPeriods(processAmount, currency, periodsCount)
                : "-";
            return {
                feeId,
                name: fee.typeLabel ?? "-",
                currency,
                status: eligibility.status,
                owedAmount: eligibility.owedAmount ?? eligibility.amountLeft ?? 0,
                processAmount,
                owedDisplay: `${fmtRebateAmount(eligibility.owedAmount ?? eligibility.amountLeft ?? 0, currency)}`,
                settlementDisplay,
                checked: false,
                disabled: !isEligible,
                note: eligibility.message ?? "",
            };
        });
        setFeeBatchModal({ open: true, rows, inlineError: null, inlineErrorType: null });
    }, [contractEndDate, contractStartDate, payments, resolved?.fees, resolved?.contractCurrency, settlementTypesMap, userData?.cashRegValid, userData?.locationValid]);

    const handleFeeBatchApply = useCallback(async () => {
        const selected = feeBatchModal.rows.filter((row) => row.checked && !row.disabled);
        if (!selected.length) {
            setFeeBatchModal((prev) => ({
                ...prev,
                inlineError: "Select at least one eligible fee to settle.",
                inlineErrorType: "warning",
            }));
            return;
        }

        const feeIds = selected.map((row) => Number(row.feeId)).filter((n) => n > 0);

        try {
            await processFeesBatch({
                clientIds: resolved?.allClientIds ?? [],
                feeIds,
            });
            const n = selected.length;
            const title = n === 1
                ? `Settled 1 fee - ${selected[0].settlementDisplay ?? ""}`.trim()
                : `Settled ${n} fees`;
            showNotification("success", title, "");
            setFeeBatchModal({ open: false, rows: [], inlineError: null, inlineErrorType: null });
            await refreshSettlementData();
        } catch (e) {
            const raw = e?.response?.data;
            const msg = typeof raw === "string"
                ? raw
                : raw?.title ?? raw?.message ?? e?.message ?? "Failed to process fee settlements.";
            setFeeBatchModal((prev) => ({
                ...prev,
                inlineError: String(msg),
                inlineErrorType: "danger",
            }));
        }
    }, [feeBatchModal.rows, processFeesBatch, refreshSettlementData, resolved?.allClientIds, showNotification]);

    const handleSaveComputation = useCallback(async () => {
        const planId = resolved?.planId;
        if (!planId) return;
        setSavingComputation(true);
        try {
            const { data } = await authAxios.post(`${getApiBase()}/CVRComputation/save`, { planId });
            setContractLocked(true);
            setIsComputationSaved(true);
            setSaveConfirmModal({ open: false });
            const targetCount = data?.targetCount ?? 0;
            const feeCount = data?.feeCount ?? 0;
            showNotification("success", `Saved ${targetCount} target(s), ${feeCount} fee(s)`, "");
        } catch (e) {
            const msg = e?.response?.data ?? e?.message ?? "Save failed.";
            showNotification("error", "Save failed", String(msg));
        } finally {
            setSavingComputation(false);
        }
    }, [authAxios, resolved?.planId, showNotification]);

    const updateFeeBatchRow = useCallback((feeId, patch) => {
        setFeeBatchModal((prev) => ({
            ...prev,
            inlineError: null,
            inlineErrorType: null,
            rows: prev.rows.map((row) => (
                row.feeId === feeId ? { ...row, ...patch } : row
            )),
        }));
    }, []);

    const feeBatchColumns = useMemo(
        () => buildFeeBatchModalColumns(updateFeeBatchRow),
        [updateFeeBatchRow]
    );

    // ── Grand total + subtotals (needed for export/print) ────────────────────

    const contractCurrency = resolved?.contractCurrency ?? "USD";

    const settlementTotals = useMemo(
        () => sumSettlementTotals({
            targets: resolved?.targets ?? [],
            targetResults: previewResults?.targetResults ?? [],
            salesByTargetId,
            fees: resolved?.fees ?? [],
            payments,
            contractCurrency,
        }),
        [resolved?.targets, previewResults?.targetResults, salesByTargetId, resolved?.fees, payments, contractCurrency]
    );

    const rebateTotal = settlementTotals.rebateOwed;
    const feeTotals = useMemo(() => ({ [contractCurrency]: settlementTotals.feesOwed }), [settlementTotals.feesOwed, contractCurrency]);
    const grandTotal = settlementTotals.grandOwed;

    const grandTotalUSD = grandTotal;
    const currencySubtotals = useMemo(() => {
        const out = {};
        if (rebateTotal) out[contractCurrency] = rebateTotal;
        return out;
    }, [rebateTotal, contractCurrency]);

    // ── Export / Print handlers ───────────────────────────────────────────────

    const handleExportExcel = useCallback(() => {
        if (!previewResults) return;
        exportComputationToExcel({
            selectedClient,
            resolved,
            previewResults,
            salesByTargetId,
            salesMetaByTargetId,
            payments,
            contractCurrency,
            dailyRate,
        });
    }, [selectedClient, resolved, previewResults, salesByTargetId, salesMetaByTargetId,
        payments, contractCurrency, dailyRate]);

    const handlePrint = useCallback(() => {
        if (!previewResults) return;
        printComputationReport({
            selectedClient,
            resolved,
            previewResults,
            salesByTargetId,
            salesMetaByTargetId,
            payments,
            contractCurrency,
            dailyRate,
            companyName: "",
        });
    }, [selectedClient, resolved, previewResults, salesByTargetId, salesMetaByTargetId,
        payments, contractCurrency, dailyRate]);

    // ─────────────────────────────────────────────────────────────────────────

    const openTargetDetails = useCallback(async (target) => {
        const allClientIds = resolved?.allClientIds ?? [Number(selectedClient?.value)];
        const targetId = target?.targetId ?? target?.TargetID ?? target?.targetID;
        const targetName = target?.targetName ?? target?.TargetName ?? "";
        if (!allClientIds.length || targetId == null) return;

        setDetailsModal({
            open: true, targetId, targetName, items: [], currencies: [], loading: true,
        });

        try {
            const { data } = await authAxios.get(`${getApiBase()}/CVRComputation/items`, {
                params: {
                    clientIds: allClientIds.join(","),
                    targetId,
                },
            });
            setDetailsModal((prev) => ({
                ...prev,
                items: data?.items ?? [],
                currencies: data?.currencies ?? [],
                loading: false,
            }));
        } catch (e) {
            showNotification("error", "Failed to load sales details", e?.message || "");
            setDetailsModal((prev) => ({ ...prev, open: false, loading: false }));
        }
    }, [authAxios, resolved, selectedClient?.value, showNotification]);

    const isLoading = loadingResolve || loadingSales;

    return (
        <div className="py-3 px-3 cvr-workspace-root" style={{ height: "auto", overflow: "visible" }}>

            <Notification
                type={notification.type}
                title={notification.title}
                message={notification.message}
                display={notification.display}
            />

            {/* ── Header with export/print buttons ── */}
            <div className="d-flex justify-content-between align-items-center mb-3 cvr-computation-header">
                <div className="d-flex align-items-center gap-2">
                    <h5 className="mb-0">Computation</h5>
                    {contractLocked && (
                        <span className="badge bg-secondary">Contract locked</span>
                    )}
                </div>
                {previewResults && !isLoading && (
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
                       <button
                            type="button"
                            className="btn btn-primary"
                            disabled={isComputationSaved || savingComputation}
                            title={isComputationSaved
                                ? "Already saved - use Select Client to run a new preview before saving again"
                                : contractLocked
                                    ? "Refresh saved figures (contract locked)"
                                    : "Save computation and lock contract for editing"}
                            onClick={() => setSaveConfirmModal({ open: true })}
                        >
                            Save
                      </button>
                    </div>
                )}
            </div>

            {/* Client picker card */}
            <div className="card border-0 shadow-sm mb-3">
                <div className="card-body">
                    <div className="d-flex align-items-end gap-2">
                        <div className="flex-grow-1">
                            <InputTextComponent
                                name="SelectedClientDisplay"
                                value={
                                    selectedClient
                                        ? `${selectedClient.code ?? selectedClient.value} - ${selectedClient.label ?? ""}`
                                        : ""
                                }
                                placeholder={<>Client <span className="required">*</span></>}
                                handleChange={() => { }}
                                handleOnblur={() => {
                                    if (!selectedClient?.value) setMissingClient(true);
                                }}
                                className={missingClient ? "alert-danger" : ""}
                                readOnly
                            />
                        </div>
                        <span
                            className="hyperlink-text mb-2"
                            style={{ whiteSpace: "nowrap", opacity: isLoading ? 0.5 : 1, pointerEvents: isLoading ? "none" : "auto" }}
                            onClick={() => {
                                setClientPickerSelectedIds(
                                    selectedClient?.value != null ? [selectedClient.value] : []
                                );
                                setClientModalOpen(true);
                            }}
                        >
                            Select Client
                        </span>
                    </div>

                    {loadingResolve && <LoadingStep message="Resolving contract..." />}
                    {loadingSales && !loadingResolve && (
                        <LoadingStep message={`Loading sales data for ${resolved?.allClientIds?.length ?? 1} client${(resolved?.allClientIds?.length ?? 1) !== 1 ? "s" : ""}...`} />
                    )}

                    {resolved?.error && (
                        <div className="alert alert-warning py-2 px-3 mt-3 mb-0">
                            {resolved.error}
                        </div>
                    )}

                    {resolved?.plan && !isLoading && (
                        <div className="mt-2 d-flex align-items-center gap-3 flex-wrap">
                            <span className={`badge ${resolved?.clientRole === "Master Client" ? "bg-primary" : "bg-info text-dark"}`}>
                                {resolved?.clientRole ?? "-"}
                            </span>
                            <span className="small text-muted">
                                Contract: <strong>{resolved?.contract?.ContractReference ?? "-"}</strong>
                            </span>
                            <span className="small text-muted">
                                Plan: <strong>{resolved?.plan?.planName ?? "-"}</strong>
                            </span>
                            <span className="small text-muted">
                                Valid From <strong>{contractStartFormatted}</strong> To <strong>{contractEndFormatted}</strong>
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {previewResults && !isLoading && (
                <ComputationResultsPanel
                    resolved={resolved}
                    previewResults={previewResults}
                    salesByTargetId={salesByTargetId}
                    salesMetaByTargetId={salesMetaByTargetId}
                    loadingSales={loadingSales || loadingPayments}
                    isLoading={isLoading}
                    dailyRate={dailyRate}
                    showProcessButton={isComputationSaved}
                    payments={payments}
                    showBreakdowns
                    fetchSalesForDraftWindows={fetchSalesForDraftWindows}
                    allClientIds={resolved?.allClientIds ?? []}
                    asOf={moment().format("YYYY-MM-DD")}
                    lastAccountingGenerationDate={lastAccountingGenerationDate}
                    onOpenDetails={(target) => void openTargetDetails(target)}
                    onProcessTarget={handleProcessTarget}
                    onProcessFees={openFeeBatchModal}
                />
            )}

            {/* Client picker modal */}
            <ModalComp
                modal={clientModalOpen}
                modalTitle="Select client"
                modalBody={(
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={clientPickerColumns}
                            dataArray={clientPickerRows}
                            enableSearch
                            isFilterOptionOneRow
                            minRows={0}
                            showPagination={false}
                            triggerPaging={handleClientTriggerPaging}
                            recordCount={clientPickerTotal}
                            pageSize={CLIENT_PICKER_PAGE_SIZE}
                            showRowSelectedAndRowCount={true}
                            currentPage={clientPickerPage}
                            maxHeight="420px"
                        />
                    </div>
                )}
                onClose={() => setClientModalOpen(false)}
                onCloseText="Cancel"
                size="xl"
            />

            {/* Plan picker modal */}
            <ModalComp
                modal={planPickerOpen}
                modalTitle="Select Contract"
                modalBody={(
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={[
                                {
                                    Header: " ",
                                    accessor: "recordId",
                                    width: 48,
                                    Cell: (cell) => mobileActionRow(
                                        <div className="d-flex justify-content-center">
                                            <input
                                                type="checkbox"
                                                className="form-check-input m-0"
                                                checked={planPickerSelectedIds.includes(cell.original.recordId)}
                                                onChange={() => togglePlanPickerRow(cell.original)}
                                                aria-label="Select Contract"
                                            />
                                        </div>
                                    ),
                                },
                                ...planPickerColumns,
                            ]}
                            dataArray={planPickerRows}
                            enableSearch
                            isFilterOptionOneRow
                            minRows={0}
                            showPagination={false}
                            recordCount={planPickerRows.length}
                            pageSize={planPickerRows.length || 5}
                            maxHeight="420px"
                        />
                    </div>
                )}
                onClose={() => setPlanPickerOpen(false)}
                onCloseText="Cancel"
                size="xl"
            />

            {/* Sales details modal */}
            <ModalComp
                modal={detailsModal.open}
                modalTitle={`Sales Details - ${detailsModal.targetName}`}
                modalBody={(() => {
                    if (detailsModal.loading) {
                        return (
                            <div className="d-flex align-items-center gap-2 text-muted py-3">
                                <div className="spinner-border spinner-border-sm text-secondary" role="status" />
                                <span>Loading sales details...</span>
                            </div>
                        );
                    }
                    const items = detailsModal.items ?? [];
                    if (!items.length) {
                        return <div className="text-muted">No sales data found for this period</div>;
                    }
                    const currencies = detailsModal.currencies ?? [];
                    const effectiveCurrencies = currencies.length > 0 ? currencies : ["USD"];
                    return (
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={itemBreakdownColumns}
                                dataArray={itemBreakdownRows}
                                enableSearch
                                minRows={0}
                                showPagination={false}
                                isFilterOptionOneRow
                                maxHeight="420px"
                            />
                            <div className="d-flex flex-column align-items-end gap-1 fw-bold border-top pt-2 mt-2 small">
                                <span>Total Net Qty: {fmtQty(itemBreakdownRows.reduce((s, row) => s + (row.netQty ?? 0), 0))}</span>
                                {effectiveCurrencies.map((cur) => (
                                    <span key={cur}>
                                        Total ({cur}): {formatMetricAmount(itemBreakdownRows.reduce((s, row) => s + (row[`netSales_${cur}`] ?? 0), 0), cur)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    );
                })()}
                onClose={() => setDetailsModal((prev) => ({ ...prev, open: false }))}
                onCloseText="Close"
                size="xl"
            />

            <ModalComp
                modal={blockedModal.open}
                modalTitle="Process unavailable"
                modalBody={<p className="mb-0" style={{ whiteSpace: "pre-line" }}>{blockedModal.message}</p>}
                onClose={() => setBlockedModal({ open: false, message: "" })}
                onCloseText="OK"
                size="md"
            />

            <ModalComp
                modal={confirmModal.open}
                modalTitle="Confirm settlement payment"
                modalBody={confirmModal.details ? (
                    <div className="d-flex flex-column gap-2">
                        {confirmModal.inlineError && (
                            <div className={`alert alert-${confirmModal.inlineErrorType === "danger" ? "danger" : "warning"} py-2 px-3 mb-0`}>
                                {confirmModal.inlineError}
                            </div>
                        )}
                        <div><strong>Target:</strong> {confirmModal.details.targetName}</div>
                        <div><strong>Period:</strong> {confirmModal.details.period}</div>
                        {confirmModal.details.isConditioned ? (
                            <>
                                <div><strong>Status:</strong> Achieved</div>
                                <div><strong>Rebate owed:</strong> {fmtRebateAmount(confirmModal.details.owedAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Rebate settled:</strong> {fmtRebateAmount(confirmModal.details.settledAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Amount to process:</strong> {fmtRebateAmount(confirmModal.details.amountToProcess, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Total sales at process:</strong> {formatMetricAmount(confirmModal.details.totalSales, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <p className="text-muted small mb-0 mt-2">{confirmModal.details.footerNote}</p>
                            </>
                        ) : (
                            <>
                                <div><strong>Cumulative rebate:</strong> {fmtRebateAmount(confirmModal.details.currentTotal, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Already settled:</strong> {fmtRebateAmount(confirmModal.details.settledAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Currently owed:</strong> {fmtRebateAmount(confirmModal.details.owedAmount, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                <div><strong>Amount to process (this settlement):</strong>{" "}
                                    {formatProcessAmountWithPeriods(
                                        confirmModal.details.amountToProcess,
                                        confirmModal.details.currency,
                                        confirmModal.details.periodsCount ?? 0
                                    )}
                                </div>
                                <div><strong>Total sales at process:</strong> {formatMetricAmount(confirmModal.details.totalSales, confirmModal.details.currency)} {confirmModal.details.currency}</div>
                                {confirmModal.details.footerNote && (
                                    <p className="text-muted small mb-0 mt-2">{confirmModal.details.footerNote}</p>
                                )}
                            </>
                        )}
                    </div>
                ) : null}
                onAccept={() => void handleConfirmTargetProcess()}
                onAcceptText={processing ? "Processing..." : "Confirm"}
                onClose={() => setConfirmModal({ open: false, target: null, targetResult: null, details: null, inlineError: null, inlineErrorType: null })}
                onCloseText="Cancel"
                size="md"
            />

            <ModalComp
                modal={feeBatchModal.open}
                className="cvr-fee-batch-modal"
                modalTitle="Process fee settlements"
                modalBody={(
                    <>
                        {feeBatchModal.inlineError && (
                            <div className={`alert alert-${feeBatchModal.inlineErrorType === "danger" ? "danger" : "warning"} py-2 px-3 mb-2`}>
                                {feeBatchModal.inlineError}
                            </div>
                        )}
                        <div className="adv-mobile-table cvr-fee-batch-table-wrap">
                            <AdvancedTable
                                columns={feeBatchColumns}
                                dataArray={feeBatchModal.rows}
                                minRows={0}
                                showPagination={false}
                            />
                        </div>
                    </>
                )}
                onAccept={() => void handleFeeBatchApply()}
                onAcceptText={processing ? "Applying..." : "Apply"}
                onClose={() => setFeeBatchModal({ open: false, rows: [], inlineError: null, inlineErrorType: null })}
                onCloseText="Cancel"
                size="lg"
            />

            <ModalComp
                modal={saveConfirmModal.open}
                modalTitle={contractLocked ? "Refresh saved figures?" : "Save computation?"}
                modalBody={(
                    <p className="mb-0">
                        {contractLocked
                            ? "This will update the saved computation figures and append a new sales snapshot history. The contract remains locked for editing."
                            : "Saving will permanently lock this contract and its plan for editing. Settlement will continue using live sales data."}
                    </p>
                )}
                onAccept={() => void handleSaveComputation()}
                onAcceptText={savingComputation ? "Saving..." : "Save"}
                onClose={() => setSaveConfirmModal({ open: false })}
                onCloseText="Cancel"
                size="md"
            />
        </div>
    );
}