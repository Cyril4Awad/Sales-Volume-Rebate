import { useCallback, useRef, useState, useMemo, useEffect } from "react";
import { getApiBase } from "../../../../globals";
import { mergeTargetReferencesFromPicker } from "../../../../utils/mergeTargetReferencesFromPicker";
import { buildProductGroupColumns, buildStockItemColumns } from "../../../../utils/referenceTableColumns";
import { AdvancedTable, ModalComp } from "../../../../ReusableComponents";
import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "../../../../utils/mobileTableCells";
import { REF_PICKER_PAGE_SIZE, PICKER_SEARCH_DEBOUNCE_MS } from "../../constants/planWorkspaceConstants";
import { getProp } from "../../../../utils/planWorkspaceMappers";

const normalizePagedLookupResponse = (data) => {
    if (Array.isArray(data)) return { items: data, totalCount: data.length };
    return { items: data?.items ?? [], totalCount: Number(data?.totalCount) || 0 };
};

const seedPickerMapFromReferences = (refs, refType) => {
    const m = new Map();
    refs.filter((r) => r.referenceType === refType).forEach((r) => {
        const id = Number(refType === "StockItem" ? r.stkRecId : r.itemTypeRecId);
        if (!id) return;
        if (refType === "StockItem") {
            m.set(id, {
                STK_RECID: id,
                STK_REF: r.stkRef,
                STK_DESC: r.stkDesc,
                DBAR_BARCODE: r.dbarBarcode,
                STK_UNIT: r.stkUnit,
            });
        } else {
            m.set(id, {
                IT_RECID: id,
                IT_CODE: r.itCode,
                IT_DESC: r.itDesc,
                GRP_CODE: r.grpCode,
                GRP_DESC: r.grpDesc,
            });
        }
    });
    return m;
};

