/**
 * Maps a workspace API reference DTO into the shape used by the selected-reference grid.
 */
export function mapLoadedReferenceRow(r, idKey) {
    const isStock = r.referenceType === "StockItem";
    const stkRecId = r.sTKRecId ?? r.stKRecId ?? r.stkRecId;
    const itemTypeRecId = r.itemTypeRecId;
    const stkRef = r.stkRef ?? (isStock ? r.refCode : null);
    const stkDesc = r.stkDesc ?? (isStock ? r.refDesc : null);
    const itCode = r.itCode ?? (!isStock ? r.refCode : null);
    const itDesc = r.itDesc ?? (!isStock ? r.refDesc : null);
    const refCode = isStock ? stkRef : itCode;
    const refDesc = isStock ? stkDesc : itDesc;
    const base = {
        [idKey]: r[idKey],
        referenceType: r.referenceType,
        stkRecId: isStock ? stkRecId : null,
        itemTypeRecId: isStock ? null : itemTypeRecId,
        label: (refCode && refDesc)
            ? `${refCode} - ${refDesc}`
            : isStock
                ? `Stock #${stkRecId}`
                : `Group #${itemTypeRecId}`,
    };
    if (isStock) {
        return {
            ...base,
            stkRef,
            stkDesc,
            dbarBarcode: r.dbarBarcode ?? r.dBarBarcode ?? "",
            stkUnit: r.stkUnit ?? r.sTKUnit ?? "",
        };
    }
    return {
        ...base,
        itCode,
        itDesc,
        grpCode: r.grpCode ?? r.gRPCode ?? "",
        grpDesc: r.grpDesc ?? r.gRPDesc ?? "",
    };
}
