import { useState } from "react";

export default function PlanWorkspaceAccordion({
    title,
    subtitle,
    defaultOpen = false,
    level = "primary",
    headerRight,
    children,
}) {
    const [open, setOpen] = useState(defaultOpen);
    const levelClass = level === "nested" ? "plan-accordion--nested" : "";

    return (
        <div className={`card border-0 shadow-sm mb-3 plan-accordion ${levelClass}`}>
            <div
                className="card-header bg-light border-0 d-flex justify-content-between align-items-center"
                style={{ cursor: "pointer", userSelect: "none" }}
                onClick={() => setOpen((v) => !v)}
            >
                <div className="flex-grow-1 min-width-0">
                    <strong>{title}</strong>
                    {subtitle && <div className="text-muted small">{subtitle}</div>}
                </div>
                {headerRight && (
                    <div className="ms-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                        {headerRight}
                    </div>
                )}
                <span
                    className="ms-2 flex-shrink-0"
                    style={{
                        color: "#0078bb",
                        fontSize: 11,
                        transform: open ? "rotate(180deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                    }}
                >
                    ▼
                </span>
            </div>
            {open && (
                <div className="card-body" style={{ overflow: "visible" }}>
                    {children}
                </div>
            )}
        </div>
    );
}
