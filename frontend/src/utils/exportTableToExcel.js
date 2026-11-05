import * as XLSX from "xlsx";

// ── Browser-safe Blob download ────────────────────────────────────────────────

const downloadWorkbook = (wb, filename) => {
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "binary" });
    const buf   = new ArrayBuffer(wbout.length);
    const view  = new Uint8Array(buf);
    for (let i = 0; i < wbout.length; i++) view[i] = wbout.charCodeAt(i) & 0xFF;
    const blob = new Blob([buf], { type: "application/octet-stream" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
};

// ── Styles ────────────────────────────────────────────────────────────────────

const headerStyle = {
    font:      { bold: true, color: { rgb: "FFFFFF" } },
    fill:      { fgColor: { rgb: "222222" } },
    alignment: { horizontal: "left", vertical: "center" },
    border:    { bottom: { style: "thin", color: { rgb: "000000" } } },
};

const evenRow = {
    fill:      { fgColor: { rgb: "F9F9F9" } },
    alignment: { horizontal: "left" },
    border:    { bottom: { style: "hair", color: { rgb: "E0E0E0" } } },
};

const oddRow = {
    fill:      { fgColor: { rgb: "FFFFFF" } },
    alignment: { horizontal: "left" },
    border:    { bottom: { style: "hair", color: { rgb: "E0E0E0" } } },
};

// ── Value resolver ────────────────────────────────────────────────────────────
// Resolves a cell value from a row given a column definition.
// Handles: select objects {value, label}, booleans, plain strings/numbers.

const resolveValue = (row, col) => {
    const raw = row[col.accessor];

    // Boolean → Yes/No (cleaner than ✅/❌ in Excel)
    if (typeof raw === "boolean") return raw ? "Yes" : "No";

    // Select option object {value, label}
    if (raw && typeof raw === "object" && "label" in raw) return raw.label ?? "";

    // null/undefined
    if (raw == null) return "";

    return String(raw);
};

// ── Main export function ──────────────────────────────────────────────────────

/**
 * exportTableToExcel
 *
 * @param {Array}  columns   - Same columns array passed to AdvancedTable
 * @param {Array}  data      - Same dataArray passed to AdvancedTable
 * @param {string} filename  - Output filename (without .xlsx)
 * @param {string} sheetName - Sheet tab name (optional)
 */
export default function exportTableToExcel(columns, data, filename, sheetName = "Sheet1") {
    // Filter out columns with no header, no accessor, or accessor === "Actions"
    // Also skip columns whose header is "Actions" or accessor matches typical action patterns
    const exportCols = columns.filter((col) => {
        if (!col.accessor) return false;
        const h = String(col.Header ?? "").trim().toLowerCase();
        const a = String(col.accessor ?? "").trim().toLowerCase();
        if (h === "actions" || a === "actions") return false;
        if (h === "" && a === "") return false;
        return true;
    });

    if (!exportCols.length || !data.length) {
        alert("No data to export.");
        return;
    }

    const ws  = {};
    const colCount = exportCols.length;

    // Header row
    exportCols.forEach((col, c) => {
        const addr = XLSX.utils.encode_cell({ r: 0, c });
        ws[addr]   = { v: String(col.Header ?? ""), t: "s", s: headerStyle };
    });

    // Data rows
    data.forEach((row, r) => {
        const rowStyle = r % 2 === 0 ? evenRow : oddRow;
        exportCols.forEach((col, c) => {
            const addr  = XLSX.utils.encode_cell({ r: r + 1, c });
            const value = resolveValue(row, col);
            ws[addr]    = { v: value, t: "s", s: rowStyle };
        });
    });

    // Set ref and column widths
    ws["!ref"]  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: data.length, c: colCount - 1 } });
    ws["!cols"] = exportCols.map((col) => {
        const header = String(col.Header ?? "").length;
        const maxData = data.reduce((max, row) => {
            const len = resolveValue(row, col).length;
            return len > max ? len : max;
        }, 0);
        return { wch: Math.min(Math.max(header, maxData) + 2, 50) };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    downloadWorkbook(wb, `${filename}.xlsx`);
}