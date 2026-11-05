import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import moment from "moment";
import {
    getFeeSettlementDisplay,
    getTargetSettlementDisplay,
    isAlwaysAppliedTarget,
    sumSettlementTotals,
} from "./settlementPaymentLogic";
import {
    fmtRebateAmount,
    formatMetricAmount,
    buildSalesRows,
} from "../Forms/Computation/utils/computationDisplayUtils";

// ── helpers ───────────────────────────────────────────────────────────────────

const label     = (v) => (v && typeof v === "object" ? v.label ?? "" : v ?? "");
const fmt       = (d) => (d ? moment(d).format("DD MMM YYYY") : "");
const fmtNum    = (n, dec = 2) => Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
});
const optionToCode = (v) => {
    if (!v) return null;
    if (typeof v === "string") return v.trim() || null;
    if (typeof v === "object") return (v.value ?? v.label ?? "").trim() || null;
    return null;
};
const conditionTypeLabel = (t) => {
    if (t === "S") return "Sales Amount";
    if (t === "Q") return "Sales Quantity";
    if (t === "G") return "Growth";
    return t ?? "";
};

export const C = {
    // Section headers — brand blue (sidebar/header)
    sectionBg:    "0078BB",
    sectionFg:    "FFFFFF",

    // Target state bands — semantic (print/UI)
    achievedBg:   "D1E7DD",   achievedFg: "0A3622",
    missedBg:     "F8D7DA",   missedFg:   "58151C",
    progressBg:   "FFF3CD",   progressFg: "664D03",
    defaultBg:    "E8E8E8",   defaultFg:  "333333",

    // Table headers — align with exportPlanToExcel
    tableHdrBg:   "444444",   tableHdrFg: "FFFFFF",
    subHdrBg:     "666666",   subHdrFg:   "FFFFFF",

    // Data rows — neutral zebra
    evenBg:       "F9F9F9",
    oddBg:        "FFFFFF",
    achievedRowBg:"D1E7DD",

    // Detail rows (key/value)
    keyBg:        "F5F5F5",
    keyFg:        "333333",
    valueBg:      "FFFFFF",

    // Borders
    border:       "E0E0E0",
    borderDark:   "CCCCCC",

    // Join rows (AND / OR)
    joinBg:       "F0F0F0",
    joinFg:       "555555",

    // Grand total
    totalBg:      "222222",
    totalFg:      "FFFFFF",
};

const COLS = 8; // A–H

// ── Style factories ───────────────────────────────────────────────────────────

const border = (color = C.border) => ({
    top:    { style: "thin", color: { argb: "FF" + color } },
    bottom: { style: "thin", color: { argb: "FF" + color } },
    left:   { style: "thin", color: { argb: "FF" + color } },
    right:  { style: "thin", color: { argb: "FF" + color } },
});

const fill = (hex) => ({
    type: "pattern", pattern: "solid",
    fgColor: { argb: "FF" + hex },
});

const font = (hex, bold = false, sz = 11) => ({
    name: "Segoe UI", size: sz, bold, color: { argb: "FF" + hex },
});

// ── Sheet writer ──────────────────────────────────────────────────────────────

export class SheetWriter {
    constructor(ws) {
        this.ws  = ws;
        this.row = 1;
        ws.columns = Array.from({ length: COLS }, (_, i) => ({
            width: [32, 28, 18, 18, 20, 18, 14, 14][i],
        }));
    }

    // ── Primitives ────────────────────────────────────────────────────────────

    _row(values, heights = 18) {
        const r = this.ws.getRow(this.row);
        r.height = heights;
        values.forEach((v, i) => { r.getCell(i + 1).value = v ?? ""; });
        this.row++;
        return r;
    }

    _merge(startCol, endCol) {
        const r = this.row - 1;
        this.ws.mergeCells(r, startCol, r, endCol);
    }

    _styleRow(wsRow, bgHex, fgHex, bold = false, sz = 11, borders = true) {
        for (let c = 1; c <= COLS; c++) {
            const cell = wsRow.getCell(c);
            cell.fill   = fill(bgHex);
            cell.font   = font(fgHex, bold, sz);
            cell.alignment = { vertical: "middle", wrapText: true };
            if (borders) cell.border = border();
        }
    }

    // ── High-level blocks ─────────────────────────────────────────────────────

    gap() {
        this.ws.getRow(this.row).height = 6;
        this.row++;
    }

    sectionTitle(text) {
        const r = this._row([text], 22);
        this._merge(1, COLS);
        this._styleRow(r, C.sectionBg, C.sectionFg, true, 12);
        r.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }

    targetTitle(text, state) {
        const bg = state === "Achieved" ? C.achievedBg
                 : state === "Missed"   ? C.missedBg
                 : state === "In Progress" ? C.progressBg
                 : C.defaultBg;
        const fg = state === "Achieved" ? C.achievedFg
                 : state === "Missed"   ? C.missedFg
                 : state === "In Progress" ? C.progressFg
                 : C.defaultFg;
        const r = this._row([text], 20);
        this._merge(1, COLS);
        this._styleRow(r, bg, fg, true, 11);
        r.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }

    detail(key, value) {
        const r = this._row([key, value], 16);
        // Key cell
        const kc = r.getCell(1);
        kc.fill   = fill(C.keyBg);
        kc.font   = font(C.keyFg, true, 10);
        kc.border = border(C.border);
        kc.alignment = { vertical: "middle", indent: 1 };
        // Value cells (merged B–D)
        this.ws.mergeCells(this.row - 1, 2, this.row - 1, 4);
        const vc = r.getCell(2);
        vc.fill   = fill(C.valueBg);
        vc.font   = font("333333", false, 10);
        vc.border = border(C.border);
        vc.alignment = { vertical: "middle", indent: 1, wrapText: true };
        // Empty rest
        for (let c = 5; c <= COLS; c++) {
            r.getCell(c).fill   = fill(C.valueBg);
            r.getCell(c).border = border(C.border);
        }
    }

    totalDetail(key, value) {
        const r = this._row([key, value], 20);
        this._merge(1, COLS);
        this._styleRow(r, C.totalBg, C.totalFg, true, 11);
        const c1 = r.getCell(1);
        c1.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        // Write value in col 2 (still in merged cell visually)
        r.getCell(2).value = value;
        r.getCell(2).font  = font(C.totalFg, true, 11);
    }

    tableHeader(cols) {
        const r = this._row(cols, 18);
        cols.forEach((_, i) => {
            const c = r.getCell(i + 1);
            c.fill   = fill(C.tableHdrBg);
            c.font   = font(C.tableHdrFg, true, 10);
            c.border = border(C.borderDark);
            c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        });
        // Fill remaining cols
        for (let i = cols.length + 1; i <= COLS; i++) {
            const c = r.getCell(i);
            c.fill   = fill(C.tableHdrBg);
            c.border = border(C.borderDark);
        }
    }

    subHeader(cols) {
        const r = this._row(cols, 16);
        cols.forEach((_, i) => {
            const c = r.getCell(i + 1);
            c.fill   = fill(C.subHdrBg);
            c.font   = font(C.subHdrFg, true, 10);
            c.border = border(C.border);
            c.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
        });
        for (let i = cols.length + 1; i <= COLS; i++) {
            const c = r.getCell(i);
            c.fill   = fill(C.subHdrBg);
            c.border = border(C.border);
        }
    }

    dataRow(values, idx, highlight = false) {
        const bg = highlight ? C.achievedRowBg : (idx % 2 === 0 ? C.evenBg : C.oddBg);
        const r  = this._row(values, 15);
        for (let i = 1; i <= COLS; i++) {
            const c = r.getCell(i);
            c.fill   = fill(bg);
            c.font   = font(C.keyFg, false, 10);
            c.border = border(C.border);
            c.alignment = { vertical: "middle", indent: 1, wrapText: true };
        }
    }

    joinRow(text) {
        const r = this._row([text], 14);
        this._merge(1, COLS);
        this._styleRow(r, C.joinBg, C.joinFg, true, 9);
        r.getCell(1).font = { ...font(C.joinFg, true, 9), italic: true };
        r.getCell(1).alignment = { vertical: "middle", horizontal: "left", indent: 2 };
    }
}

// ── Main builder ──────────────────────────────────────────────────────────────

