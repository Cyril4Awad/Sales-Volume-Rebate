// Loads target sales and runs client-side computation preview for the workspace.
import { useCallback, useMemo, useState } from "react";
import moment from "moment";
import { getApiBase } from "../../../globals";
import { evaluatePlan, hasValidTargetDates, resolveTargetSalesKey, TARGET_STATE } from "../../../utils/computationEngine";
import { shiftResolvedForSimulation, resolveSimulationAsOf } from "../../../utils/simulationDateShift";
import { formatFeeAmount, resolveDateRange } from "../utils/computationDisplayUtils";

const toArray = (v) => (Array.isArray(v) ? v : []);

const SALES_BATCH_PREVIEW_MAX = 50;

const mapBatchSalesEntry = (salesKey, data) => ({
    salesKey: String(salesKey),
    salesAmounts: data?.salesAmounts ?? data?.SalesAmounts ?? {},
    salesAmount: data?.salesAmount ?? data?.SalesAmount ?? 0,
    salesAmountBase: data?.salesAmountBase ?? data?.SalesAmountBase ?? data?.salesAmount ?? data?.SalesAmount ?? 0,
    salesQuantity: data?.salesQuantity ?? data?.SalesQuantity ?? 0,
    salesAmountCurrency: data?.salesAmountCurrency ?? data?.SalesAmountCurrency ?? null,
    systemCurrency: data?.systemCurrency ?? data?.SystemCurrency ?? "USD",
    referenceScope: data?.referenceScope ?? data?.ReferenceScope ?? "all",
    fetchedAt: data?.fetchedAt ?? data?.FetchedAt ?? null,
    previousYearSalesAmounts: data?.previousYearSalesAmounts ?? data?.PreviousYearSalesAmounts ?? {},
    previousYearSalesQuantity: data?.previousYearSalesQuantity ?? data?.PreviousYearSalesQuantity ?? 0,
    growthPercentageUSD: data?.growthPercentageUSD ?? data?.GrowthPercentageUSD ?? 0,
    previousYearFromDate: data?.previousYearFromDate ?? data?.PreviousYearFromDate ?? null,
    previousYearToDate: data?.previousYearToDate ?? data?.PreviousYearToDate ?? null,
});

async function postSalesBatchPreview(authAxios, allClientIds, targetEntries) {
    const result = {};
    if (!authAxios || !allClientIds?.length || !targetEntries?.length) return result;

    for (let i = 0; i < targetEntries.length; i += SALES_BATCH_PREVIEW_MAX) {
        const chunk = targetEntries.slice(i, i + SALES_BATCH_PREVIEW_MAX);
        const payload = {
            clientIds: allClientIds,
            targets: chunk,
        };
        const { data } = await authAxios.post(`${getApiBase()}/CVRComputation/sales-batch-preview`, payload);
        chunk.forEach((entry) => {
            const key = entry.localKey;
            const raw = data?.[key] ?? data?.[String(key)];
            if (raw) result[key] = mapBatchSalesEntry(key, raw);
        });
    }

    return result;
}

