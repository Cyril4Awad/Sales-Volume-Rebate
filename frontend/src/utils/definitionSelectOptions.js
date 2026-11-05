const selectedValues = (selected) => {
    const list = Array.isArray(selected) ? selected : [selected];
    return list
        .filter((v) => v != null && v !== "")
        .map((v) => String(typeof v === "object" ? v?.value : v))
        .filter(Boolean);
};

/** Active-only select options; keeps current selection(s) if inactive (legacy plans). */
export function filterActiveSelectOptions(options = [], selected) {
    const activeOnly = options.filter((o) => o.active !== false);
    const selStrs = selectedValues(selected);
    if (!selStrs.length) return activeOnly;

    const missing = selStrs.filter((s) => !activeOnly.some((o) => o.value === s));
    const legacy = missing
        .map((s) => options.find((o) => o.value === s))
        .filter(Boolean);
    return legacy.length ? [...activeOnly, ...legacy] : activeOnly;
}