export default function TargetReferencesSection({
    target,
    onChange,
    selectMenuProps,
    authAxios,
    onNotify,
    readOnly = false,
}) {
    const [typePickerOpen, setTypePickerOpen] = useState(false);
    const [refModal, setRefModal] = useState({ open: false, refType: null, loading: false, data: [], pendingSelected: [] });
    const [refPickerPage, setRefPickerPage] = useState(1);
    const [refPickerTotal, setRefPickerTotal] = useState(0);
    const refPickerPagingRef = useRef({ page: 1, search: "" });
    const refPickerDebounceTimer = useRef(null);
    const refPickerSelectionMapRef = useRef(new Map());
    const [refPickerSelectionVersion, setRefPickerSelectionVersion] = useState(0);
    const [addAllLoading, setAddAllLoading] = useState(false);
    const [productGroupPage, setProductGroupPage] = useState(1);
    const [stockItemPage, setStockItemPage] = useState(1);

    const referencesRef = useRef(target.references);
    referencesRef.current = target.references;
    const targetRef = useRef(target);
    targetRef.current = target;

    const initializedRef = useRef(new Set());
    useEffect(() => {
        if (!target?.localId) return;
        if (initializedRef.current.has(target.localId)) return;
        initializedRef.current.add(target.localId);
    }, [target?.localId]);

    const productGroupRefs = useMemo(
        () => (target.references || []).filter((r) => r.referenceType === "ProductGroup"),
        [target.references]
    );
    const stockItemRefs = useMemo(
        () => (target.references || []).filter((r) => r.referenceType === "StockItem"),
        [target.references]
    );

    useEffect(() => {
        setProductGroupPage(1);
    }, [productGroupRefs.length]);
    useEffect(() => {
        setStockItemPage(1);
    }, [stockItemRefs.length]);

    const productGroupPaginate = productGroupRefs.length > 50;
    const stockItemPaginate = stockItemRefs.length > 50;
    const productGroupPageSize = productGroupPaginate ? 50 : (productGroupRefs.length || 1);
    const stockItemPageSize = stockItemPaginate ? 50 : (stockItemRefs.length || 1);

    const productGroupPageData = useMemo(() => {
        if (!productGroupPaginate) return productGroupRefs;
        const start = (productGroupPage - 1) * 50;
        return productGroupRefs.slice(start, start + 50);
    }, [productGroupRefs, productGroupPage, productGroupPaginate]);

    const stockItemPageData = useMemo(() => {
        if (!stockItemPaginate) return stockItemRefs;
        const start = (stockItemPage - 1) * 50;
        return stockItemRefs.slice(start, start + 50);
    }, [stockItemRefs, stockItemPage, stockItemPaginate]);

    const handleProductGroupPaging = useCallback((_s, _f, _x, counter) => {
        setProductGroupPage((p) => {
            if (!counter) return 1;
            const maxPage = Math.max(1, Math.ceil(productGroupRefs.length / 50));
            return Math.min(maxPage, Math.max(1, p + counter));
        });
    }, [productGroupRefs.length]);

    const handleStockItemPaging = useCallback((_s, _f, _x, counter) => {
        setStockItemPage((p) => {
            if (!counter) return 1;
            const maxPage = Math.max(1, Math.ceil(stockItemRefs.length / 50));
            return Math.min(maxPage, Math.max(1, p + counter));
        });
    }, [stockItemRefs.length]);

    const loadRefPickerPage = useCallback(async (page, search, refType, take = REF_PICKER_PAGE_SIZE) => {
        if (!refType) return { items: [], totalCount: 0 };
        setRefModal((prev) => ({ ...prev, loading: true }));
        try {
            const skip = (page - 1) * take;
            const endpoint = refType === "StockItem"
                ? `${getApiBase()}/CVRLookups/stock-items`
                : `${getApiBase()}/CVRLookups/product-groups`;
            const q = new URLSearchParams({ skip: String(skip), take: String(take) });
            if (search) q.set("search", search);
            const res = await authAxios.get(`${endpoint}?${q}`);
            const data = res.data;
            const { items, totalCount } = normalizePagedLookupResponse(data);
            setRefModal((prev) => ({ ...prev, loading: false, data: items }));
            setRefPickerTotal(totalCount);
            setRefPickerPage(page);
            refPickerPagingRef.current = { page, search };
            return { items, totalCount };
        } catch (err) {
            console.error('loadRefPickerPage error', err);
            setRefModal((prev) => ({ ...prev, open: false, loading: false }));
            onNotify?.("error", "Failed to load lookup data");
            return { items: [], totalCount: 0 };
        }
    }, [authAxios, onNotify]);

    const openRefModal = useCallback(async (refType) => {
        setTypePickerOpen(false);
        const alreadySelected = (target.references || [])
            .filter((r) => r.referenceType === refType)
            .map((r) => Number(refType === "StockItem" ? r.stkRecId : r.itemTypeRecId))
            .filter(Boolean);

        refPickerSelectionMapRef.current = seedPickerMapFromReferences(target.references || [], refType);
        setRefPickerSelectionVersion((v) => v + 1);
        refPickerPagingRef.current = { page: 1, search: "" };
        setRefModal({ open: true, refType, loading: true, data: [], pendingSelected: alreadySelected });
        await loadRefPickerPage(1, "", refType);
    }, [target.references, loadRefPickerPage]);

    const uncheckAll = useCallback(() => {
        const m = refPickerSelectionMapRef.current;
        const idKey = refModal.refType === "StockItem" ? "STK_RECID" : "IT_RECID";
        const pageIds = new Set(
            refModal.data
                .map((row) => Number(getProp(row, idKey)))
                .filter(Boolean)
        );
        pageIds.forEach((id) => m.delete(id));
        setRefModal((prev) => ({
            ...prev,
            pendingSelected: prev.pendingSelected.filter((id) => !pageIds.has(id)),
        }));
        setRefPickerSelectionVersion((v) => v + 1);
    }, [refModal.refType, refModal.data]);

    const toggleModalRow = useCallback((id, row) => {
        setRefModal((prev) => ({
            ...prev,
            pendingSelected: prev.pendingSelected.includes(id)
                ? prev.pendingSelected.filter((x) => x !== id)
                : [...prev.pendingSelected, id],
        }));
        const m = refPickerSelectionMapRef.current;
        if (m.has(id)) m.delete(id);
        else if (row) m.set(id, row);
        setRefPickerSelectionVersion((v) => v + 1);
    }, []);

    const sortAndMergeReferences = (mergedOfType, otherRefs) => {
        const newItems = mergedOfType.filter((r) => r.targetReferenceId == null);
        const existingItems = mergedOfType.filter((r) => r.targetReferenceId != null);
        const sorted = [...newItems, ...existingItems];
        const productGroups = [
            ...sorted.filter((r) => r.referenceType === "ProductGroup"),
            ...otherRefs.filter((r) => r.referenceType === "ProductGroup"),
        ];
        const stockItems = [
            ...sorted.filter((r) => r.referenceType === "StockItem"),
            ...otherRefs.filter((r) => r.referenceType === "StockItem"),
        ];
        return [...productGroups, ...stockItems];
    };

    const confirmModalSelection = () => {
        const refType = refModal.refType;
        if (!refType) return;
        const existingOfType = (target.references || []).filter((r) => r.referenceType === refType);
        const newRefs = mergeTargetReferencesFromPicker({
            refType,
            pendingSelectedIds: refModal.pendingSelected,
            lookupRows: [...refPickerSelectionMapRef.current.values()],
            existingOfType,
            getProp,
        });
        const otherRefs = (target.references || []).filter((r) => r.referenceType !== refType);
        onChange({
            ...target,
            references: sortAndMergeReferences(newRefs, otherRefs),
        });
        refPickerSelectionMapRef.current = new Map();
        setRefModal((prev) => ({ ...prev, open: false }));
    };

    const removeReferenceRow = useCallback((ref) => {
        const t = targetRef.current;
        onChange({
            ...t,
            references: (referencesRef.current || []).filter((r) => {
                if (ref.targetReferenceId != null && r.targetReferenceId != null) {
                    return r.targetReferenceId !== ref.targetReferenceId;
                }
                if (r.referenceType !== ref.referenceType) return true;
                return ref.referenceType === "StockItem"
                    ? Number(r.stkRecId) !== Number(ref.stkRecId)
                    : Number(r.itemTypeRecId) !== Number(ref.itemTypeRecId);
            }),
        });
    }, [onChange]);

    const removeAllOfType = useCallback((refType) => {
        const t = targetRef.current;
        onChange({
            ...t,
            references: (referencesRef.current || []).filter((r) => r.referenceType !== refType),
        });
    }, [onChange]);

    const handleRefPickerTriggerPaging = useCallback((searchValue, _f, _s, counter) => {
        const refType = refModal.refType;
        if (!refType) return;
        if (refPickerDebounceTimer.current) clearTimeout(refPickerDebounceTimer.current);
        refPickerDebounceTimer.current = setTimeout(() => {
            const s = String(searchValue ?? "").trim();
            const prev = refPickerPagingRef.current;
            let page = s !== prev.search ? 1 : counter ? Math.max(1, prev.page + counter) : 1;
            void loadRefPickerPage(page, s, refType);
        }, PICKER_SEARCH_DEBOUNCE_MS);
    }, [refModal.refType, loadRefPickerPage]);

    const handleAddAllInModal = useCallback(async () => {
        const refType = refModal.refType;
        if (!refType) return;
        setAddAllLoading(true);
        try {
            const take = 200;
            let skip = 0;
            let totalCount = Infinity;
            const allRows = [];
            const currentSearch = refPickerPagingRef.current.search ?? "";
    
            while (skip < totalCount) {
                const endpoint = refType === "StockItem"
                    ? `${getApiBase()}/CVRLookups/stock-items`
                    : `${getApiBase()}/CVRLookups/product-groups`;
                const q = new URLSearchParams({ skip: String(skip), take: String(take) });
                if (currentSearch) q.set("search", currentSearch);
                const res = await authAxios.get(`${endpoint}?${q}`);
                const normalized = normalizePagedLookupResponse(res.data);
                totalCount = normalized.totalCount;
                allRows.push(...normalized.items);
                skip += take;
                if (!normalized.items.length) break;
            }
    
            const currentIdKey = refType === "StockItem" ? "STK_RECID" : "IT_RECID";
            const existingOfType = (target.references || []).filter((r) => r.referenceType === refType);
            
            // ← seed with existing IDs so they're preserved
            const existingIds = existingOfType
                .map((r) => Number(refType === "StockItem" ? r.stkRecId : r.itemTypeRecId))
                .filter(Boolean);
    
            const newIds = allRows.map((row) => Number(getProp(row, currentIdKey))).filter(Boolean);
            
            // merge existing + new
            const pendingSelectedIds = [...new Set([...existingIds, ...newIds])];
            
            const lookupMap = new Map();
            allRows.forEach((row) => {
                const id = Number(getProp(row, currentIdKey));
                if (id) lookupMap.set(id, row);
            });
    
            const newRefs = mergeTargetReferencesFromPicker({
                refType,
                pendingSelectedIds,
                lookupRows: [...lookupMap.values()],
                existingOfType,
                getProp,
            });
    
            const otherRefs = (target.references || []).filter((r) => r.referenceType !== refType);
            onChange({
                ...target,
                references: sortAndMergeReferences(newRefs, otherRefs),
            });
            setRefModal((prev) => ({ ...prev, open: false }));
        } catch {
            onNotify?.("error", "Failed to load all items");
        } finally {
            setAddAllLoading(false);
        }
    }, [authAxios, refModal.refType, target, onChange, onNotify]);

    const checkAllOnPage = useCallback(() => {
        const m = refPickerSelectionMapRef.current;
        const idKey = refModal.refType === "StockItem" ? "STK_RECID" : "IT_RECID";
        setRefModal((prev) => {
            const pageIds = [];
            prev.data.forEach((row) => {
                const id = Number(getProp(row, idKey));
                if (!id) return;
                pageIds.push(id);
                m.set(id, row);
            });
            return {
                ...prev,
                pendingSelected: [...new Set([...prev.pendingSelected, ...pageIds])],
            };
        });
        setRefPickerSelectionVersion((v) => v + 1);
    }, [refModal.refType]);

    const productGroupColumns = useMemo(
        () => buildProductGroupColumns({ onRemove: removeReferenceRow }),
        [removeReferenceRow]
    );
    const stockItemColumns = useMemo(
        () => buildStockItemColumns({ onRemove: removeReferenceRow }),
        [removeReferenceRow]
    );

    const refType = refModal.refType;
    const idKey = refType === "StockItem" ? "STK_RECID" : "IT_RECID";

    const pickerColumns = useMemo(() => {
        if (!refType) return [];
        const checkboxCol = {
            Header: "",
            accessor: "select",
            width: 40,
            Cell: (row) => {
                const id = Number(getProp(row.original, idKey));
                const checked = refModal.pendingSelected.includes(id);
                return mobileActionRow(
                    <div className="d-flex justify-content-center">
                        <input
                            type="checkbox"
                            className="form-check-input m-0"
                            checked={checked}
                            onChange={() => toggleModalRow(id, row.original)}
                            aria-label="Select row"
                        />
                    </div>
                );
            },
        };
        const labeledPickerCol = (header, accessor, opts = {}) => ({
            Header: header,
            accessor,
            ...opts,
            Cell: (r) => {
                const val = getProp(r.original, accessor) ?? "";
                return mobileDualCell(val, mobileLabeledRow(header, val));
            },
        });
        if (refType === "StockItem") {
            return [
                checkboxCol,
                labeledPickerCol("Ref", "STK_REF", { minWidth: 100 }),
                labeledPickerCol("Description", "STK_DESC", { minWidth: 180 }),
                labeledPickerCol("Barcode", "DBAR_BARCODE", { width: 130 }),
                labeledPickerCol("Unit", "STK_UNIT", { width: 72, style: { textAlign: "center" } }),
            ];
        }
        return [
            checkboxCol,
            labeledPickerCol("Product Group Code", "GRP_CODE", { width: 110, style: { textAlign: "center" } }),
            labeledPickerCol("Product Group Desc", "GRP_DESC", { minWidth: 160 }),
            labeledPickerCol("Dept. Code", "IT_CODE", { width: 100, style: { textAlign: "center" } }),
            labeledPickerCol("Dept. Desc", "IT_DESC", { minWidth: 160 }),
        ];
    }, [refType, refModal.pendingSelected, toggleModalRow, refPickerSelectionVersion, idKey]);

    return (
        <div className="mt-3">
            <small className="text-muted fw-semibold d-block mb-2">References</small>

            <div className="d-flex align-items-center gap-3 mb-3 flex-wrap">
                <span
                    className="hyperlink-text"
                    style={{ fontSize: 13 }}
                    onClick={() => setTypePickerOpen(true)}
                >
                    + Add reference
                </span>
                <span
                    className="hyperlink-text text-danger"
                    style={{ fontSize: 13 }}
                    onClick={() => removeAllOfType("StockItem")}
                >
                    Remove All Stock Items
                </span>
                <span
                    className="hyperlink-text text-danger"
                    style={{ fontSize: 13 }}
                    onClick={() => removeAllOfType("ProductGroup")}
                >
                    Remove All Product Groups
                </span>
            </div>

            <div className="mb-3">
                <small className="text-muted fw-semibold d-block mb-1">Product Groups</small>
                {productGroupRefs.length > 0 ? (
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={productGroupColumns}
                            dataArray={productGroupPageData}
                            enableSearch
                            minRows={0}
                            showPagination={productGroupPaginate}
                            triggerPaging={productGroupPaginate ? handleProductGroupPaging : undefined}
                            isFilterOptionOneRow
                            recordCount={productGroupRefs.length}
                            pageSize={productGroupPageSize}
                            currentPage={productGroupPaginate ? productGroupPage : 1}
                            maxHeight="300px"
                        />
                        <div className="numberOfRows hidden-mobile">
                            <b>{productGroupRefs.length}</b> row(s)
                        </div>
                    </div>
                ) : (
                    <div className="text-muted small py-2 ps-1">No product groups added</div>
                )}
            </div>

            <div className="mb-3">
                <small className="text-muted fw-semibold d-block mb-1">Stock Items</small>
                {stockItemRefs.length > 0 ? (
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={stockItemColumns}
                            dataArray={stockItemPageData}
                            enableSearch
                            minRows={0}
                            showPagination={stockItemPaginate}
                            triggerPaging={stockItemPaginate ? handleStockItemPaging : undefined}
                            isFilterOptionOneRow
                            recordCount={stockItemRefs.length}
                            pageSize={stockItemPageSize}
                            currentPage={stockItemPaginate ? stockItemPage : 1}
                            maxHeight="300px"
                        />
                        <div className="numberOfRows hidden-mobile">
                            <b>{stockItemRefs.length}</b> row(s)
                        </div>
                    </div>
                ) : (
                    <div className="text-muted small py-2 ps-1">No stock items added</div>
                )}
            </div>

            <ModalComp
                modal={typePickerOpen}
                modalTitle="Choose the type of reference to add:"
                modalBody={(
                    <div className="d-flex gap-3 py-2">
                        <button
                            type="button"
                            className="btn btn-success flex-grow-1"
                            onClick={() => openRefModal("ProductGroup")}
                        >
                            Product Group
                        </button>
                        <button
                            type="button"
                            className="btn btn-primary flex-grow-1"
                            onClick={() => openRefModal("StockItem")}
                        >
                            Stock Item
                        </button>
                    </div>
                )}
                onClose={() => setTypePickerOpen(false)}
                onCloseText="Cancel"
                size="md"
            />

            <ModalComp
                modal={refModal.open}
                modalTitle={`Select ${refType === "StockItem" ? "Stock Items" : "Product Groups"}`}
                modalBody={(
                    <>
                        <div className="d-flex gap-3 mb-2 align-items-center">
                            <span className="hyperlink-text" style={{ fontSize: 12 }} onClick={checkAllOnPage}>
                                Check All
                            </span>
                            <span className="hyperlink-text" style={{ fontSize: 12 }} onClick={uncheckAll}>
                                Uncheck All
                            </span>
                            <span
                                className="hyperlink-text"
                                style={{ fontSize: 12, marginLeft: "auto", opacity: addAllLoading ? 0.6 : 1 }}
                                onClick={addAllLoading ? undefined : handleAddAllInModal}
                            >
                                {addAllLoading ? "Loading…" : `${refType === "StockItem" ? "Add All Items" : "Add All Product Groups"}`}
                            </span>
                        </div>
                        <div className="mb-2">
                            <span>
                                {refModal.pendingSelected.length} item
                                {refModal.pendingSelected.length !== 1 ? "s" : ""} selected
                            </span>
                        </div>
                        <div className="adv-mobile-table">
                            <AdvancedTable
                                columns={pickerColumns}
                                dataArray={refModal.data}
                                enableSearch
                                triggerPaging={handleRefPickerTriggerPaging}
                                recordCount={refPickerTotal}
                                pageSize={REF_PICKER_PAGE_SIZE}
                                currentPage={refPickerPage}
                                showPagination
                                minRows={0}
                                isFilterOptionOneRow
                                maxHeight="420px"
                            />
                        </div>
                    </>
                )}
                onClose={() => setRefModal((p) => ({ ...p, open: false }))}
                onAccept={confirmModalSelection}
                onAcceptText="Apply"
                onCloseText="Cancel"
                size="xl"
                className="importDataModal"
            />
        </div>
    );
}