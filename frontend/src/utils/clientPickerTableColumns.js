import { createElement } from "react";
import { mobileActionRow, mobileDualCell, mobileLabeledRow } from "./mobileTableCells";

/** Shared client picker / sub-client table column definitions. */
export const CLIENT_TABLE_FIELD_COLUMNS = [
    { Header: "Code/No", accessor: "clientCode", label: "Code/No", width: 110, style: { textAlign: "center" } },
    { Header: "Client Name", accessor: "clientName", label: "Client Name", minWidth: 160 },
    { Header: "A/E", accessor: "ae", label: "A/E", width: 90 },
    { Header: "MOF #", accessor: "mof", label: "MOF #", width: 90 },
    { Header: "Address", accessor: "address", label: "Address", minWidth: 140 },
    { Header: "Phone 1", accessor: "phone1", label: "Phone 1", width: 110 },
    { Header: "Phone 2", accessor: "phone2", label: "Phone 2", width: 110 },
    { Header: "Category", accessor: "categ", label: "Category", width: 90, style: { textAlign: "center" } },
    { Header: "Client Type", accessor: "clientType", label: "Client Type", width: 110 },
];

export function mapClientFieldColumns(fields = CLIENT_TABLE_FIELD_COLUMNS) {
    return fields.map(({ label, ...col }) => ({
        ...col,
        Cell: (cell) => {
            const content = cell.value ?? "";
            if (col.style?.textAlign === "center") {
                return createElement(
                    "div",
                    { style: { textAlign: "center" } },
                    mobileDualCell(content, mobileLabeledRow(label, content))
                );
            }
            return mobileDualCell(content, mobileLabeledRow(label, content));
        },
    }));
}

export function buildPickerCheckboxColumn({ checked, onToggle, ariaLabel = "Select row", isLocked }) {
    return {
        Header: " ",
        accessor: "clRecId",
        width: 48,
        Cell: (cell) => {
            const locked = isLocked?.(cell.original);
            return mobileActionRow(
                createElement(
                    "div",
                    { className: `d-flex justify-content-center${locked ? " sub-client-picker-row--locked" : ""}` },
                    createElement("input", {
                        type: "checkbox",
                        className: "form-check-input m-0",
                        checked: checked(cell.original),
                        disabled: locked,
                        title: locked ? "Already added - remove from the table below" : undefined,
                        onChange: () => onToggle(cell.original),
                        "aria-label": ariaLabel,
                    })
                )
            );
        },
    };
}
