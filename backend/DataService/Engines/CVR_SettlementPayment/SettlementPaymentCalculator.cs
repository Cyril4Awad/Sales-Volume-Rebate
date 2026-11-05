using System.Globalization;
using DataService.Models;
using DataService.Models.DTOs;

public static class SettlementPaymentCalculator
{
    private static readonly HashSet<string> Phase1Types = new(StringComparer.OrdinalIgnoreCase) { "S", "Q", "G" };

    public static bool IsValidPeriodLength(int? periodLength) =>
        periodLength is >= 1 and <= 12;

    /// <summary>Truncate toward zero to 2 decimal places (matches computation UI).</summary>
    public static decimal TruncateMoney2(decimal value) =>
        Math.Truncate(value * 100m) / 100m;

    public static bool IsTargetInProgress(DateTime? toDate, DateTime asOf)
    {
        if (!toDate.HasValue) return false;
        var end = toDate.Value.Date.AddDays(1).AddTicks(-1);
        return end > asOf;
    }

    public static bool IsRangeTarget(CVR_Target target, List<CVR_TargetCondition> conditions) =>
        string.Equals(NormalizeTargetType(target.TAR_TargetType), "R", StringComparison.OrdinalIgnoreCase)
        || conditions.Any(c => string.Equals(c.TCD_LogicalOperator, "R", StringComparison.OrdinalIgnoreCase));

    public static bool IsConditionedTarget(CVR_Target target, List<CVR_TargetCondition> conditions) =>
        IsRangeTarget(target, conditions) || HasFormulaConditionGroups(conditions);

    public static decimal ResolveSalesBase(CVR_TargetSalesDto sales, string? contractCurrency)
    {
        var cur = string.IsNullOrWhiteSpace(contractCurrency)
            ? null
            : contractCurrency.Trim().ToUpperInvariant();
        if (cur != null && sales.SalesAmounts.TryGetValue(cur, out var amt))
            return amt;
        return sales.SalesAmountBase != 0 ? sales.SalesAmountBase : sales.SalesAmount;
    }

    public static DateTime CapAsOfDate(DateTime now, DateTime? contractEndDate, DateTime? targetEndDate = null)
    {
        var asOf = now.Date;
        if (contractEndDate.HasValue && contractEndDate.Value.Date < asOf)
            asOf = contractEndDate.Value.Date;
        if (targetEndDate.HasValue && targetEndDate.Value.Date < asOf)
            asOf = targetEndDate.Value.Date;
        return asOf;
    }

    /// <summary>Boundary k (1-based): fixedAnchor + k * periodLength months.</summary>
    public static DateTime NthPeriodBoundary(DateTime fixedAnchor, int periodLength, int k) =>
        fixedAnchor.Date.AddMonths(k * periodLength);

    /// <summary>Inclusive: boundary counts as passed when boundary &lt;= asOfDate.</summary>
    public static int CountBoundariesPassed(DateTime fixedAnchor, int periodLength, DateTime now, DateTime? contractEndDate = null, DateTime? targetEndDate = null)
    {
        var asOf = CapAsOfDate(now, contractEndDate, targetEndDate);
        int count = 0;
        for (int k = 1; k <= 120 * 12; k++)
        {
            var boundary = NthPeriodBoundary(fixedAnchor, periodLength, k);
            if (boundary > asOf) break;
            count++;
        }
        return count;
    }

    public static int CountSettlementPeriodsInContract(DateTime contractStart, DateTime contractEnd, int periodLength) =>
        CountBoundariesPassed(contractStart, periodLength, contractEnd, contractEnd);

    public static int PeriodsPaidCountForFee(
        decimal alreadyPaid,
        decimal feeAmount,
        int periodLength,
        DateTime contractStart,
        DateTime? contractEnd)
    {
        var perPeriod = ComputeFeeSettlementAmount(feeAmount, periodLength, contractStart, contractEnd);
        if (perPeriod <= 0) return 0;
        var ratio = (double)(alreadyPaid / perPeriod);
        var rounded = (int)Math.Round(ratio, MidpointRounding.AwayFromZero);
        if (Math.Abs(ratio - rounded) < 0.01) return rounded;
        return (int)Math.Floor(ratio);
    }