export function useComputationPreview(authAxios, { dailyRate = null } = {}) {
    const [salesByTargetId, setSalesByTargetId] = useState({});
    const [salesMetaByTargetId, setSalesMetaByTargetId] = useState({});
    const [previewResults, setPreviewResults] = useState(null);
    const [totalSalesAmountBase, setTotalSalesAmountBase] = useState(0);
    const [loadingSales, setLoadingSales] = useState(false);
    const [activeContractCurrency, setActiveContractCurrency] = useState(null);

    const fetchTotalSales = useCallback(async (allClientIds, fromDate, toDate, contractCurrency = null) => {
        if (!fromDate || !toDate || !allClientIds?.length || !authAxios) return 0;
        try {
            const { data } = await authAxios.post(`${getApiBase()}/CVRComputation/totalsales`, {
                clientIds: allClientIds,
                fromDate: moment(fromDate).format("YYYY-MM-DD"),
                toDate: moment(toDate).format("YYYY-MM-DD"),
            });
            const cur = String(contractCurrency ?? "USD").trim().toUpperCase();
            if (cur === "LBP") {
                return Number(data?.salesAmountLBP ?? data?.SalesAmountLBP ?? 0);
            }
            return Number(data?.salesAmountUSD ?? data?.SalesAmountUSD ?? 0);
        } catch {
            return 0;
        }
    }, [authAxios]);

    const applySalesRows = useCallback((rows) => {
        const newSalesById = {};
        rows.forEach(({ salesKey, res }) => {
            newSalesById[String(salesKey)] = {
                salesAmounts: res.salesAmounts,
                salesAmount: res.salesAmount,
                salesAmountBase: res.salesAmountBase ?? res.salesAmount,
                salesQuantity: res.salesQuantity,
                systemCurrency: res.systemCurrency ?? "USD",
                growthPercentageUSD: res.growthPercentageUSD ?? 0,
                previousYearSalesAmounts: res.previousYearSalesAmounts ?? {},
                previousYearSalesQuantity: res.previousYearSalesQuantity ?? 0,
            };
        });

        setSalesByTargetId(newSalesById);
        setSalesMetaByTargetId(() => {
            const next = {};
            rows.forEach(({ salesKey, res }) => {
                next[String(salesKey)] = {
                    referenceScope: res.referenceScope,
                    fetchedAt: res.fetchedAt,
                    salesAmountCurrency: res.salesAmountCurrency ?? null,
                };
            });
            return next;
        });

        return newSalesById;
    }, []);

    const loadSalesForDraftTargets = useCallback(async (allClientIds, targets) => {
        const t = toArray(targets);
        if (!t.length || !allClientIds?.length || !authAxios) return {};

        const targetEntries = t
            .filter((target) => hasValidTargetDates(target))
            .map((target) => {
                const targetId = target?.targetId ?? target?.TargetID ?? target?.targetID;
                const salesKey = resolveTargetSalesKey(target);
                const entry = {
                    fromDate: moment(target.fromDate).format("YYYY-MM-DD"),
                    toDate: moment(target.toDate).format("YYYY-MM-DD"),
                    localKey: salesKey,
                };
                if (targetId != null && targetId !== "") {
                    entry.targetId = Number(targetId);
                }
                return entry;
            });

        setLoadingSales(true);
        try {
            const mapped = await postSalesBatchPreview(authAxios, allClientIds, targetEntries);
            const rows = Object.entries(mapped).map(([key, res]) => ({ salesKey: key, res }));
            return applySalesRows(rows);
        } finally {
            setLoadingSales(false);
        }
    }, [applySalesRows, authAxios]);

    const loadSalesForAllTargets = useCallback(async (allClientIds, targets) => {
        const t = toArray(targets);
        if (!t.length || !allClientIds?.length || !authAxios) return {};

        const targetIds = t
            .map((target) => target?.targetId ?? target?.TargetID ?? target?.targetID)
            .filter(Boolean);

        if (!targetIds.length) return {};

        setLoadingSales(true);
        try {
            const { data } = await authAxios.post(`${getApiBase()}/CVRComputation/sales-batch`, {
                clientIds: allClientIds,
                targetIds: targetIds,
            });

            const rows = targetIds
                .map((targetId) => {
                    const entry = data?.[String(targetId)] ?? data?.[targetId];
                    if (!entry) return null;
                    return { salesKey: String(targetId), res: mapBatchSalesEntry(targetId, entry) };
                })
                .filter(Boolean);

            return applySalesRows(rows);
        } finally {
            setLoadingSales(false);
        }
    }, [applySalesRows, authAxios]);

    const runPreview = useCallback(async (resolved, {
        useDraftDates = false,
        yearOffset = 0,
        asOf = null,
    } = {}) => {
        const previewResolved = yearOffset
            ? shiftResolvedForSimulation(resolved, yearOffset)
            : resolved;
        const targets = previewResolved?.targets ?? [];
        const allClientIds = previewResolved?.allClientIds ?? [];
        const contractCurrency = previewResolved?.contractCurrency ?? null;

        if (!targets.length || !allClientIds.length) {
            setPreviewResults(null);
            setSalesByTargetId({});
            setSalesMetaByTargetId({});
            setTotalSalesAmountBase(0);
            setActiveContractCurrency(contractCurrency);
            return null;
        }

        const { fromDate, toDate } = resolveDateRange(previewResolved?.contract, targets);

        const loadSales = useDraftDates
            ? loadSalesForDraftTargets(allClientIds, targets)
            : loadSalesForAllTargets(allClientIds, targets);

        const [newSalesById, base] = await Promise.all([
            loadSales,
            fetchTotalSales(allClientIds, fromDate, toDate, contractCurrency),
        ]);

        const simulationAsOf = resolveSimulationAsOf(previewResolved, targets, yearOffset);
        const evalAsOf = simulationAsOf ?? (asOf ? moment(asOf) : moment());
        const results = evaluatePlan(targets, newSalesById, {
            asOf: evalAsOf,
            contractCurrency,
        });
        setPreviewResults(results);
        setTotalSalesAmountBase(base);
        setActiveContractCurrency(contractCurrency);
        return results;
    }, [fetchTotalSales, loadSalesForAllTargets, loadSalesForDraftTargets]);

    const resetPreview = useCallback(() => {
        setSalesByTargetId({});
        setSalesMetaByTargetId({});
        setPreviewResults(null);
        setTotalSalesAmountBase(0);
        setActiveContractCurrency(null);
        setLoadingSales(false);
    }, []);

    const grandTotalInContractCurrency = useMemo(() => {
        const contractCurrency = activeContractCurrency ?? "USD";
        let total = 0;
        const rows = previewResults?.targetResults ?? [];
        rows.forEach((r) => {
            if (r.state !== TARGET_STATE.ACHIEVED) return;
            if (r.rebateAmounts && typeof r.rebateAmounts === "object") {
                total += Number(r.rebateAmounts[contractCurrency] ?? 0);
                return;
            }
            const curOpt = r.rebateCurrency ?? null;
            const cur = curOpt?.value ?? curOpt?.label ?? curOpt ?? contractCurrency;
            if (cur === contractCurrency) {
                total += Number(r.rebateAmount ?? 0);
            }
        });
        return total;
    }, [previewResults?.targetResults, activeContractCurrency]);

    const currencySubtotals = useMemo(() => {
        const contractCurrency = activeContractCurrency ?? "USD";
        const out = {};
        const rows = previewResults?.targetResults ?? [];
        rows.forEach((r) => {
            if (r.state !== TARGET_STATE.ACHIEVED) return;
            if (r.rebateAmounts && typeof r.rebateAmounts === "object") {
                const amt = r.rebateAmounts[contractCurrency];
                if (amt != null) out[contractCurrency] = (out[contractCurrency] ?? 0) + amt;
                return;
            }
            const curOpt = r.rebateCurrency ?? null;
            const key = curOpt?.value ?? curOpt?.label ?? curOpt ?? contractCurrency;
            if (key === contractCurrency) {
                out[contractCurrency] = (out[contractCurrency] ?? 0) + (r.rebateAmount ?? 0);
            }
        });
        return out;
    }, [previewResults?.targetResults, activeContractCurrency]);

    const feeTotals = useMemo(() => {
        return {};
    }, []);

    const computeFeeTotals = useCallback((fees = [], contractCurrency = null) => {
        const out = {};
        const cur = contractCurrency ?? "USD";
        fees.forEach((fee) => {
            const { computed, currency } = formatFeeAmount(fee);
            const key = currency ?? cur;
            if (key === cur) out[cur] = (out[cur] ?? 0) + computed;
        });
        return out;
    }, []);

    const fetchSalesForDraftWindows = useCallback(async (target, allClientIds, monthEndWindows = []) => {
        if (!target || !allClientIds?.length || !authAxios || !monthEndWindows.length) return {};

        const salesKey = resolveTargetSalesKey(target);
        const targetId = target?.targetId ?? target?.TargetID ?? target?.targetID;
        const fromDate = moment(target.fromDate ?? target.FromDate).format("YYYY-MM-DD");

        const targetEntries = monthEndWindows.map((window) => {
            const toDate = moment(window.toDate);
            const entry = {
                fromDate,
                toDate: toDate.format("YYYY-MM-DD"),
                localKey: `${salesKey}:${window.key}`,
            };
            if (targetId != null && targetId !== "") {
                entry.targetId = Number(targetId);
            }
            return entry;
        });

        return postSalesBatchPreview(authAxios, allClientIds, targetEntries);
    }, [authAxios]);

    const grandTotalUSD = grandTotalInContractCurrency;

    return {
        salesByTargetId,
        salesMetaByTargetId,
        previewResults,
        totalSalesAmountBase,
        loadingSales,
        runPreview,
        resetPreview,
        loadSalesForAllTargets,
        fetchTotalSales,
        fetchSalesForDraftWindows,
        grandTotalUSD,
        grandTotalInContractCurrency,
        activeContractCurrency,
        currencySubtotals,
        feeTotals,
        computeFeeTotals,
    };
}
