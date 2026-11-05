let _idSeq = 0;
export const newLocalId = (prefix = "id") => `${prefix}_${++_idSeq}_${Date.now()}`;

/** Flat TCD rows → visual groups for the builder UI. */
export function flatConditionsToGroups(flatRows = []) {
    if (!flatRows?.length) return [];

    const byGroup = new Map();
    for (const row of flatRows) {
        const gn = Number(row.logicalGroup) || 1;
        if (!byGroup.has(gn)) byGroup.set(gn, []);
        byGroup.get(gn).push(row);
    }

    const groupNums = [...byGroup.keys()].sort((a, b) => a - b);
    return groupNums.map((gn, idx) => {
        const rows = byGroup.get(gn);
        const first = rows[0];
        return {
            id: newLocalId("g"),
            joinWithPrevious: idx === 0 ? null : (first.logicalOperator || "OR"),
            conditions: rows.map((r) => ({
                id: newLocalId("c"),
                dbId: r.targetConditionID ?? r.targetConditionId ?? null,
                conditionType: r.conditionType ?? null,
                operator: r.operator ?? null,
                value: r.value ?? "",
                salesAmountCurrency: r.salesAmountCurrency ?? null,
            })),
        };
    });
}

/** Visual groups → flat rows for API payload. */
export function conditionGroupsToFlat(groups = []) {
    const flat = [];
    let groupNum = 0;

    for (const group of groups) {
        const conditions = (group.conditions || []).filter(
            (c) => c.conditionType && c.operator && c.value !== "" && c.value != null
        );
        if (!conditions.length) continue;

        groupNum += 1;
        conditions.forEach((c, idx) => {
            const row = {
                targetConditionID: c.dbId ?? null,
                conditionType: c.conditionType,
                operator: c.operator,
                value: c.value !== "" && c.value != null ? Number(c.value) : null,
                logicalGroup: groupNum,
                logicalOperator:
                    idx === 0
                        ? groupNum === 1
                            ? null
                            : (group.joinWithPrevious || "OR")
                        : "AND",
            };
            if (c.conditionType === "S" && c.salesAmountCurrency) {
                row.salesAmountCurrency =
                    typeof c.salesAmountCurrency === "object"
                        ? c.salesAmountCurrency.value
                        : c.salesAmountCurrency;
            }
            flat.push(row);
        });
    }

    return flat;
}

/** UI model only; logicalOperator is assigned in conditionGroupsToFlat at serialize time. */
export function createEmptyCondition() {
    return {
        id: newLocalId("c"),
        dbId: null,
        conditionType: null,
        operator: null,
        value: "",
        salesAmountCurrency: null,
    };
}

/** Range/tier row in DB: logicalOperator R (legacy T accepted on read). */
export function isRangeCondition(row) {
    const op = (row?.logicalOperator ?? "").toString().trim().toUpperCase();
    return op === "R" || op === "T";
}

/** Serialize range tiers to flat target conditions for API payload. */
export function tiersToFlatConditions(target) {
    const type = target.tierConditionType;
    const salesCurrency =
        type === "S" && target.salesAmountCurrency
            ? (typeof target.salesAmountCurrency === "object"
                ? target.salesAmountCurrency.value
                : target.salesAmountCurrency)
            : null;

    return (target.tiers || [])
        .filter((tier) => tier.value !== "" && tier.value != null)
        .map((tier) => {
            const rebateType =
                typeof tier.rebateValueType === "object"
                    ? tier.rebateValueType?.value
                    : tier.rebateValueType;
            const row = {
                targetConditionID: tier.dbId ?? null,
                conditionType: type,
                operator: "=",
                value: tier.value !== "" && tier.value != null ? Number(tier.value) : null,
                logicalOperator: "R",
                logicalGroup: 1,
                type: rebateType ?? "F",
                currency:
                    rebateType === "P"
                        ? null
                        : (typeof tier.currency === "object"
                            ? tier.currency?.value
                            : tier.currency) || null,
                rebateAmount: tier.rebateValue !== "" && tier.rebateValue != null ? Number(tier.rebateValue) : null,
            };
            if (salesCurrency) row.salesAmountCurrency = salesCurrency;
            return row;
        });
}