    public static int PeriodsPaidCountForTarget(DateTime fixedAnchor, int periodLength, DateTime? lastProcessDate, DateTime? contractEndDate = null, DateTime? targetEndDate = null)
    {
        if (!lastProcessDate.HasValue) return 0;
        return CountBoundariesPassed(fixedAnchor, periodLength, lastProcessDate.Value, contractEndDate, targetEndDate);
    }

    public static int PeriodsOwed(DateTime fixedAnchor, int periodLength, int periodsPaidCount, DateTime now, DateTime? contractEndDate = null, DateTime? targetEndDate = null)
    {
        var passed = CountBoundariesPassed(fixedAnchor, periodLength, now, contractEndDate, targetEndDate);
        return Math.Max(0, passed - periodsPaidCount);
    }

    public static DateTime NextScheduledBoundary(DateTime fixedAnchor, int periodLength, int periodsPaidCount) =>
        NthPeriodBoundary(fixedAnchor, periodLength, periodsPaidCount + 1);

    public static DateTime NextEligibleDate(DateTime fixedAnchor, int periodLength, int periodsPaidCount) =>
        NextScheduledBoundary(fixedAnchor, periodLength, periodsPaidCount);

    /// <summary>
    /// Inclusive calendar range of settlement cycles covered by this payment:
    /// PeriodStart = first day of the first covered cycle (anchor, or due-boundary of last paid cycle);
    /// PeriodEnd = last calendar day of the last covered cycle (day before the next due boundary),
    /// so month-overlap highlighting does not treat the following calendar month as paid.
    /// </summary>
    public static bool TryResolveCoveredPeriodRange(
        DateTime fixedAnchor,
        int periodLength,
        int periodsPaid,
        int periodsCount,
        out DateTime periodStart,
        out DateTime periodEnd)
    {
        periodStart = default;
        periodEnd = default;
        if (!IsValidPeriodLength(periodLength) || periodsPaid < 0 || periodsCount <= 0)
            return false;

        periodStart = periodsPaid == 0
            ? fixedAnchor.Date
            : NthPeriodBoundary(fixedAnchor, periodLength, periodsPaid).Date;
        // Exclusive due-boundary of last covered cycle, minus one day = inclusive last covered day.
        periodEnd = NthPeriodBoundary(fixedAnchor, periodLength, periodsPaid + periodsCount)
            .Date.AddDays(-1);
        return true;
    }

    public static bool IsAlwaysAppliedFinalCatchUpDue(
        DateTime? targetToDate,
        DateTime now,
        int periodsCount,
        decimal currentTotalAtTargetEnd,
        decimal alreadyPaid) =>
        periodsCount == 0
        && targetToDate.HasValue
        && now.Date > targetToDate.Value.Date
        && currentTotalAtTargetEnd > alreadyPaid;

    public static bool TryResolveFinalCatchUpPeriodRange(
        DateTime fixedAnchor,
        int periodLength,
        int periodsPaid,
        DateTime targetFromDate,
        DateTime targetToDate,
        out DateTime periodStart,
        out DateTime periodEnd)
    {
        periodStart = default;
        periodEnd = default;
        if (!IsValidPeriodLength(periodLength) || periodsPaid < 0)
            return false;

        periodEnd = targetToDate.Date.AddDays(-1);
        periodStart = periodsPaid == 0
            ? targetFromDate.Date
            : NthPeriodBoundary(fixedAnchor, periodLength, periodsPaid).Date;
        return periodStart <= periodEnd;
    }

    public static bool IsPeriodDue(DateTime fixedAnchor, int periodLength, int periodsPaidCount, DateTime now, DateTime? contractEndDate = null, DateTime? targetEndDate = null) =>
        PeriodsOwed(fixedAnchor, periodLength, periodsPaidCount, now, contractEndDate, targetEndDate) > 0;