async function buildWorkbook(params) {
    const {
        selectedClient, resolved, previewResults,
        salesByTargetId, salesMetaByTargetId,
        payments = [],
        dailyRate,
    } = params;

    const contractCurrency = params.contractCurrency ?? resolved?.contractCurrency ?? "USD";
    const targets = resolved?.targets ?? [];
    const fees = resolved?.fees ?? [];
    const settlementTotals = sumSettlementTotals({
        targets,
        targetResults: previewResults?.targetResults ?? [],
        salesByTargetId,
        fees,
        payments,
        contractCurrency,
    });

    const wb      = new ExcelJS.Workbook();
    wb.creator    = "SVR System";
    wb.created    = new Date();
    const ws      = wb.addWorksheet("Computation", { views: [{ showGridLines: false }] });
    const sw      = new SheetWriter(ws);
    const now     = moment().format("DD MMM YYYY, HH:mm");

    // ── HEADER ────────────────────────────────────────────────────────────────
    sw.sectionTitle("COMPUTATION REPORT");
    sw.detail("Generated", now);
    sw.detail("Client", selectedClient
        ? `${selectedClient.code ?? selectedClient.value} - ${selectedClient.label ?? ""}`
        : "");
    sw.detail("Contract", resolved?.contract?.ContractReference ?? "");
    sw.detail("Plan",     resolved?.plan?.planName ?? "");
    sw.detail("Currency", contractCurrency);
    if (dailyRate) sw.detail("Daily Rate", `1 USD = ${Number(dailyRate).toLocaleString()} LBP`);
    sw.gap();

    // ── SUMMARY ───────────────────────────────────────────────────────────────
    sw.sectionTitle("SUMMARY");
    if (previewResults) {
        sw.detail("Achieved Targets",    String(previewResults.achievedCount ?? 0));
        sw.detail("Missed Targets",      String(previewResults.missedCount ?? 0));
        sw.detail("In Progress Targets", String(previewResults.inProgressCount ?? 0));
    }
    sw.gap();

    sw.detail("Rebate owed", `${fmtRebateAmount(settlementTotals.rebateOwed, contractCurrency)} ${contractCurrency}`);
    sw.detail("Rebate settled", `${fmtRebateAmount(settlementTotals.rebateSettled, contractCurrency)} ${contractCurrency}`);
    if (fees.length > 0) {
        sw.detail("Fees owed", `${fmtRebateAmount(settlementTotals.feesOwed, contractCurrency)} ${contractCurrency}`);
        sw.detail("Fees settled", `${fmtRebateAmount(settlementTotals.feesSettled, contractCurrency)} ${contractCurrency}`);
    }
    sw.detail("Grand total owed", `${fmtRebateAmount(settlementTotals.grandOwed, contractCurrency)} ${contractCurrency}`);
    sw.detail("Grand total settled", `${fmtRebateAmount(settlementTotals.grandSettled, contractCurrency)} ${contractCurrency}`);
    sw.gap();

    // ── FEES ──────────────────────────────────────────────────────────────────
    if (fees.length) {
        sw.sectionTitle("FEES");
        sw.tableHeader(["Fee Name", "Settlement", "Owed", "Settled", "", "", ""]);
        fees.forEach((fee, i) => {
            const display = getFeeSettlementDisplay({ fee, payments, contractCurrency });
            const cur = display.currency ?? contractCurrency;
            sw.dataRow([
                fee.typeLabel ?? "",
                label(fee.settlementTypeId),
                `${fmtRebateAmount(display.owedAmount, cur)} ${cur}`,
                `${fmtRebateAmount(display.settledAmount, cur)} ${cur}`,
                "", "", "",
            ], i);
        });
        sw.gap();
    }

    // ── TARGETS ───────────────────────────────────────────────────────────────
    sw.sectionTitle("TARGETS");

    (previewResults?.targetResults ?? []).forEach((r) => {
        const target  = targets.find(
            (t) => String(t.targetId ?? t.TargetID) === String(r.targetId)
        );
        const sales   = salesByTargetId?.[String(r.targetId)] ?? {};
        const meta    = salesMetaByTargetId?.[String(r.targetId)] ?? {};
        const state   = r.state ?? "";
        const isRange = target?.targetType === "range";
        const typeTag = isRange ? "RANGE" : "FORMULA";

        sw.gap();
        sw.targetTitle(`${r.targetName ?? ""}  ·  ${typeTag}  ·  ${state.toUpperCase()}`, state);

        // Details
        const rebateValueType = String(target?.rebateValueType ?? "F").trim().toUpperCase();
        sw.detail("Period", `${fmt(target?.fromDate)} – ${fmt(target?.toDate)}`);
        if (!isRange) {
            sw.detail("Rebate", rebateValueType === "P"
                ? `${target?.rebateValue} %`
                : `${target?.rebateValue} ${optionToCode(target?.currency) ?? ""}`);
        }
        if (isAlwaysAppliedTarget(target)) {
            sw.detail("Settlement", label(target?.settlementTypeId));
        }
        const settlementDisplay = getTargetSettlementDisplay({
            target,
            targetResult: r,
            sales,
            contractCurrency,
            payments,
        });
        sw.detail("Rebate owed", `${fmtRebateAmount(settlementDisplay.owedAmount, settlementDisplay.currency)} ${settlementDisplay.currency}`);
        sw.detail("Rebate settled", `${fmtRebateAmount(settlementDisplay.settledAmount, settlementDisplay.currency)} ${settlementDisplay.currency}`);
        sw.gap();

        // Sales metrics
        sw.subHeader(["Sales Metric", "Amount", "", "", "", "", "", ""]);
        let si = 0;
        buildSalesRows(sales, contractCurrency).forEach((row) => {
            const suffix = row.currency === "%" ? " %" : ` ${row.currency}`;
            sw.dataRow([row.metric, `${row.amount}${suffix}`, "", "", "", "", "", ""], si++);
        });
        const scopeBadge = meta.referenceScope === "scoped" ? "Reference Scoped" : "All Client Sales";
        sw.detail("Sales Scope", scopeBadge);
        sw.gap();

        // Conditions or Tiers
        if (!isRange) {
            const groups = r.groupResults ?? [];
            if (groups.length) {
                let di = 0;
                groups.forEach((gr, gi) => {
                    if (gi > 0) sw.joinRow("  OR");
                    const blockPassed = gr?.passed === true ? "PASS" : "FAIL";
                    sw.subHeader([`Block ${gi + 1}  —  ${blockPassed}`, "Required", "Actual", "Result", "", "", "", ""]);
                    (gr.conditionResults ?? []).forEach((cr, ci) => {
                        if (ci > 0) sw.joinRow("  AND");
                        const unit = cr.conditionType === "Q" ? "Pcs"
                                   : cr.conditionType === "G" ? "%"
                                   : cr.conditionType === "S"
                                       ? (typeof cr.salesAmountCurrency === "object"
                                           ? (cr.salesAmountCurrency?.value ?? "USD")
                                           : cr.salesAmountCurrency || "USD")
                                   : "";
                        const sfx = unit ? ` ${unit}` : "";
                        const fv  = (v, t) => {
                            if (v == null) return "";
                            const n = Number(v);
                            if (!Number.isFinite(n)) return String(v);
                            if (t === "G") return fmtNum(n, 2);
                            if (t === "Q") return n.toLocaleString();
                            return fmtNum(n, 0);
                        };
                        sw.dataRow([
                            cr.label ?? "",
                            cr.operator ? `${cr.operator} ${fv(cr.required, cr.conditionType)}${sfx}` : "",
                            cr.actual != null ? `${fv(cr.actual, cr.conditionType)}${sfx}` : "",
                            cr.skipped ? "Skipped" : (cr.passed ? "✓ Pass" : "✗ Fail"),
                            "", "", "", "",
                        ], di++, cr.passed && !cr.skipped);
                    });
                });
            } else {
                sw.detail("Conditions", "Always Applied");
            }
        } else {
            const tiers = r.tierResults ?? [];
            if (tiers.length) {
                const tierUnit = target?.tierConditionType === "Q" ? "Pcs"
                               : target?.tierConditionType === "G" ? "%"
                               : (optionToCode(target?.salesAmountCurrency) ?? "USD");
                const getActual = () => {
                    if (target?.tierConditionType === "Q") return `${Number(sales.salesQuantity ?? 0).toLocaleString()} ${tierUnit}`;
                    if (target?.tierConditionType === "G") return `${fmtNum(sales.growthPercentageUSD ?? 0, 2)} ${tierUnit}`;
                    return `${fmtNum(sales.salesAmount ?? 0, 0)} ${tierUnit}`;
                };
                sw.tableHeader(["Range", "Metric", "Required", "Actual", "Exceeded", "Rebate", "", ""]);
                tiers.forEach((tr, i) => {
                    const rvt    = String(tr?.rebateValueType ?? "F").trim().toUpperCase();
                    const rebate = rvt === "P"
                        ? `${tr.rebateValue}%`
                        : `${tr.rebateValue} ${optionToCode(tr.currency) ?? ""}`;
                    sw.dataRow([
                        `Range ${i + 1}`,
                        conditionTypeLabel(target?.tierConditionType),
                        `> ${target?.tierConditionType === "G"
                            ? fmtNum(tr.value ?? 0, 2)
                            : fmtNum(tr.value ?? 0, 0)} ${tierUnit}`,
                        getActual(),
                        tr.exceeded ? "Yes" : "No",
                        rebate,
                        "", "",
                    ], i, tr.exceeded);
                });
            }
        }
    });

    return wb;
}