export function createEmptyGroup() {
    return {
        id: newLocalId("g"),
        joinWithPrevious: "OR",
        conditions: [createEmptyCondition()],
    };
}

export const NEW_GROUP_DROPPABLE_ID = "new-group";

export const groupDroppableId = (groupId) => `group-${groupId}`;

export const conditionDraggableId = (condId) => `cond-${condId}`;

const parseGroupIdFromDroppable = (droppableId) => {
    if (droppableId === NEW_GROUP_DROPPABLE_ID) return null;
    if (droppableId?.startsWith("group-")) return droppableId.slice(6);
    return droppableId;
};

const cloneGroups = (groups) =>
    groups.map((g) => ({
        ...g,
        conditions: [...(g.conditions || [])],
    }));

/** Apply react-beautiful-dnd drag result to condition groups (UI only). */
export function moveCondition(groups = [], source, destination) {
    if (!destination) return groups;
    if (
        source.droppableId === destination.droppableId &&
        source.index === destination.index
    ) {
        return groups;
    }

    const next = cloneGroups(groups);
    const srcGroupId = parseGroupIdFromDroppable(source.droppableId);
    const srcGroup = next.find((g) => g.id === srcGroupId);
    if (!srcGroup) return groups;

    const [moved] = srcGroup.conditions.splice(source.index, 1);
    if (!moved) return groups;

    const destIsNew = destination.droppableId === NEW_GROUP_DROPPABLE_ID;
    let destGroup;

    if (destIsNew) {
        destGroup = {
            id: newLocalId("g"),
            joinWithPrevious: next.length > 0 ? "OR" : null,
            conditions: [],
        };
        next.push(destGroup);
    } else {
        const destGroupId = parseGroupIdFromDroppable(destination.droppableId);
        destGroup = next.find((g) => g.id === destGroupId);
        if (!destGroup) {
            srcGroup.conditions.splice(source.index, 0, moved);
            return groups;
        }
    }

    destGroup.conditions.splice(destination.index, 0, moved);

    const cleaned = next.filter((g) => (g.conditions || []).length > 0);
    const totalConds = cleaned.reduce((n, g) => n + g.conditions.length, 0);
    if (totalConds === 0) return [];
    return cleaned;
}

export function createEmptyTier() {
    return {
        localId: newLocalId("tier"),
        dbId: null,
        operator: "=",
        value: "",
        rebateValueType: "F",
        currency: null,
        rebateValue: "",
    };
}

const DEFAULT_TARGET_NAME_PATTERN = /^Target \d+$/;

function isUnsetSelect(sel) {
    if (sel == null || sel === "") return true;
    if (typeof sel === "object" && "value" in sel) return sel.value == null || sel.value === "";
    return false;
}

/** True only when every field still matches the untouched createEmptyTarget placeholder. */
export function isEmptyTarget(target) {
    if (!target) return false;

    const name = String(target.targetName ?? "").trim();
    const isDefaultName = name === "" || DEFAULT_TARGET_NAME_PATTERN.test(name);

    return (
        isDefaultName
        && !target.targetId
        && !target.fromDate
        && !target.toDate
        && isUnsetSelect(target.computationTypeId)
        && isUnsetSelect(target.settlementTypeId)
        && (target.rebateValue === "" || target.rebateValue == null)
        && (target.targetType || "formula") === "formula"
        && !(target.conditionGroups?.length)
        && !(target.references?.length)
        && !(target.tiers?.length)
        && !target.rangeOverride
    );
}

export function createEmptyTarget(index = 1) {
    return {
        targetId: null,
        localId: newLocalId("t"),
        targetName: `Target ${index}`,
        fromDate: null,
        toDate: null,
        rebateValue: "",
        rebateValueType: "F",
        currency: null,
        conditionGroups: [],
        references: [],
        referenceType: null,
        targetType: "formula",
        computationTypeId: null,
        settlementTypeId: null,
        salesAmountCurrency: null,
        tierConditionType: null,
        tiers: [],
        rangeOverride: false,
    };
}