    public static int CountElapsedPeriods(DateTime fixedAnchor, int periodLength, DateTime now, DateTime? contractEndDate, int periodsPaidCount = 0, DateTime? targetEndDate = null) =>
        PeriodsOwed(fixedAnchor, periodLength, periodsPaidCount, now, contractEndDate, targetEndDate);

    public static decimal ComputeFeeSettlementAmount(
        decimal feeAmount,
        int periodLength,
        DateTime contractStart,
        DateTime? contractEnd)
    {
        if (feeAmount <= 0 || periodLength < 1) return 0;
        if (!contractEnd.HasValue)
            return feeAmount / (12m / periodLength);
        var totalPeriods = CountSettlementPeriodsInContract(contractStart, contractEnd.Value, periodLength);
        if (totalPeriods <= 0) totalPeriods = 1;
        return feeAmount / totalPeriods;
    }

    public static decimal ComputeFeeProcessAmount(
        decimal feeAmount,
        int periodLength,
        decimal amountLeft,
        int periodsCount,
        DateTime contractStart,
        DateTime? contractEnd)
    {
        if (amountLeft <= 0 || periodsCount <= 0) return 0;
        var settlementAmount = ComputeFeeSettlementAmount(feeAmount, periodLength, contractStart, contractEnd);
        return Math.Min(settlementAmount * periodsCount, amountLeft);
    }

    public static string NormalizeRemarkRebateType(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return "F";
        var u = raw.Trim().ToUpperInvariant();
        if (u == "P" || u == "PERCENTAGE" || u == "PERCENT" || u == "%")
            return "P";
        return "F";
    }

    public static string BuildMonthListLabel(
        DateTime fixedAnchor,
        int periodLength,
        int periodsPaid,
        int periodsCount)
    {
        if (periodsCount <= 0 || !IsValidPeriodLength(periodLength))
            return "";

        int? lastYearShown = null;
        var cycleLabels = new List<string>();
        for (int c = periodsPaid + 1; c <= periodsPaid + periodsCount; c++)
        {
            var cycleStart = c == 1
                ? fixedAnchor.Date
                : NthPeriodBoundary(fixedAnchor, periodLength, c - 1).Date;
            var cycleEnd = NthPeriodBoundary(fixedAnchor, periodLength, c).Date.AddDays(-1);
            var cycleMonths = FormatMonthsInRange(cycleStart, cycleEnd, ref lastYearShown);
            if (!string.IsNullOrWhiteSpace(cycleMonths))
                cycleLabels.Add(cycleMonths);
        }

        return string.Join("; ", cycleLabels);
    }

    public static string BuildMonthListLabelForDateRange(DateTime fromDate, DateTime toDate)
    {
        int? lastYearShown = null;
        return FormatMonthsInRange(fromDate.Date, toDate.Date, ref lastYearShown);
    }

    public static string BuildTargetSettlementRemark(
        string? settlementTypeName,
        int fallbackTargetId,
        string? monthList,
        string? rebateType,
        decimal? rebateValue)
    {
        var name = string.IsNullOrWhiteSpace(settlementTypeName)
            ? $"SVR Target {fallbackTargetId}"
            : $"SVR Target {settlementTypeName.Trim()}";

        var middle = "";
        if (NormalizeRemarkRebateType(rebateType) == "P" && rebateValue.HasValue)
            middle = $" {FormatRemarkRebateValue(rebateValue.Value)}%";

        var suffix = string.IsNullOrWhiteSpace(monthList) ? "" : $" on {monthList.Trim()}";
        return name + middle + suffix;
    }

    public static string BuildFeeSettlementRemark(string? settlementTypeName, int fallbackFeeId, string? monthList)
    {
        var name = string.IsNullOrWhiteSpace(settlementTypeName)
            ? $"SVR Fee {fallbackFeeId}"
            : $"SVR Fee {settlementTypeName.Trim()}";

        return string.IsNullOrWhiteSpace(monthList)
            ? name
            : $"{name} on {monthList.Trim()}";
    }

