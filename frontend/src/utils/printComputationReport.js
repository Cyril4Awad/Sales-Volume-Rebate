import moment from "moment";
import {
    getFeeSettlementDisplay,
    getTargetSettlementDisplay,
    isAlwaysAppliedTarget,
    sumSettlementTotals,
} from "./settlementPaymentLogic";
import { fmtRebateAmount, buildSalesRows } from "../Forms/Computation/utils/computationDisplayUtils";

const label  = (v) => (v && typeof v === "object" ? v.label ?? "" : v ?? "");
const fmt    = (d) => (d ? moment(d).format("DD MMMM YYYY") : "-");
const fmtNum = (n, dec = 2) => Number(n ?? 0).toLocaleString(undefined, {
    minimumFractionDigits: dec, maximumFractionDigits: dec,
});
const esc    = (s) => String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

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
    return esc(t ?? "");
};

function summarySection({ selectedClient, resolved, previewResults, settlementTotals, contractCurrency, dailyRate }) {
    const cur = contractCurrency ?? resolved?.contractCurrency ?? "USD";
    const totals = settlementTotals ?? {};

    const clientDisplay = selectedClient
        ? `${esc(selectedClient.code ?? selectedClient.value)} - ${esc(selectedClient.label ?? "")}`
        : "-";

    const feesRows = (totals.feesOwed > 0 || totals.feesSettled > 0) ? `
        <tr><td class="lbl">Fees owed</td><td>${esc(fmtRebateAmount(totals.feesOwed, cur))} ${esc(cur)}</td></tr>
        <tr><td class="lbl">Fees settled</td><td>${esc(fmtRebateAmount(totals.feesSettled, cur))} ${esc(cur)}</td></tr>
    ` : "";

    return `
    <section>
      <h2>Summary</h2>
      <table class="detail-table">
        <tr><td class="lbl">Client</td><td>${clientDisplay}</td></tr>
        <tr><td class="lbl">Contract</td><td>${esc(resolved?.contract?.ContractReference ?? "-")}</td></tr>
        <tr><td class="lbl">Plan</td><td>${esc(resolved?.plan?.planName ?? "-")}</td></tr>
        <tr><td class="lbl">Currency</td><td>${esc(cur)}</td></tr>
        ${dailyRate ? `<tr><td class="lbl">Daily Rate</td><td>1 USD = ${Number(dailyRate).toLocaleString()} LBP</td></tr>` : ""}
        ${previewResults ? `
        <tr><td class="lbl">Achieved</td><td>${previewResults.achievedCount ?? 0} target(s)</td></tr>
        <tr><td class="lbl">Missed</td><td>${previewResults.missedCount ?? 0} target(s)</td></tr>
        <tr><td class="lbl">In Progress</td><td>${previewResults.inProgressCount ?? 0} target(s)</td></tr>
        ` : ""}
        <tr><td class="lbl">Rebate owed</td><td>${esc(fmtRebateAmount(totals.rebateOwed, cur))} ${esc(cur)}</td></tr>
        <tr><td class="lbl">Rebate settled</td><td>${esc(fmtRebateAmount(totals.rebateSettled, cur))} ${esc(cur)}</td></tr>
        ${feesRows}
        <tr class="total-row"><td class="lbl">Grand total owed</td><td><strong>${esc(fmtRebateAmount(totals.grandOwed, cur))} ${esc(cur)}</strong></td></tr>
        <tr class="total-row"><td class="lbl">Grand total settled</td><td><strong>${esc(fmtRebateAmount(totals.grandSettled, cur))} ${esc(cur)}</strong></td></tr>
      </table>
    </section>`;
}

