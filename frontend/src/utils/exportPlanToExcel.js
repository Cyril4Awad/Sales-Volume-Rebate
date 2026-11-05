import * as XLSX from "xlsx";
import moment from "moment";

// ── helpers ───────────────────────────────────────────────────────────────────

const label  = (v) => (v && typeof v === "object" ? v.label ?? "" : v ?? "");
const fmt    = (d) => (d ? moment(d).format("DD MMM YYYY") : "");
const yesNo  = (b) => (b ? "Yes" : "No");

const conditionTypeLabel = (t) => {
    if (t === "S") return "Sales Amount";
    if (t === "Q") return "Sales Quantity";
    if (t === "G") return "Growth";
    return t ?? "";
};

const conditionCurrency = (conditionType, salesAmountCurrency) => {
    if (conditionType === "Q") return "Pcs";
    if (conditionType === "G") return "%";
    return label(salesAmountCurrency);
};

const tierCurrencyLabel = (tierConditionType, salesAmountCurrency) => {
    if (tierConditionType === "Q") return "Pcs";
    if (tierConditionType === "G") return "%";
    return label(salesAmountCurrency);
};

const valueWithUnit = (value, unit) => {
    const v = value ?? "";
    const u = (unit ?? "").trim();
    if (!u) return String(v);
    return `${v} ${u}`.trim();
};

const formatConditionRequired = (cond) => {
    const unit = conditionCurrency(cond.conditionType, cond.salesAmountCurrency);
    return `${cond.operator ?? ""} ${valueWithUnit(cond.value, unit)}`.trim();
};

const formatTierRequired = (tier, tierConditionType, salesAmountCurrency) => {
    const unit = tierCurrencyLabel(tierConditionType, salesAmountCurrency);
    return `${tier.operator ?? "="} ${valueWithUnit(tier.value, unit)}`.trim();
};

const formatTierRebate = (tier) =>
    tier.rebateValueType === "P"
        ? valueWithUnit(tier.rebateValue, "%")
        : valueWithUnit(tier.rebateValue, label(tier.currency));

const formatFeeAmount = (f) => valueWithUnit(f.amount, label(f.currency));

const clientDisplay = (clientObj) => {
    if (!clientObj) return "";
    const code = clientObj.code ?? clientObj.value ?? "";
    const name = clientObj.label ?? "";
    return code && name ? `${code} - ${name}` : name || String(code);
};

// Strip HTML tags from Quill HTML string → plain text for Excel
const stripHtml = (html) => {
    if (!html) return "";
    return html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&nbsp;/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
};

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

const sectionTitleStyle = {
    font:      { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
    fill:      { fgColor: { rgb: "222222" } },
    alignment: { horizontal: "left", vertical: "center" },
};

const targetTitleStyle = {
    font:      { bold: true, sz: 11, color: { rgb: "000000" } },
    fill:      { fgColor: { rgb: "DDDDDD" } },
    alignment: { horizontal: "left", vertical: "center" },
};

const tableHeaderStyle = {
    font:      { bold: true, color: { rgb: "FFFFFF" } },
    fill:      { fgColor: { rgb: "444444" } },
    alignment: { horizontal: "left", vertical: "center" },
    border:    { bottom: { style: "thin", color: { rgb: "000000" } } },
};

const subHeaderStyle = {
    font:      { bold: true, color: { rgb: "FFFFFF" } },
    fill:      { fgColor: { rgb: "666666" } },
    alignment: { horizontal: "left", vertical: "center" },
};

const keyStyle = {
    font:      { bold: true },
    fill:      { fgColor: { rgb: "F5F5F5" } },
    alignment: { horizontal: "left" },
    border:    { bottom: { style: "hair", color: { rgb: "CCCCCC" } } },
};

const valueStyle = {
    alignment: { horizontal: "left" },
    border:    { bottom: { style: "hair", color: { rgb: "CCCCCC" } } },
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

const joinStyle = {
    font:      { bold: true, italic: true, color: { rgb: "555555" } },
    fill:      { fgColor: { rgb: "F0F0F0" } },
    alignment: { horizontal: "left" },
};

// ── Sheet builder ─────────────────────────────────────────────────────────────

const TOTAL_COLS = 8;

class SheetBuilder {
    constructor() {
        this.cells  = [];
        this.merges = [];
        this.row    = 0;
    }

    gap() { this.row++; }

    sectionTitle(text) {
        this._set(this.row, 0, text, sectionTitleStyle);
        this._merge(this.row, 0, this.row, TOTAL_COLS - 1);
        this.row++;
    }

    targetTitle(text) {
        this._set(this.row, 0, text, targetTitleStyle);
        this._merge(this.row, 0, this.row, TOTAL_COLS - 1);
        this.row++;
    }

    detail(key, value) {
        this._set(this.row, 0, key, keyStyle);
        this._set(this.row, 1, value, valueStyle);
        this._merge(this.row, 1, this.row, 3);
        this.row++;
    }

    tableHeader(cols) {
        cols.forEach((c, i) => this._set(this.row, i, c, tableHeaderStyle));
        this.row++;
    }

    subHeader(cols) {
        cols.forEach((c, i) => this._set(this.row, i, c, subHeaderStyle));
        this.row++;
    }

    dataRow(values, idx) {
        const s = idx % 2 === 0 ? evenRow : oddRow;
        values.forEach((v, i) => this._set(this.row, i, v, s));
        this.row++;
    }

    joinRow(text) {
        this._set(this.row, 0, text, joinStyle);
        this._merge(this.row, 0, this.row, TOTAL_COLS - 1);
        this.row++;
    }

    _set(r, c, v, s) { this.cells.push({ r, c, v: v ?? "", s }); }
    _merge(rs, cs, re, ce) { this.merges.push({ s: { r: rs, c: cs }, e: { r: re, c: ce } }); }

    build(colWidths) {
        const ws      = {};
        ws["!ref"]    = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: this.row, c: TOTAL_COLS - 1 } });
        ws["!merges"] = this.merges;
        ws["!cols"]   = colWidths.map((w) => ({ wch: w }));
        this.cells.forEach(({ r, c, v, s }) => {
            const addr = XLSX.utils.encode_cell({ r, c });
            ws[addr]   = { v, t: typeof v === "number" ? "n" : "s" };
            if (s) ws[addr].s = s;
        });
        return ws;
    }
}