    public static bool ClientHasNonZeroSalesActivity(CVR_TargetSalesDto sales, string? contractCurrency) =>
        sales.SalesQuantity != 0 || ResolveSalesBase(sales, contractCurrency) != 0;

    public static bool ClientHasNonZeroSalesActivity(CVR_TotalSalesDto sales, string? contractCurrency)
    {
        if (sales.SalesQuantity != 0) return true;
        var cur = (contractCurrency ?? "USD").Trim().ToUpperInvariant();
        return cur == "LBP" ? sales.SalesAmountLBP != 0 : sales.SalesAmountUSD != 0;
    }

    public static TargetEvaluationResult EvaluateTarget(
        CVR_Target target,
        List<CVR_TargetCondition> conditions,
        CVR_TargetSalesDto sales,
        string? contractCurrency,
        DateTime asOf)
    {
        if (IsRangeTarget(target, conditions))
            return EvaluateRangeTarget(target, conditions, sales, contractCurrency, asOf);

        if (!target.TAR_FromDate.HasValue || !target.TAR_ToDate.HasValue)
        {
            return new TargetEvaluationResult
            {
                State = "In Progress",
                InProgress = true,
                TargetAchieved = false,
                RebateAmount = 0,
            };
        }

        var inProgress = IsTargetInProgress(target.TAR_ToDate, asOf);
        var alwaysApplied = !HasFormulaConditionGroups(conditions);
        var targetAchieved = alwaysApplied || EvaluateConditionGroupsAchieved(conditions, sales);

        if (inProgress)
        {
            var rebate = alwaysApplied && targetAchieved
                ? ComputeFormulaRebate(target, sales, contractCurrency)
                : 0m;
            return new TargetEvaluationResult
            {
                State = "In Progress",
                InProgress = true,
                TargetAchieved = alwaysApplied && targetAchieved,
                RebateAmount = rebate,
                AlwaysApplied = alwaysApplied,
            };
        }

        var achieved = targetAchieved;
        var state = achieved ? "Achieved" : "Missed";
        var amount = achieved ? ComputeFormulaRebate(target, sales, contractCurrency) : 0m;
        return new TargetEvaluationResult
        {
            State = state,
            InProgress = false,
            TargetAchieved = achieved,
            RebateAmount = amount,
            AlwaysApplied = alwaysApplied,
        };
    }

    private static TargetEvaluationResult EvaluateRangeTarget(
        CVR_Target target,
        List<CVR_TargetCondition> conditions,
        CVR_TargetSalesDto sales,
        string? contractCurrency,
        DateTime asOf)
    {
        if (!target.TAR_FromDate.HasValue || !target.TAR_ToDate.HasValue)
        {
            return new TargetEvaluationResult
            {
                State = "In Progress",
                InProgress = true,
                TargetAchieved = false,
                RebateAmount = 0,
            };
        }

        var inProgress = IsTargetInProgress(target.TAR_ToDate, asOf);
        var tiers = conditions
            .Where(c => string.Equals(c.TCD_LogicalOperator, "R", StringComparison.OrdinalIgnoreCase))
            .OrderBy(c => c.TCD_Value ?? 0)
            .ToList();

        var metricType = ResolveRangeMetricType(target, tiers);
        var tierCurrency = metricType == "S" ? contractCurrency : null;
        var salesMetric = MetricForType(metricType, sales, tierCurrency);

        var exceeded = tiers
            .Where(t => t.TCD_Value.HasValue && salesMetric > t.TCD_Value.Value)
            .ToList();

        if (inProgress)
        {
            return new TargetEvaluationResult
            {
                State = "In Progress",
                InProgress = true,
                TargetAchieved = false,
                RebateAmount = 0,
            };
        }

        var achieved = exceeded.Count > 0;
        if (!achieved)
        {
            return new TargetEvaluationResult
            {
                State = "Missed",
                InProgress = false,
                TargetAchieved = false,
                RebateAmount = 0,
            };
        }

        decimal rebateAmount;
        string? remarkRebateType = null;
        decimal? remarkRebateValue = null;

        if (target.TAR_Override)
        {
            rebateAmount = exceeded.Sum(t => ComputeTierRebate(t, sales, contractCurrency));
        }
        else
        {
            var matched = MatchRangeTier(tiers, salesMetric);
            rebateAmount = matched != null ? ComputeTierRebate(matched, sales, contractCurrency) : 0m;
            if (matched != null)
            {
                remarkRebateType = NormalizeRemarkRebateType(matched.TCD_RebateType);
                remarkRebateValue = matched.TCD_RebateAmount;
            }
        }

        return new TargetEvaluationResult
        {
            State = "Achieved",
            InProgress = false,
            TargetAchieved = true,
            RebateAmount = rebateAmount,
            RemarkRebateType = remarkRebateType,
            RemarkRebateValue = remarkRebateValue,
        };
    }

