/**

 * Builds target reference rows from the picker selection, reusing DB ids from

 * existing rows that match the same reference type + stock/group key.

 */



function stockDisplayFields(item, prior, getProp) {

    return {

        stkRef: getProp(item, "STK_REF") ?? prior?.stkRef,

        stkDesc: getProp(item, "STK_DESC") ?? prior?.stkDesc,

        dbarBarcode: getProp(item, "DBAR_BARCODE") ?? prior?.dbarBarcode,

        stkUnit: getProp(item, "STK_UNIT") ?? prior?.stkUnit,

        itCode: undefined,

        itDesc: undefined,

        grpCode: undefined,

        grpDesc: undefined,

    };

}



function groupDisplayFields(item, prior, getProp) {

    return {

        stkRef: undefined,

        stkDesc: undefined,

        dbarBarcode: undefined,

        stkUnit: undefined,

        itCode: getProp(item, "IT_CODE") ?? prior?.itCode,

        itDesc: getProp(item, "IT_DESC") ?? prior?.itDesc,

        grpCode: getProp(item, "GRP_CODE") ?? prior?.grpCode,

        grpDesc: getProp(item, "GRP_DESC") ?? prior?.grpDesc,

    };

}



export function mergeTargetReferencesFromPicker({

    refType,

    pendingSelectedIds,

    lookupRows,

    existingOfType,

    getProp,

}) {

    const idKey = refType === "StockItem" ? "STK_RECID" : "IT_RECID";

    const codeKey = refType === "StockItem" ? "STK_REF" : "IT_CODE";

    const descKey = refType === "StockItem" ? "STK_DESC" : "IT_DESC";



    return pendingSelectedIds.map((id) => {

        const prior = existingOfType.find((r) =>

            refType === "StockItem"

                ? Number(r.stkRecId) === Number(id)

                : Number(r.itemTypeRecId) === Number(id)

        );

        const item = lookupRows.find((d) => Number(getProp(d, idKey)) === id);

        const displayFields =

            refType === "StockItem"

                ? stockDisplayFields(item, prior, getProp)

                : groupDisplayFields(item, prior, getProp);



        return {

            targetReferenceId: prior?.targetReferenceId ?? null,

            referenceType: refType,

            stkRecId: refType === "StockItem" ? id : null,

            itemTypeRecId: refType === "ProductGroup" ? id : null,

            label: item

                ? `${getProp(item, codeKey) || ""} - ${getProp(item, descKey) || ""}`

                : prior?.label ?? `#${id}`,

            ...displayFields,

        };

    });

}

