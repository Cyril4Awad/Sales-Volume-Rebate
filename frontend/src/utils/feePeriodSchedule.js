import moment from "moment";
import { buildMonthEndWindows } from "../Forms/Computation/utils/salesBreakdownUtils";
import {
    computeFeeSettlementAmount,
    getPeriodLength,
    nthPeriodBoundary,
    optionToValue,
} from "./settlementPaymentLogic";

function feeDisplayName(fee) {
    return String(fee?.typeLabel ?? fee?.name ?? fee?.FEE_Name ?? "Fee").trim() || "Fee";
}

function feeIdOf(fee) {
    return String(fee?.feeId ?? fee?.feeID ?? fee?.localId ?? "");
}

/** User-configured settlement type name from the lookup map (not derived from periodLength). */
export function settlementTypeNameOf(fee, settlementTypesMap = {}) {
    const key = optionToValue(fee?.settlementTypeId);
    const opt = key != null ? settlementTypesMap[String(key)] : null;
    const fromMap = String(opt?.label ?? opt?.name ?? "").trim();
    if (fromMap) return fromMap;
    const fromFee = fee?.settlementTypeId;
    if (fromFee && typeof fromFee === "object") {
        return String(fromFee.label ?? fromFee.name ?? "").trim();
    }
    return "";
}

/** Full due schedule for one fee from contract start through contract end. No settled flags. */
export function buildFeePeriodSchedule(fee, contractStart, contractEnd, settlementTypesMap) {
    const period = getPeriodLength(fee?.settlementTypeId, settlementTypesMap);
    if (!period.valid) return [];

    const start = moment(contractStart).startOf("day");
    const end = moment(contractEnd).startOf("day");
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) return [];

    const feeTotal = Number(fee?.amount ?? 0);
    const installment = computeFeeSettlementAmount(feeTotal, period.value, start, end);
    const feeId = feeIdOf(fee);
    const feeName = feeDisplayName(fee);
    const settlementTypeName = settlementTypeNameOf(fee, settlementTypesMap);
    const windows = buildMonthEndWindows(contractStart, contractEnd, contractEnd);
    const visibleKeys = new Set(windows.map((w) => w.key));
    const lastVisibleKey = windows.length ? windows[windows.length - 1].key : null;
    const rows = [];
    let runningTotal = 0;

    const foldRemainingIntoLastVisible = () => {
        const leftover = feeTotal - runningTotal;
        if (leftover <= 1e-9) return;
        if (rows.length) {
            rows[rows.length - 1].amountDue += leftover;
            runningTotal = feeTotal;
            return;
        }
        if (!lastVisibleKey) return;
        const close = moment(`${lastVisibleKey}-01`).endOf("month");
        rows.push({
            feeId,
            feeName,
            periodIndex: 1,
            periodStart: start.toDate(),
            periodClose: moment.min(close, end).toDate(),
            periodKey: lastVisibleKey,
            periodLabel: moment(lastVisibleKey, "YYYY-MM").format("MMM YYYY"),
            amountDue: leftover,
            cadence: settlementTypeName,
        });
        runningTotal = feeTotal;
    };

    for (let k = 1; k <= 240; k += 1) {
        if (runningTotal >= feeTotal - 1e-9) break;

        const periodStart = k === 1
            ? start.clone()
            : nthPeriodBoundary(start, period.value, k - 1);
        if (!periodStart?.isValid() || periodStart.isAfter(end)) {
            foldRemainingIntoLastVisible();
            break;
        }

        const rawClose = periodStart.clone().add(period.value - 1, "months");
        const closeKey = rawClose.format("YYYY-MM");
        if (!visibleKeys.has(closeKey)) {
            foldRemainingIntoLastVisible();
            break;
        }

        const remaining = feeTotal - runningTotal;
        const amountDue = Math.min(installment, remaining);
        if (amountDue <= 0) break;

        runningTotal += amountDue;
        rows.push({
            feeId,
            feeName,
            periodIndex: k,
            periodStart: periodStart.toDate(),
            periodClose: rawClose.toDate(),
            periodKey: closeKey,
            periodLabel: rawClose.format("MMM YYYY"),
            amountDue,
            cadence: settlementTypeName,
        });
    }

    if (runningTotal < feeTotal - 1e-9) foldRemainingIntoLastVisible();

    return rows;
}

/** Calendar-month cards with combined fee totals. Periods keyed by closing month vs window.key. */
export function groupFeesByCalendarMonth(fees, contractStart, contractEnd, settlementTypesMap) {
    const windows = buildMonthEndWindows(contractStart, contractEnd, contractEnd);
    const allPeriods = (fees || []).flatMap((fee) =>
        buildFeePeriodSchedule(fee, contractStart, contractEnd, settlementTypesMap)
    );

    return windows.map((window) => {
        const contributors = allPeriods
            .filter((p) => p.periodKey === window.key)
            .map((p) => ({
                kind: "fee",
                id: p.feeId,
                name: p.feeName,
                amount: Number(p.amountDue) || 0,
                cadence: p.cadence,
            }));
        const total = contributors.reduce((sum, c) => sum + c.amount, 0);
        return {
            key: window.key,
            label: window.label,
            isPartial: !!window.isPartial,
            total,
            contributors,
        };
    });
}