    private static bool HasFormulaConditionGroups(List<CVR_TargetCondition> conditions) =>
        conditions.Any(c =>
            !string.Equals(c.TCD_LogicalOperator, "R", StringComparison.OrdinalIgnoreCase)
            && Phase1Types.Contains(c.TCD_ConditionType ?? ""));

    private static bool EvaluateConditionGroupsAchieved(List<CVR_TargetCondition> conditions, CVR_TargetSalesDto sales)
    {
        var formula = conditions
            .Where(c => !string.Equals(c.TCD_LogicalOperator, "R", StringComparison.OrdinalIgnoreCase))
            .Where(c => Phase1Types.Contains(c.TCD_ConditionType ?? ""))
            .Where(c => c.TCD_Operator != null && c.TCD_Value.HasValue)
            .ToList();

        if (formula.Count == 0) return true;

        var groups = formula
            .GroupBy(c => (int)(c.TCD_LogicalGroup ?? 1))
            .OrderBy(g => g.Key)
            .Select(g => g.ToList())
            .ToList();

        foreach (var group in groups)
        {
            var evaluable = group
                .Select(c => EvaluateCondition(c, sales))
                .Where(r => !r.Skipped)
                .ToList();
            if (evaluable.Count > 0 && evaluable.All(r => r.Passed))
                return true;
        }

        return false;
    }

    private static (bool Passed, bool Skipped) EvaluateCondition(CVR_TargetCondition c, CVR_TargetSalesDto sales)
    {
        var type = c.TCD_ConditionType ?? "";
        if (!Phase1Types.Contains(type)) return (false, true);

        var actual = MetricForType(type, sales, c.TCD_SalesAmountCurrency);
        if (!c.TCD_Value.HasValue || actual == null) return (false, false);

        var passed = ValueMeetsConstraint(actual.Value, c.TCD_Operator ?? "=", c.TCD_Value.Value);
        return (passed, false);
    }

    private static decimal? MetricForType(string? type, CVR_TargetSalesDto sales, string? conditionCurrency)
    {
        if (type == "S")
        {
            if (!string.IsNullOrWhiteSpace(conditionCurrency)
                && sales.SalesAmounts.TryGetValue(conditionCurrency.Trim().ToUpperInvariant(), out var curAmt))
                return curAmt;
            return sales.SalesAmount;
        }
        if (type == "Q") return sales.SalesQuantity;
        if (type == "G") return sales.GrowthPercentageUSD;
        return null;
    }

    private static decimal ComputeFormulaRebate(CVR_Target target, CVR_TargetSalesDto sales, string? contractCurrency)
    {
        var rebateType = string.IsNullOrWhiteSpace(target.TAR_RebateValueType)
            ? "F"
            : target.TAR_RebateValueType.Trim().ToUpperInvariant();
        var rebateValue = target.TAR_RebateValue ?? 0m;
        if (rebateType == "P")
            return ResolveSalesBase(sales, contractCurrency) * rebateValue / 100m;
        return rebateValue;
    }

