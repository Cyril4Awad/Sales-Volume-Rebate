import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { DragDropContext, Draggable, Droppable } from "react-beautiful-dnd";

import { InputNumericComp, SelectComp } from "../../../../ReusableComponents";
import ContractCurrencyInput from "../../components/ContractCurrencyInput/ContractCurrencyInput";

import { getApiBase } from "../../../../globals";

import { conditionTypeOptions, operatorOptions, GROWTH_COMPARISON_CAPTION } from "../../constants/planWorkspaceConstants";

import {
    formatAllGroupsBuiltLabel,
    simplifyRedundantRangeConditions,
    validateConditionGroup,
    validateCrossGroupConditions,
} from "../../utils/targetConditionValidation";

import {
    createEmptyCondition,
    createEmptyGroup,
    moveCondition,
    groupDroppableId,
    conditionDraggableId,
    NEW_GROUP_DROPPABLE_ID,
} from "../../../../utils/conditionGroups";

import { numericPropsForType, valuePlaceholderForType } from "../../utils/numericPropsForConditionType";

const findOpt = (options, value) =>
    options.find((o) => o.value === value) || null;

export default function TargetConditionsBuilder({ conditionGroups, onChange, contractCurrencyCode = "", selectMenuProps, usdRate: usdRateProp = null, readOnly = false, rebateType = "F", rebateValue = "" }) {
    const groups = conditionGroups?.length ? conditionGroups : [];
    const [simplifyNotices, setSimplifyNotices] = useState({});
    const [usdRateLocal, setUsdRateLocal] = useState(null);

    useEffect(() => {
        if (usdRateProp != null) return;
        let cancelled = false;
        axios.get(`${getApiBase()}/CVRDailyRates/current`, {
            headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
        })
            .then((res) => {
                if (cancelled) return;
                const data = res?.data?.[0] ?? res?.data;
                const rate = data?.rate;
                setUsdRateLocal(rate != null && Number.isFinite(Number(rate)) ? Number(rate) : null);
            })
            .catch(() => {
                if (!cancelled) setUsdRateLocal(null);
            });
        return () => { cancelled = true; };
    }, [usdRateProp]);

    const usdRate = usdRateProp ?? usdRateLocal;

    const groupValidation = useMemo(
        () => groups.map((g, idx) => validateConditionGroup(g, idx, usdRate)),
        [groups, usdRate]
    );

    const crossGroupErrors = useMemo(
        () => validateCrossGroupConditions(groups, usdRate),
        [groups, usdRate]
    );

    const builtLabelAll = useMemo(
        () => formatAllGroupsBuiltLabel(groups),
        [groups]
    );

    const emptyConditionsCaption = useMemo(() => {
        const isPercent = rebateType === "P";
        const valueSet = rebateValue !== "" && rebateValue != null && Number(rebateValue) > 0;
        if (isPercent) {
            const pct = valueSet ? `${rebateValue}%` : "the configured percentage";
            return `Always applied - with no conditions, this target pays on all sales in the period. The client will receive ${pct} of sales for the entire target date range, with no minimum.`;
        }
        const amount = valueSet
            ? `${rebateValue} ${contractCurrencyCode || ""}`.trim()
            : "the configured amount";
        return `Always applied - with no conditions, this target pays regardless of sales. The client will receive the fixed amount of ${amount} for the entire target date range.`;
    }, [rebateType, rebateValue, contractCurrencyCode]);

    const updateGroups = (next) => onChange(next);

    const clearSimplifyNotice = (groupId) => {
        setSimplifyNotices((prev) => {
            if (!prev[groupId]) return prev;
            const next = { ...prev };
            delete next[groupId];
            return next;
        });
    };

    const applyGroupChange = (groupId, updater) => {
        let notice = null;
        const nextGroups = groups.map((g) => {
            if (g.id !== groupId) return g;
            const updated = updater(g);
            const { group, simplified, message } = simplifyRedundantRangeConditions(updated);
            if (simplified && message) notice = message;
            return simplified ? group : updated;
        });
        if (notice) {
            setSimplifyNotices((prev) => ({ ...prev, [groupId]: notice }));
        }
        updateGroups(nextGroups);
    };

    const onDragEnd = (result) => {
        updateGroups(moveCondition(groups, result.source, result.destination));
    };

    const updateCondition = (groupId, condId, patch) => {
        clearSimplifyNotice(groupId);
        applyGroupChange(groupId, (g) => ({
            ...g,
            conditions: g.conditions.map((c) =>
                c.id === condId ? { ...c, ...patch } : c
            ),
        }));
    };

    const addCondition = (groupId) => {
        clearSimplifyNotice(groupId);
        applyGroupChange(groupId, (g) => ({
            ...g,
            conditions: [...g.conditions, createEmptyCondition()],
        }));
    };

    const addGroup = () => {
        updateGroups([...groups, createEmptyGroup()]);
    };

    const removeCondition = (groupId, condId) => {
        clearSimplifyNotice(groupId);
        const next = groups.map((g) => {
            if (g.id !== groupId) return g;
            return { ...g, conditions: g.conditions.filter((c) => c.id !== condId) };
        }).filter((g) => g.conditions.length > 0);
        updateGroups(next);
    };

    const removeGroup = (groupId) => {
        setSimplifyNotices((prev) => {
            if (!prev[groupId]) return prev;
            const next = { ...prev };
            delete next[groupId];
            return next;
        });
        updateGroups(groups.filter((g) => g.id !== groupId));
    };

    return (
        <div className="target-conditions-builder">
            <small className="text-muted fw-semibold d-block mb-2">Conditions</small>
            <div className="d-flex gap-2 mb-2 flex-wrap">
                <span className="hyperlink-text" style={{ fontSize: 12 }} onClick={addGroup}>
                    + Add (OR) block
                </span>
            </div>
            {!groups.length && (
                <div className="text-danger small mb-2">
                    {emptyConditionsCaption}
                </div>
            )}
            {groups.length > 0 && (
                <div className="condition-built-label small mb-2">
                    <span className="text-muted fw-semibold">Condition built: </span>
                    <span className="condition-built-label__text">
                        {builtLabelAll || "-"}
                    </span>
                </div>
            )}
            {crossGroupErrors.length > 0 && (
                <div className="alert alert-danger py-2 small mb-2">
                    {crossGroupErrors.map((e) => (
                        <div key={e}>{e}</div>
                    ))}
                </div>
            )}
            <DragDropContext onDragEnd={onDragEnd}>
                {groups.map((group, gIdx) => {
                    const validation = groupValidation[gIdx] || { errors: [], warnings: [] };
                    const simplifyNotice = simplifyNotices[group.id];
                    return (
                        <Droppable key={group.id} droppableId={groupDroppableId(group.id)}>
                            {(dropProvided, dropSnapshot) => (
                                <div
                                    ref={dropProvided.innerRef}
                                    {...dropProvided.droppableProps}
                                    className={`condition-group-card border rounded-3 p-2 mb-2 ${dropSnapshot.isDraggingOver ? "condition-droppable-active" : ""}`}
                                >
                                    {gIdx > 0 && (
                                        <div className="condition-or-strip text-center small fw-semibold text-muted py-1">
                                            (OR)
                                        </div>
                                    )}
                                    {simplifyNotice && (
                                        <div className="alert alert-info py-1 px-2 mb-2 small condition-group-alert">
                                            {simplifyNotice}
                                        </div>
                                    )}
                                    {validation.errors.map((msg) => (
                                        <div key={msg} className="alert alert-danger py-1 px-2 mb-2 small condition-group-alert">
                                            {msg}
                                        </div>
                                    ))}
                                    {validation.warnings.map((msg) => (
                                        <div key={msg} className="alert alert-warning py-1 px-2 mb-2 small condition-group-alert">
                                            {msg}
                                        </div>
                                    ))}
                                    <div className="d-flex justify-content-end align-items-center mb-2">
                                        <span
                                            className="hyperlink-text text-danger"
                                            style={{ fontSize: 11 }}
                                            onClick={() => removeGroup(group.id)}
                                        >
                                            Remove block
                                        </span>
                                    </div>
                                    {group.conditions.map((c, cIdx) => (
                                        <Draggable
                                            key={c.id}
                                            draggableId={conditionDraggableId(c.id)}
                                            index={cIdx}
                                        >
                                            {(dragProvided, dragSnapshot) => (
                                                <div
                                                    ref={dragProvided.innerRef}
                                                    {...dragProvided.draggableProps}
                                                    className={`condition-row mb-2 pb-2 ${cIdx < group.conditions.length - 1 ? "border-bottom" : ""} ${dragSnapshot.isDragging ? "condition-dragging" : ""}`}
                                                >
                                                    {cIdx > 0 && (
                                                        <div className="text-center small text-muted condition-and-label py-1">
                                                            AND
                                                        </div>
                                                    )}
                                                    <div className="row align-items-end g-2">
                                                        <div
                                                            className="col-auto pt-2 condition-drag-handle text-muted"
                                                            {...dragProvided.dragHandleProps}
                                                            title="Drag to reorder or move group"
                                                        >
                                                            ⋮⋮
                                                        </div>
                                                        <div className="col-md-3">
                                                            <SelectComp
                                                                name={`ctype_${c.id}`}
                                                                value={findOpt(conditionTypeOptions, c.conditionType)}
                                                                options={conditionTypeOptions}
                                                                onChange={(v) => {
                                                                    const nextType = (v && typeof v === "object" ? v.value : v) || null;
                                                                    updateCondition(group.id, c.id, {
                                                                        conditionType: nextType,
                                                                        salesAmountCurrency:
                                                                            nextType === "S"
                                                                                ? c.salesAmountCurrency
                                                                                : null,
                                                                        ...(nextType !== c.conditionType ? { value: "" } : {}),
                                                                    });
                                                                }}
                                                                placeholder="Type"
                                                                clearable
                                                                {...selectMenuProps}
                                                            />
                                                        </div>
                                                        <div className="col-md-3">
                                                            <SelectComp
                                                                name={`op_${c.id}`}
                                                                value={findOpt(operatorOptions, c.operator)}
                                                                options={operatorOptions}
                                                                onChange={(v) => updateCondition(group.id, c.id, {
                                                                    operator: (v && typeof v === "object" ? v.value : v) || null,
                                                                })}
                                                                placeholder="Operator"
                                                                clearable
                                                                {...selectMenuProps}
                                                            />
                                                        </div>
                                                        {c.conditionType === "S" && (
                                                            <div className="col-md-2">
                                                                <ContractCurrencyInput
                                                                    name={`curr_${c.id}`}
                                                                    value={contractCurrencyCode}
                                                                    placeholder="Currency"
                                                                />
                                                            </div>
                                                        )}
                                                        <div className="col-md-2">
                                                            <InputNumericComp
                                                                name={`val_${c.id}`}
                                                                value={c.value}
                                                                placeholder={valuePlaceholderForType(c.conditionType)}
                                                                handleChange={(v) => updateCondition(group.id, c.id, { value: v })}
                                                                className="form-control"
                                                                {...numericPropsForType(c.conditionType)}
                                                            />
                                                        </div>
                                                        {c.conditionType === "G" && (
                                                            <div className="col-12">
                                                                <small className="text-danger">{GROWTH_COMPARISON_CAPTION}</small>
                                                            </div>
                                                        )}
                                                        <div className="col d-flex gap-2 align-items-start pb-2 justify-content-end">
                                                            <span
                                                                className="hyperlink-text text-danger"
                                                                style={{ fontSize: 11 }}
                                                                onClick={() => removeCondition(group.id, c.id)}
                                                            >
                                                                Delete
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {dropProvided.placeholder}
                                    <span
                                        className="hyperlink-text"
                                        style={{ fontSize: 12 }}
                                        onClick={() => addCondition(group.id)}
                                    >
                                        + Add condition
                                    </span>
                                </div>
                            )}
                        </Droppable>
                    );
                })}
                <Droppable droppableId={NEW_GROUP_DROPPABLE_ID}>
                    {(provided, snapshot) => (
                        <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`condition-new-group-drop border border-dashed rounded-3 p-2 mb-2 text-center small text-muted ${snapshot.isDraggingOver ? "condition-droppable-active" : ""}`}
                        >
                            Drag a condition and drop it here to create a new OR group
                            {provided.placeholder}
                        </div>
                    )}
                </Droppable>
            </DragDropContext>
        </div>
    );
}