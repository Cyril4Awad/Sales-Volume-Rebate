import { createElement } from "react";
import moment from "moment";
import { getContractLabelForPlanRow } from "./planWorkspaceMappers";
import { mobileActionRow, mobileLabeledRow } from "./mobileTableCells";

const getLabel = (opt) => opt?.label || "";

const activeIcon = (activeLabel) => (activeLabel === "Yes" ? "✅" : "❌");

export function buildPlanTableRow(draft, contractRecords = [], { workspaceItem } = {}) {
    const { draft: hydrated, label } = getContractLabelForPlanRow(draft, contractRecords);
    const contract = hydrated.contractDraft;
    const startDate = contract?.StartDate ?? null;
    const endDate = contract?.EndDate ?? null;

    return {
        recordId: hydrated.recordId,
        planName: hydrated.plan?.planName ?? "",
        contractLabel: label || "-",
        typeLabel: getLabel(hydrated.plan?.typeId),
        startDate: startDate ? moment(startDate).format("DD-MM-YYYY") : "-",
        endDate: endDate ? moment(endDate).format("DD-MM-YYYY") : "-",
        activeLabel: contract?.Active ? "Yes" : "No",
        _draft: hydrated,
        ...(workspaceItem != null ? { _workspaceItem: workspaceItem } : {}),
    };
}

export function getPlanWorkspaceTableColumns({
    includeActions = true,
    openEdit,
    handleDelete,
    isContractLocked,
} = {}) {
    const columns = [
        {
            Header: "Contract",
            accessor: "contractLabel",
            Cell: (row) => (
                <div style={{ marginLeft: "10px" }}>
                    {mobileLabeledRow("Contract", row.value)}
                </div>
            ),
            //Cell: (row) => mobileLabeledRow("Contract", row.value),
        },
        {
            Header: "Plan Name",
            accessor: "planName",
            Cell: (row) => mobileLabeledRow("Plan Name", row.value),
        },
        {
            Header: "VR Type",
            accessor: "typeLabel",
            Cell: (row) => mobileLabeledRow("VR Type", row.value),
        },
        {
            Header: "Start Date",
            accessor: "startDate",
            style: { textAlign: "center" },
            width: 130,
            Cell: (row) => mobileLabeledRow("Start Date", row.value),
        },
        {
            Header: "End Date",
            accessor: "endDate",
            style: { textAlign: "center" },
            width: 130,
            Cell: (row) => mobileLabeledRow("End Date", row.value),
        },
        {
            Header: "Active",
            accessor: "activeLabel",
            style: { textAlign: "center" },
            width: 100,
            Cell: (row) => mobileLabeledRow("Active", activeIcon(row.value)),
        },
    ];

    if (includeActions) {
        columns.push({
            Header: "Actions",
            accessor: "recordId",
            sortable: false,
            width: 160,
            Cell: (row) => {
                const locked = isContractLocked?.(row.original) === true;
                return mobileActionRow(
                    createElement(
                        "div",
                        { className: "d-flex align-items-center justify-content-center gap-2 plan-actions" },
                        createElement(
                            "span",
                            {
                                className: `hyperlink-text plan-action-link${locked ? " plan-action-view" : " plan-action-edit"}`,
                                style: { display: "inline-block", width: 36, textAlign: "right" },
                                onClick: () => openEdit?.(row.original),
                            },
                            locked ? "View" : "Edit"
                        ),
                        createElement("span", { className: "plan-action-sep" }, "|"),
                        createElement(
                            "span",
                            {
                                className: locked ? "text-muted plan-action-link plan-action-delete" : "hyperlink-text plan-action-link plan-action-delete",
                                style: locked ? { cursor: "not-allowed" } : undefined,
                                onClick: locked ? undefined : () => handleDelete?.(row.original.recordId),
                            },
                            "Delete"
                        )
                    )
                );
            },
        });
    }

    return columns;
}