    private static decimal ComputeTierRebate(CVR_TargetCondition tier, CVR_TargetSalesDto sales, string? contractCurrency)
    {
        var rebateType = string.IsNullOrWhiteSpace(tier.TCD_RebateType) ? "F" : tier.TCD_RebateType.Trim().ToUpperInvariant();
        var rebateValue = tier.TCD_RebateAmount ?? 0m;
        if (rebateType == "P")
            return ResolveSalesBase(sales, contractCurrency) * rebateValue / 100m;
        return rebateValue;
    }

    private static CVR_TargetCondition? MatchRangeTier(List<CVR_TargetCondition> tiers, decimal? salesMetric)
    {
        if (salesMetric == null) return null;
        CVR_TargetCondition? matched = null;
        foreach (var t in tiers.OrderBy(x => x.TCD_Value ?? 0))
        {
            if (t.TCD_Value.HasValue && salesMetric > t.TCD_Value.Value)
                matched = t;
        }
        return matched;
    }

    private static string? ResolveRangeMetricType(CVR_Target target, List<CVR_TargetCondition> tiers)
    {
        var fromTier = NormalizeTierConditionType(tiers.FirstOrDefault()?.TCD_ConditionType);
        if (fromTier != null) return fromTier;
        return "S";
    }

    private static string? NormalizeTierConditionType(string? raw)
    {
        var s = (raw ?? "").Trim().ToUpperInvariant();
        return s is "S" or "Q" or "G" ? s : null;
    }

    private static string? NormalizeTargetType(string? raw)
    {
        var s = (raw ?? "").Trim().ToUpperInvariant();
        if (s == "RANGE") return "R";
        return string.IsNullOrEmpty(s) ? null : s;
    }

    private static bool ValueMeetsConstraint(decimal v, string op, decimal bound)
    {
        return op switch
        {
            "=" => v == bound,
            ">" => v > bound,
            ">=" => v >= bound,
            "<" => v < bound,
            "<=" => v <= bound,
            _ => false,
        };
    }

    private static string FormatMonthsInRange(DateTime start, DateTime end, ref int? lastYearShown)
    {
        if (end.Date < start.Date)
            return "";

        var parts = new List<string>();
        var cursor = new DateTime(start.Year, start.Month, 1);
        var lastMonth = new DateTime(end.Year, end.Month, 1);
        while (cursor <= lastMonth)
        {
            var monthStart = cursor.Date;
            var monthEnd = cursor.AddMonths(1).AddDays(-1).Date;
            if (monthEnd >= start.Date && monthStart <= end.Date)
                parts.Add(FormatMonthLabel(cursor, ref lastYearShown));
            cursor = cursor.AddMonths(1);
        }

        return string.Join(", ", parts);
    }

    private static string FormatMonthLabel(DateTime month, ref int? lastYearShown)
    {
        var name = month.ToString("MMMM", CultureInfo.InvariantCulture);
        if (lastYearShown.HasValue && lastYearShown.Value != month.Year)
        {
            lastYearShown = month.Year;
            return $"{name} {month.Year}";
        }

        lastYearShown = month.Year;
        return name;
    }

    private static string FormatRemarkRebateValue(decimal value) =>
        value % 1 == 0 ? value.ToString("0", CultureInfo.InvariantCulture)
            : value.ToString("0.###", CultureInfo.InvariantCulture);
}

public class TargetEvaluationResult
{
    public string State { get; set; } = "";
    public bool InProgress { get; set; }
    public bool TargetAchieved { get; set; }
    public decimal RebateAmount { get; set; }
    public bool AlwaysApplied { get; set; }
    /// <summary>Resolved remark rebate type ("P" or "F") from matched tier for Range targets.</summary>
    public string? RemarkRebateType { get; set; }
    /// <summary>Resolved remark rebate value from matched tier; shown as % when type is "P".</summary>
    public decimal? RemarkRebateValue { get; set; }
}
