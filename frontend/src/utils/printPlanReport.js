import moment from "moment";

const label  = (v) => (v && typeof v === "object" ? v.label ?? "" : v ?? "");
const fmt    = (d) => (d ? moment(d).format("DD MMMM YYYY") : "-");
const yesNo  = (b) => (b ? "Yes" : "No");
const esc    = (s) => String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const conditionTypeLabel = (t) => {
    if (t === "S") return "Sales Amount";
    if (t === "Q") return "Sales Quantity";
    if (t === "G") return "Growth";
    return esc(t ?? "");
};

const conditionCurrency = (c) => {
    if (c.conditionType === "Q") return "Pcs";
    if (c.conditionType === "G") return "%";
    return label(c.salesAmountCurrency);
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

const formatConditionRequired = (c) =>
    esc(`${c.operator ?? ""} ${valueWithUnit(c.value, conditionCurrency(c))}`.trim());

const formatTierRequired = (tier, tierConditionType, salesAmountCurrency) =>
    esc(`> ${valueWithUnit(tier.value, tierCurrencyLabel(tierConditionType, salesAmountCurrency))}`.trim());

const formatTierRebate = (tier) =>
    esc(tier.rebateValueType === "P"
        ? valueWithUnit(tier.rebateValue, "%")
        : valueWithUnit(tier.rebateValue, label(tier.currency)));

const formatFeeAmount = (f) => esc(valueWithUnit(f.amount, label(f.currency)));

const clientDisplay = (clientObj) => {
    if (!clientObj) return "-";
    const code = clientObj.code ?? clientObj.value ?? "";
    const name = clientObj.label ?? "";
    return esc(code && name ? `${code} - ${name}` : name || String(code));
};

// ── Sections ──────────────────────────────────────────────────────────────────

function contractSection(c = {}) {
    const subs = (c.SubClients ?? []).map((sc) => {
        const code = sc.ClientID?.code ?? sc.ClientID?.value ?? "";
        const name = sc.ClientID?.label ?? "";
        return `<li>${esc(code)} - ${esc(name)}</li>`;
    }).join("");

    return `
    <section>
      <h2>Contract</h2>
      <table class="detail-table">
        <tr><td class="lbl">Reference</td><td>${esc(c.ContractReference)}</td></tr>
        <tr><td class="lbl">Name</td><td>${esc(c.ContractName)}</td></tr>
        <tr><td class="lbl">Master Client</td><td>${clientDisplay(c.ClientID)}</td></tr>
        <tr><td class="lbl">Period</td><td>${esc(fmt(c.StartDate))} - ${esc(fmt(c.EndDate))}</td></tr>
        <tr><td class="lbl">Currency</td><td>${esc(label(c.contractCurrency) ?? "-")}</td></tr>
        <tr><td class="lbl">Active</td><td>${yesNo(c.Active)}</td></tr>
        ${c.Terms && c.Terms.replace(/<[^>]+>/g, "").trim() ? `
        <tr><td class="lbl" style="vertical-align:top;padding-top:6px;">Terms</td><td class="terms-cell">${c.Terms}</td></tr>
        ` : ""}
        ${c.Remarks ? `<tr><td class="lbl">Remarks</td><td>${esc(c.Remarks)}</td></tr>` : ""}
      </table>
      ${subs ? `<h3>Sub-Clients</h3><ul class="sub-list">${subs}</ul>` : ""}
    </section>`;
}

function planSection(p = {}, contractActive) {
    return `
    <section>
      <h2>Plan Details</h2>
      <table class="detail-table">
        <tr><td class="lbl">Plan Name</td><td>${esc(p.planName)}</td></tr>
        <tr><td class="lbl">Type</td><td>${esc(label(p.typeId))}</td></tr>
        <tr><td class="lbl">Active</td><td>${yesNo(contractActive)}</td></tr>
        ${p.remarks ? `<tr><td class="lbl">Remarks</td><td>${esc(p.remarks)}</td></tr>` : ""}
      </table>
    </section>`;
}

function feesSection(fees = []) {
    if (!fees.length) return "";
    const rows = fees.map((f) => `
        <tr>
          <td>${esc(f.typeLabel)}</td>
          <td>${formatFeeAmount(f)}</td>
          <td>${esc(label(f.settlementTypeId))}</td>
        </tr>`).join("");

    return `
    <section>
      <h2>Fees</h2>
      <table class="data-table">
        <thead>
          <tr><th>Fee Name</th><th>Amount</th><th>Settlement Type</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </section>`;
}

function conditionGroupsHtml(groups = []) {
    return groups.map((g, gi) => {
        const rows = (g.conditions ?? []).map((c, ci) => `
          ${ci > 0 ? `<tr class="join-row-inner"><td colspan="2">AND</td></tr>` : ""}
          <tr>
            <td>${conditionTypeLabel(c.conditionType)}</td>
            <td>${formatConditionRequired(c)}</td>
          </tr>`).join("");

        return `
        ${gi > 0 ? `<p class="join-label">OR</p>` : ""}
        <table class="data-table inner-table">
          <colgroup>
            <col style="width:40%">
            <col style="width:60%">
          </colgroup>
          <thead>
            <tr><th>Type</th><th>Required</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>`;
    }).join("");
}

function tiersHtml(tiers = [], target = {}) {
    if (!tiers.length) return "";
    const rows = tiers.map((tier) => `
      <tr>
        <td>${conditionTypeLabel(target.tierConditionType)}</td>
        <td>${formatTierRequired(tier, target.tierConditionType, target.salesAmountCurrency)}</td>
        <td>${formatTierRebate(tier)}</td>
      </tr>`).join("");

    return `
    <table class="data-table inner-table">
      <colgroup>
        <col style="width:33%">
        <col style="width:34%">
        <col style="width:33%">
      </colgroup>
      <thead>
        <tr><th>Condition Type</th><th>Required</th><th>Rebate</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function targetsSection(targets = []) {
    if (!targets.length) return "";

    const cards = targets.map((t) => {
        const scopeLabel = (t.references ?? []).length > 0
            ? "Reference Scoped"
            : "All Clients Sales";

        const condOrTier = t.targetType === "formula"
            ? conditionGroupsHtml(t.conditionGroups)
            : tiersHtml(t.tiers, t);

        const rebateDisplay = t.rebateValueType === "P"
            ? `${esc(t.rebateValue)} %`
            : `${esc(t.rebateValue)} ${esc(label(t.currency))}`;

        return `
        <div class="target-card">
          <div class="target-header">
            <span class="target-name">${esc(t.targetName)}</span>
            <span class="target-type">${esc(t.targetType)}</span>
          </div>
          <table class="detail-table">
            <tr><td class="lbl">Period</td><td>${esc(fmt(t.fromDate))} - ${esc(fmt(t.toDate))}</td></tr>
            <tr><td class="lbl">Rebate</td><td>${rebateDisplay}</td></tr>
            <tr><td class="lbl">Computation</td><td>${esc(label(t.computationTypeId))}</td></tr>
            <tr><td class="lbl">Settlement</td><td>${esc(label(t.settlementTypeId))}</td></tr>
            <tr><td class="lbl">Scope</td><td>${esc(scopeLabel)}</td></tr>
          </table>
          ${condOrTier ? `<div class="conditions-wrap">${condOrTier}</div>` : ""}
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
  @page { margin: 15mm 14mm 10mm 14mm; }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 12px;
    color: #000;
    background: #fff;
    padding: 20px 28px 20px 28px;
  }
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #000;
    padding-bottom: 12px;
    margin-bottom: 24px;
  }
  .report-header h1 { font-size: 18px; font-weight: 700; color: #000; }
  .report-header .subtitle { font-size: 12px; color: #333; margin-top: 3px; }
  .report-header .meta { text-align: right; font-size: 11px; color: #333; line-height: 1.8; }
  section { margin-bottom: 24px;  }
  section h2 {
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.6px; border-bottom: 1px solid #000;
    padding-bottom: 4px; margin-bottom: 10px;
  }
  section h3 { font-size: 12px; font-weight: 600; margin: 10px 0 5px; }
  .detail-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .detail-table td { padding: 4px 8px; vertical-align: top; border-bottom: 1px solid #e0e0e0; }
  .detail-table td.lbl { width: 150px; font-weight: 600; white-space: nowrap; }
  .data-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; font-size: 11px; }
  .data-table thead tr { background: #222; color: #fff; }
  .data-table thead th { padding: 5px 8px; text-align: left; font-weight: 600; font-size: 11px; }
  .data-table tbody tr:nth-child(even) { background: #f5f5f5; }
  .data-table tbody td { padding: 4px 8px; border-bottom: 1px solid #e0e0e0; }
  .inner-table { margin-left: 0; width: 100%; }
  .sub-list { padding-left: 20px; }
  .sub-list li { margin: 3px 0; }
  .target-card {
    border: 1px solid #ccc; border-radius: 3px;
    padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid;
  }
  .target-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .target-name { font-weight: 700; font-size: 13px; }
  .target-type {
    font-size: 10px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.4px; background: #eee; color: #333;
    padding: 2px 7px; border-radius: 10px; border: 1px solid #ccc;
  }
  .conditions-wrap { margin-top: 10px; }
  .join-label {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    color: #333; margin: 6px 0 3px 0;
  }
  .join-row-inner td {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    color: #333; background: #f0f0f0 !important;
    padding: 2px 8px;
  }
  .report-footer {
    margin-top: 28px; border-top: 1px solid #000; padding-top: 6px;
    font-size: 10px; color: #555; display: flex; justify-content: space-between;
  }
  .terms-cell { font-size: 12px; line-height: 1.6; color: #000; vertical-align: top; }
  .terms-cell p { margin: 0 0 4px 0; }
  .terms-cell ul, .terms-cell ol { padding-left: 18px; margin: 0 0 4px 0; }
  @media print { body { padding: 0; } }
`;

// ── Main ──────────────────────────────────────────────────────────────────────

export default function printPlanReport(draft, companyName = "") {
    const c   = draft.contractDraft ?? {};
    const ref = c.ContractReference ?? "-";
    const name = c.ContractName ?? "-";
    const now  = moment().format("DD MMM YYYY, HH:mm");

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Contract Report - ${esc(ref)}</title>
  <style>${CSS}</style>
</head>
<body>
  <header class="report-header">
    <div>
      <h1>Contract Report - ${esc(ref)}</h1>
      <div class="subtitle">${esc(name)} | ${esc(fmt(c.StartDate))} - ${esc(fmt(c.EndDate))}</div>
    </div>
    <div class="meta">
      ${companyName ? `<div><strong>Company:</strong> ${esc(companyName)}</div>` : ""}
      <div><strong>Printed:</strong> ${esc(now)}</div>
    </div>
  </header>
  ${contractSection(c)}
  ${planSection(draft.plan, c.Active)}
  ${feesSection(draft.fees)}
  ${targetsSection(draft.targets)}
  <footer class="report-footer">
    <span>${esc(ref)} - ${esc(name)}</span>
    <span>Generated ${esc(now)}${companyName ? " - " + esc(companyName) : ""}</span>
  </footer>
  <script>
    window.onload = function() { setTimeout(function() { window.print(); }, 800); };
  <\/script>
</body>
</html>`;

    const win = window.open("", "_blank");
    if (!win) { alert("Pop-up blocked. Please allow pop-ups for this site to use Print."); return; }
    win.document.open();
    win.document.write(html);
    win.document.close();
}