function feesSection(fees, payments, contractCurrency) {
    if (!fees.length) return "";

    const rows = fees.map((fee) => {
        const display = getFeeSettlementDisplay({ fee, payments, contractCurrency });
        const cur = esc(display.currency ?? contractCurrency ?? "USD");

        return `
        <tr>
          <td>${esc(fee.typeLabel)}</td>
          <td>${esc(label(fee.settlementTypeId))}</td>
          <td class="num">${esc(fmtRebateAmount(display.owedAmount, cur))} ${cur}</td>
          <td class="num">${esc(fmtRebateAmount(display.settledAmount, cur))} ${cur}</td>
        </tr>`;
    }).join("");

    return `
    <section>
      <h2>Fees</h2>
      <table class="data-table">
        <thead>
          <tr><th>Name</th><th>Settlement</th><th>Owed</th><th>Settled</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function conditionUnit(cr) {
    if (cr.conditionType === "Q") return "Pcs";
    if (cr.conditionType === "G") return "%";
    if (cr.conditionType === "S") {
        const raw = cr.salesAmountCurrency;
        if (!raw) return "USD";
        if (typeof raw === "object") return raw.value ?? raw.label ?? "USD";
        return String(raw).trim() || "USD";
    }
    return "";
}

function fmtConditionValue(val, conditionType) {
    if (val == null || val === "-") return "-";
    const n = Number(val);
    if (!Number.isFinite(n)) return esc(String(val));
    // Growth: 2 decimal places
    if (conditionType === "G") return fmtNum(n, 2);
    // Quantity: no decimals
    if (conditionType === "Q") return n.toLocaleString();
    // Sales Amount: whole numbers
    return fmtNum(n, 0);
}

function conditionGroupsHtml(groupResults) {
    if (!groupResults?.length) return `<p class="always-applied">Always Applied</p>`;

    return groupResults.map((gr, gi) => {
        const passed = gr?.passed === true;
        const rows   = (gr.conditionResults ?? []).map((cr, ci) => {
            const unit     = conditionUnit(cr);
            const unitSufx = unit ? ` ${unit}` : "";
            const reqDisplay = cr.operator
                ? `${esc(cr.operator)} ${fmtConditionValue(cr.required, cr.conditionType)}${unitSufx}`
                : "-";
            const actDisplay = cr.actual != null
                ? `${fmtConditionValue(cr.actual, cr.conditionType)}${unitSufx}`
                : "-";

            return `
          ${ci > 0 ? `<tr class="join-row-inner"><td colspan="4">AND</td></tr>` : ""}
          <tr>
            <td>${esc(cr.label ?? "")}</td>
            <td>${reqDisplay}</td>
            <td>${actDisplay}</td>
            <td class="${cr.skipped ? "" : (cr.passed ? "pass" : "fail")}">
              ${cr.skipped ? "Skipped" : (cr.passed ? "Pass" : "Fail")}
            </td>
          </tr>`;
        }).join("");

        return `
        ${gi > 0 ? `<p class="join-label">OR</p>` : ""}
        <div class="block-wrap ${passed ? "block-pass" : "block-fail"}">
          <div class="block-header">
            BLOCK ${gi + 1}
            <span class="block-badge ${passed ? "pass-badge" : "fail-badge"}">${passed ? "PASS" : "FAIL"}</span>
          </div>
          <table class="data-table inner-table">
            <colgroup>
              <col style="width:30%"><col style="width:25%"><col style="width:25%"><col style="width:20%">
            </colgroup>
            <thead><tr><th>Metric</th><th>Required</th><th>Actual</th><th>Result</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }).join("");
}