// ── Main export ───────────────────────────────────────────────────────────────

export default async function exportComputationToExcel(params) {
    const wb  = await buildWorkbook(params);
    const buf = await wb.xlsx.writeBuffer();
    const ref    = params.resolved?.contract?.ContractReference ?? "computation";
    const client = params.selectedClient?.label ?? "";
    const filename = `Computation - ${ref}${client ? " - " + client : ""}.xlsx`
        .replace(/[/\\?%*:|"<>]/g, "-");
    saveAs(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

function sanitizeFilename(name) {
    return String(name ?? "export").replace(/[/\\?%*:|"<>]/g, "-");
}

async function downloadWorkbook(wb, filename) {
    const buf = await wb.xlsx.writeBuffer();
    saveAs(
        new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
        sanitizeFilename(filename)
    );
}

function addMonthSheet(wb, monthLabel) {
    const name = String(monthLabel || "Month").slice(0, 31);
    return new SheetWriter(wb.addWorksheet(name, { views: [{ showGridLines: false }] }));
}

export async function exportSalesBreakdownToExcel({
    contractReference = "",
    targetName = "",
    currency = "USD",
    monthlyRows = [],
} = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "SVR System";
    wb.created = new Date();
    const rows = monthlyRows.length ? monthlyRows : [{ monthLabel: "N/A", salesAmount: 0, rebateAmount: 0, rebateRate: "" }];
    rows.forEach((row) => {
        const sw = addMonthSheet(wb, row.monthLabel);
        sw.sectionTitle(row.monthLabel || "Month");
        sw.detail("Sales Amount", `${formatMetricAmount(row.salesAmount, currency)} ${currency}`);
        sw.detail("Rebate Amount", `${fmtRebateAmount(row.rebateAmount, currency)} ${currency}`);
        sw.detail("Rebate Rate", row.rebateRate || "—");
    });
    await downloadWorkbook(
        wb,
        `Sales Breakdown - ${contractReference || "Contract"} - ${targetName || "Target"}.xlsx`
    );
}

export async function exportFeesBreakdownToExcel({
    contractReference = "",
    currency = "USD",
    months = [],
} = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "SVR System";
    wb.created = new Date();
    const rows = months.length ? months : [{ label: "N/A", contributors: [], total: 0 }];
    rows.forEach((month) => {
        const sw = addMonthSheet(wb, month.label);
        sw.sectionTitle(month.label || "Month");
        sw.tableHeader(["Fee Name", "Settlement Type", "Amount Due"]);
        const contributors = month.contributors ?? [];
        if (!contributors.length) {
            sw.dataRow(["—", "", `${fmtRebateAmount(0, currency)} ${currency}`], 0);
        } else {
            contributors.forEach((c, i) => {
                sw.dataRow([c.name ?? "", c.cadence ?? "", `${fmtRebateAmount(c.amount, currency)} ${currency}`], i);
            });
        }
        sw.gap();
        sw.totalDetail("Total", `${fmtRebateAmount(month.total ?? 0, currency)} ${currency}`);
    });
    await downloadWorkbook(wb, `Fees Breakdown - ${contractReference || "Contract"}.xlsx`);
}

export async function exportTotalBreakdownToExcel({
    contractReference = "",
    currency = "USD",
    months = [],
} = {}) {
    const wb = new ExcelJS.Workbook();
    wb.creator = "SVR System";
    wb.created = new Date();
    const rows = months.length ? months : [{ label: "N/A", contributors: [], total: 0 }];
    rows.forEach((month) => {
        const sw = addMonthSheet(wb, month.label);
        sw.sectionTitle(month.label || "Month");
        sw.tableHeader(["Name", "Rate / Settlement Type", "Amount"]);
        const contributors = month.contributors ?? [];
        if (!contributors.length) {
            sw.dataRow(["—", "", `${fmtRebateAmount(0, currency)} ${currency}`], 0);
        } else {
            contributors.forEach((c, i) => {
                const mid = c.kind === "fee" ? (c.cadence ?? "") : (c.rate ?? "");
                sw.dataRow([c.name ?? "", mid, `${fmtRebateAmount(c.amount, currency)} ${currency}`], i);
            });
        }
        sw.gap();
        sw.totalDetail("Total", `${fmtRebateAmount(month.total ?? 0, currency)} ${currency}`);
    });
    await downloadWorkbook(wb, `Total Breakdown - ${contractReference || "Contract"}.xlsx`);
}