// ── Single sheet builder ──────────────────────────────────────────────────────

function buildSingleSheet(draft) {
    const sb = new SheetBuilder();
    const c  = draft.contractDraft ?? {};
    const p  = draft.plan ?? {};

    // CONTRACT
    sb.sectionTitle("CONTRACT");
    sb.detail("Reference",  c.ContractReference ?? "");
    sb.detail("Name",       c.ContractName ?? "");
    sb.detail("Client",     clientDisplay(c.ClientID));
    sb.detail("Start Date", fmt(c.StartDate));
    sb.detail("End Date",   fmt(c.EndDate));
    sb.detail("Currency",   label(c.contractCurrency) ?? "");
    sb.detail("Active",     yesNo(c.Active));
    if (c.Remarks) sb.detail("Remarks", c.Remarks);
    if (c.Terms)   sb.detail("Terms",   stripHtml(c.Terms));

    const subs = c.SubClients ?? [];
    if (subs.length) {
        sb.gap();
        sb.tableHeader(["Code/No", "Client Name", "", "", "", "", "", ""]);
        subs.forEach((sc, i) => sb.dataRow([
            sc.ClientID?.code ?? sc.ClientID?.value ?? "",
            sc.ClientID?.label ?? "",
            "", "", "", "", "", "",
        ], i));
    }

    sb.gap();

    // PLAN
    sb.sectionTitle("PLAN");
    sb.detail("Plan Name",          p.planName ?? "");
    sb.detail("Type",               label(p.typeId));
    sb.detail("Active",             yesNo(c.Active));
    if (p.remarks) sb.detail("Remarks", p.remarks);

    sb.gap();

    // FEES
    sb.sectionTitle("FEES");
    const fees = draft.fees ?? [];
    if (fees.length) {
        sb.tableHeader(["Fee Name", "Amount", "Settlement Type", "", "", "", "", ""]);
        fees.forEach((f, i) => {
            sb.dataRow([
                f.typeLabel ?? "",
                formatFeeAmount(f),
                label(f.settlementTypeId),
                "", "", "", "",
            ], i);
        });
    } else {
        sb.detail("", "No fees defined");
    }

    sb.gap();

    // TARGETS
    sb.sectionTitle("TARGETS");

    (draft.targets ?? []).forEach((t) => {
        sb.gap();

        const typeTag = t.targetType === "formula" ? "FORMULA" : "RANGE";
        sb.targetTitle(`${t.targetName ?? "Target"} - ${typeTag}`);

        const rebateDisplay = t.rebateValueType === "P"
            ? `${t.rebateValue} %`
            : `${t.rebateValue} ${label(t.currency)}`;

        const scopeLabel = (t.references ?? []).length > 0
            ? "Reference Scoped"
            : "All Clients Sales";

        sb.detail("Period",      `${fmt(t.fromDate)} - ${fmt(t.toDate)}`);
        sb.detail("Rebate",      rebateDisplay);
        sb.detail("Computation", label(t.computationTypeId));
        sb.detail("Settlement",  label(t.settlementTypeId));
        sb.detail("Scope",       scopeLabel);

        sb.gap();

        // Conditions or Tiers
        if (t.targetType === "formula") {
            const groups = t.conditionGroups ?? [];
            if (groups.length) {
                let dataIdx = 0;
                groups.forEach((g, gi) => {
                    if (gi > 0) sb.joinRow("  OR");
                    sb.subHeader(["Type", "Required", "", "", "", "", "", ""]);
                    (g.conditions ?? []).forEach((cond, ci) => {
                        if (ci > 0) sb.joinRow("  AND");
                        sb.dataRow([
                            conditionTypeLabel(cond.conditionType),
                            formatConditionRequired(cond),
                            "", "", "", "", "",
                        ], dataIdx++);
                    });
                });
            }
        } else if (t.targetType === "range") {
            const tiers = t.tiers ?? [];
            if (tiers.length) {
                sb.subHeader(["Condition Type", "Required", "Rebate", "", "", "", "", ""]);
                tiers.forEach((tier, i) => {
                    sb.dataRow([
                        conditionTypeLabel(t.tierConditionType),
                        formatTierRequired(tier, t.tierConditionType, t.salesAmountCurrency),
                        formatTierRebate(tier),
                        "", "", "", "",
                    ], i);
                });
            }
        }
    });

    return sb.build([28, 22, 16, 18, 22, 14, 14, 14]);
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function exportPlanToExcel(draft) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, buildSingleSheet(draft), "Contract Plan");

    const ref      = draft.contractDraft?.ContractReference ?? "export";
    const name     = draft.contractDraft?.ContractName ?? "";
    const filename = `${ref}${name ? " - " + name : ""}.xlsx`
        .replace(/[/\\?%*:|"<>]/g, "-");

    downloadWorkbook(wb, filename);
}