function tiersHtml(tierResults, target, sales) {
    if (!tierResults?.length) return "";

    const tierUnit = target?.tierConditionType === "Q" ? "Pcs"
                   : target?.tierConditionType === "G" ? "%"
                   : (optionToCode(target?.salesAmountCurrency) ?? "USD");

    // FIX: Growth actual should use growthPercentageUSD, not salesAmount
    const getActual = (sales) => {
        if (target?.tierConditionType === "Q") return Number(sales?.salesQuantity ?? 0).toLocaleString();
        if (target?.tierConditionType === "G") return fmtNum(sales?.growthPercentageUSD ?? 0, 2);
        return fmtNum(sales?.salesAmount ?? 0, 0);
    };

    const rows = tierResults.map((tr) => {
        const rebateValueType = String(tr?.rebateValueType ?? "F").trim().toUpperCase();
        const rebate = rebateValueType === "P"
            ? `${tr.rebateValue}%`
            : `${tr.rebateValue} ${esc(optionToCode(tr.currency) ?? "")}`;
        const exceeded = tr.exceeded;

        return `
        <tr class="${exceeded ? "tier-exceeded" : ""}">
          <td>${esc(conditionTypeLabel(target?.tierConditionType))}</td>
          <td>&gt; ${Number(tr.value ?? 0).toLocaleString()} ${esc(tierUnit)}</td>
          <td>${getActual(sales)} ${esc(tierUnit)}</td>
          <td>${rebate}</td>
          <td>${exceeded ? "Yes" : "No"}</td>
        </tr>`;
    }).join("");

    return `
    <table class="data-table inner-table">
      <colgroup>
        <col style="width:20%"><col style="width:20%"><col style="width:20%">
        <col style="width:20%"><col style="width:20%">
      </colgroup>
      <thead>
        <tr><th>Condition Type</th><th>Required</th><th>Actual</th><th>Rebate</th><th>Exceeded</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function targetsSection(previewResults, targets, salesByTargetId, salesMetaByTargetId, payments, contractCurrency) {
    if (!previewResults?.targetResults?.length) return "";

    const cards = previewResults.targetResults.map((r) => {
        const target = (targets ?? []).find(
            (t) => String(t.targetId ?? t.TargetID) === String(r.targetId)
        );
        const sales  = salesByTargetId?.[String(r.targetId)] ?? {};
        const meta   = salesMetaByTargetId?.[String(r.targetId)] ?? {};
        const state  = r.state ?? "";
        const isRange = target?.targetType === "range";

        const stateClass = state === "Achieved" ? "state-achieved"
                         : state === "Missed"   ? "state-missed"
                         : "state-progress";

        const typeTag = isRange ? "RANGE" : "FORMULA";

        const rebateValueType = String(target?.rebateValueType ?? "F").trim().toUpperCase();

        const settlementDisplay = target ? getTargetSettlementDisplay({
            target,
            targetResult: r,
            sales,
            contractCurrency,
            payments,
        }) : null;
        const settlementCur = esc(settlementDisplay?.currency ?? contractCurrency ?? "USD");

        const salesRows = buildSalesRows(sales, contractCurrency)
            .map((row) => {
                const suffix = row.currency === "%" ? " %" : ` ${esc(row.currency)}`;
                return `<tr><td>${esc(row.metric)}</td><td class="num">${esc(row.amount)}${suffix}</td></tr>`;
            })
            .join("");

        const condOrTier = isRange
            ? tiersHtml(r.tierResults, target, sales)
            : conditionGroupsHtml(r.groupResults);

        const scopeBadge = meta.referenceScope === "scoped" ? "Reference Scoped" : "All Client Sales";

        return `
        <div class="target-card">
          <div class="target-header">
            <span class="target-name">${esc(r.targetName)}</span>
            <span class="target-type">${typeTag}</span>
            <span class="target-state ${stateClass}">${esc(state)}</span>
          </div>
          <div class="target-body">
            <div class="target-detail-col">
              <table class="detail-table">
                <tr><td class="lbl">Period</td><td>${esc(fmt(target?.fromDate))} - ${esc(fmt(target?.toDate))}</td></tr>
                ${!isRange ? `<tr><td class="lbl">Rebate</td><td>${esc(rebateValueType === "P" ? `${target?.rebateValue} %` : `${target?.rebateValue} ${esc(optionToCode(target?.currency) ?? "")}`)}</td></tr>` : ""}
                ${isAlwaysAppliedTarget(target) ? `<tr><td class="lbl">Settlement</td><td>${esc(label(target?.settlementTypeId))}</td></tr>` : ""}
                <tr class="result-row"><td class="lbl">Rebate owed</td><td><strong>${esc(fmtRebateAmount(settlementDisplay?.owedAmount ?? 0, settlementCur))} ${settlementCur}</strong></td></tr>
                <tr class="result-row"><td class="lbl">Rebate settled</td><td><strong>${esc(fmtRebateAmount(settlementDisplay?.settledAmount ?? 0, settlementCur))} ${settlementCur}</strong></td></tr>
              </table>
              <table class="data-table sales-table" style="margin-top:10px">
                <thead><tr><th>Metric</th><th>Amount</th></tr></thead>
                <tbody>${salesRows}</tbody>
              </table>
              <div class="scope-badge">${esc(scopeBadge)}</div>
            </div>
            <div class="target-conditions-col">
              ${condOrTier}
            </div>
          </div>
        </div>`;
    }).join("");

    return `
    <section>
      <h2>Targets</h2>
      ${cards}
    </section>`;
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 12px; color: #000; background: #fff;
    padding: 32px 40px;
  }
  .report-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 24px;
  }
  .report-header h1 { font-size: 18px; font-weight: 700; }
  .report-header .subtitle { font-size: 12px; color: #333; margin-top: 3px; }
  .report-header .meta { text-align: right; font-size: 11px; color: #333; line-height: 1.8; }
  section { margin-bottom: 24px; page-break-inside: avoid; }
  section h2 {
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.6px; border-bottom: 1px solid #000;
    padding-bottom: 4px; margin-bottom: 10px;
  }
  .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .detail-table td { padding: 4px 8px; vertical-align: top; border-bottom: 1px solid #e0e0e0; }
  .detail-table td.lbl { width: 150px; font-weight: 600; white-space: nowrap; }
  .detail-table tr.total-row td { border-top: 2px solid #000; padding-top: 6px; }
  .detail-table tr.result-row td { border-top: 1px solid #ccc; }
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
  .data-table thead tr { background: #222; color: #fff; }
  .data-table thead th { padding: 5px 8px; text-align: left; font-weight: 600; font-size: 11px; }
  .data-table tbody tr:nth-child(even) { background: #f5f5f5; }
  .data-table tbody td { padding: 4px 8px; border-bottom: 1px solid #e0e0e0; }
  .data-table td.num { text-align: left; }
  .data-table td.pass { color: #0a3622; font-weight: 600; }
  .data-table td.fail { color: #58151c; font-weight: 600; }
  .inner-table { width: 100%; }
  .sales-table { width: 100%; }
  .target-card {
    border: 1px solid #ccc; border-radius: 3px;
    padding: 12px 14px; margin-bottom: 14px; page-break-inside: avoid;
  }
  .target-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .target-name { font-weight: 700; font-size: 13px; }
  .target-type {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    background: #eee; color: #333; padding: 2px 7px;
    border-radius: 10px; border: 1px solid #ccc; letter-spacing: 0.4px;
  }
  .target-state {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    padding: 2px 8px; border-radius: 10px; letter-spacing: 0.4px;
  }
  .state-achieved { background: #d1e7dd; color: #0a3622; border: 1px solid #a3cfbb; }
  .state-missed   { background: #f8d7da; color: #58151c; border: 1px solid #f1aeb5; }
  .state-progress { background: #fff3cd; color: #664d03; border: 1px solid #ffc107; }
  .target-body { display: flex; gap: 16px; }
  .target-detail-col { flex: 0 0 320px; min-width: 0; }
  .target-conditions-col { flex: 1; min-width: 0; }
  .scope-badge {
    display: inline-block; margin-top: 8px; font-size: 10px;
    background: #eee; border: 1px solid #ccc; padding: 2px 8px; border-radius: 10px;
  }
  .block-wrap { border-left: 3px solid #ccc; padding-left: 10px; margin-bottom: 10px; }
  .block-wrap.block-pass { border-color: #0a3622; }
  .block-wrap.block-fail { border-color: #58151c; }
  .block-header {
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.5px; color: #333; margin-bottom: 5px;
    display: flex; align-items: center; gap: 6px;
  }
  .block-badge {
    font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 700;
  }
  .pass-badge { background: #d1e7dd; color: #0a3622; }
  .fail-badge { background: #f8d7da; color: #58151c; }
  .join-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    color: #333; margin: 6px 0 4px;
  }
  .join-row-inner td {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    color: #333; background: #f0f0f0 !important; padding: 2px 8px;
  }
  .tier-exceeded { background: #d1e7dd !important; font-weight: 600; }
  .always-applied {
    font-size: 11px; color: #555; font-style: italic; padding: 8px 0;
  }
  .report-footer {
    margin-top: 28px; border-top: 1px solid #000; padding-top: 6px;
    font-size: 10px; color: #555; display: flex; justify-content: space-between;
  }
  @media print {
    body { padding: 10px 14px; }
    .target-body { flex-direction: column; }
    .target-detail-col { flex: none; width: 100%; }
  }
`;

// ── Main ──────────────────────────────────────────────────────────────────────

export default function printComputationReport({
    selectedClient,
    resolved,
    previewResults,
    salesByTargetId,
    salesMetaByTargetId,
    payments = [],
    contractCurrency: contractCurrencyParam,
    dailyRate,
    companyName = "",
}) {
    const now    = moment().format("DD MMM YYYY, HH:mm");
    const ref    = resolved?.contract?.ContractReference ?? "-";
    const client = selectedClient
        ? `${selectedClient.code ?? selectedClient.value} - ${selectedClient.label ?? ""}`
        : "-";
    const contractCurrency = contractCurrencyParam ?? resolved?.contractCurrency ?? "USD";
    const settlementTotals = sumSettlementTotals({
        targets: resolved?.targets ?? [],
        targetResults: previewResults?.targetResults ?? [],
        salesByTargetId,
        fees: resolved?.fees ?? [],
        payments,
        contractCurrency,
    });

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Computation Report - ${esc(ref)}</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="report-header">
    <div>
      <h1>Computation Report - ${esc(ref)}</h1>
      <div class="subtitle">${esc(client)}</div>
    </div>
    <div class="meta">
      ${companyName ? `<div><strong>Company:</strong> ${esc(companyName)}</div>` : ""}
      <div><strong>Printed:</strong> ${esc(now)}</div>
    </div>
  </header>

  ${summarySection({ selectedClient, resolved, previewResults, settlementTotals, contractCurrency, dailyRate })}
  ${feesSection(resolved?.fees ?? [], payments, contractCurrency)}
  ${targetsSection(previewResults, resolved?.targets ?? [], salesByTargetId, salesMetaByTargetId, payments, contractCurrency)}

  <footer class="report-footer">
    <span>${esc(ref)} - ${esc(client)}</span>
    <span>Generated ${esc(now)}${companyName ? " - " + esc(companyName) : ""}</span>
  </footer>
  <script>window.onload = function() { window.print(); };<script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Pop-up blocked. Please allow pop-ups for this site to use Print."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
}