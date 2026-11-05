import { useEffect, useMemo, useState } from "react";
import { SelectComp } from "../../../../ReusableComponents";
import { createEmptyTarget } from "../../../../utils/conditionGroups";

export const TARGET_NAV_COLLAPSE_WIDTH = 1029;

const mobileMediaQuery = () => `(max-width: ${TARGET_NAV_COLLAPSE_WIDTH}px)`;

const isMobileViewport = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(mobileMediaQuery()).matches;
};

/** Collapse target sidebar to SelectComp when viewport is mobile width. */
export function useTargetNavCollapsed(active = true) {
    const [collapsed, setCollapsed] = useState(isMobileViewport);

    useEffect(() => {
        if (!active) return;

        const mq = window.matchMedia(mobileMediaQuery());
        const update = () => setCollapsed(mq.matches);
        update();
        mq.addEventListener("change", update);

        return () => mq.removeEventListener("change", update);
    }, [active]);

    return collapsed;
}

function useTargetNavActions(targets, activeLocalId, onSelect, onChange, fees = []) {
    const canRemoveLast = (fees || []).length > 0;
    const canRemove = targets.length > 1 || (targets.length === 1 && canRemoveLast);

    const addTarget = () => {
        const next = createEmptyTarget(targets.length + 1);
        onChange([...targets, next]);
        onSelect(next.localId);
    };

    const removeTarget = (localId) => {
        if (targets.length <= 1 && !canRemoveLast) return;
        const next = targets.filter((t) => t.localId !== localId);
        onChange(next);
        if (activeLocalId === localId) {
            onSelect(next[0]?.localId ?? null);
        }
    };

    return { addTarget, removeTarget, canRemove };
}

export function TargetSelectorBar({
    targets,
    fees = [],
    activeLocalId,
    onSelect,
    onChange,
    selectMenuProps,
    className = "",
    readOnly = false,
}) {
    const { addTarget, removeTarget, canRemove } = useTargetNavActions(
        targets,
        activeLocalId,
        onSelect,
        onChange,
        fees
    );

    const targetOptions = useMemo(
        () => targets.map((t) => ({ value: t.localId, label: t.targetName || "Untitled" })),
        [targets]
    );

    const activeOption = useMemo(
        () => targetOptions.find((o) => o.value === activeLocalId) ?? null,
        [targetOptions, activeLocalId]
    );

    return (
        <div className={`d-flex align-items-center gap-2 mb-3 ${className}`.trim()}>
            <div className="flex-grow-1">
                <SelectComp
                    name="activeTarget"
                    value={activeOption}
                    options={targetOptions}
                    onChange={(opt) => onSelect(opt?.value ?? opt)}
                    placeholder="Select target"
                    clearable={false}
                    {...selectMenuProps}
                />
            </div>
            <button
                type="button"
                className="btn btn-sm btn-outline-primary plan-target-nav-mutation"
                style={{ whiteSpace: "nowrap", fontSize: 12 }}
                onClick={readOnly ? undefined : addTarget}
                disabled={readOnly}
            >
                + Add
            </button>
            {canRemove && (
                <button
                    type="button"
                    className="btn btn-sm btn-outline-danger plan-target-nav-mutation"
                    style={{ fontSize: 12 }}
                    title="Remove this target"
                    onClick={readOnly ? undefined : () => removeTarget(activeLocalId)}
                    disabled={readOnly}
                >
                    ×
                </button>
            )}
        </div>
    );
}

export default function TargetListNav({
    targets,
    fees = [],
    activeLocalId,
    onSelect,
    onChange,
    selectMenuProps,
    readOnly = false,
}) {
    const { addTarget, removeTarget, canRemove } = useTargetNavActions(
        targets,
        activeLocalId,
        onSelect,
        onChange,
        fees
    );

    return (
        <div
            className="d-flex flex-column gap-2 pe-2"
            style={{ minWidth: 250, borderRight: "1px solid #e5e7eb" }}
        >
            <div className="d-flex justify-content-between align-items-center mb-1">
                <small className="text-muted fw-semibold text-uppercase">Targets</small>
                <span
                    className="hyperlink-text plan-target-nav-mutation"
                    style={{ fontSize: 12 }}
                    onClick={readOnly ? undefined : addTarget}
                    role={readOnly ? undefined : "button"}
                >
                    + Add
                </span>
            </div>
            {targets.map((t) => {
                const active = t.localId === activeLocalId;
                return (
                    <div
                        key={t.localId}
                        className={`rounded-3 px-2 py-2 d-flex justify-content-between align-items-center ${
                            active ? "bg-primary text-white" : "bg-light"
                        }`}
                        style={{ cursor: "pointer", fontSize: 13 }}
                        onClick={() => onSelect(t.localId)}
                    >
                        <span
                            className="text-truncate"
                            style={{ maxWidth: 190 }}
                            title={t.targetName}
                        >
                            {t.targetName || "Untitled"}
                        </span>
                        {canRemove && (
                            <span
                                className={`${active ? "text-white-50" : "text-danger"} plan-target-nav-mutation`}
                                style={{ fontSize: 11, marginLeft: 4 }}
                                onClick={readOnly ? undefined : (e) => {
                                    e.stopPropagation();
                                    removeTarget(t.localId);
                                }}
                                role={readOnly ? undefined : "button"}
                            >
                                ×
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
