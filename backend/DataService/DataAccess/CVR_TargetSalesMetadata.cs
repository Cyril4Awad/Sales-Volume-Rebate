using DataService.Models;
using DataService.Models.DTOs;

public sealed class TargetSalesMetadata
{
    public List<decimal> StockIds { get; init; } = new();
    public List<CVR_TargetSalesReferenceDto> References { get; init; } = new();
    public string Comp { get; init; } = "01";

    public bool FilterByStock => StockIds.Count > 0;
    public string ReferenceScope => FilterByStock ? "scoped" : "all";
}

public static class CVR_TargetSalesAggregates
{
    public static CVR_TargetSalesDto AggregateFromByClient(
        Dictionary<int, CVR_TargetSalesDto> byClient,
        List<int> clientIds,
        CVR_Target target,
        TargetSalesMetadata metadata)
    {
        var targetId = (int)target.TAR_TargetID;
        var fromDate = target.TAR_FromDate?.Date;
        var toDate = target.TAR_ToDate?.Date;
        var prevFromDate = fromDate?.AddYears(-1);
        var prevToDate = toDate?.AddYears(-1);

        decimal sumUsd = 0, sumLbp = 0, sumQty = 0;
        decimal prevSumUsd = 0, prevSumLbp = 0, prevSumQty = 0;
        string? systemCurrency = null;

        foreach (var clientId in clientIds)
        {
            if (!byClient.TryGetValue(clientId, out var row))
                continue;

            if (fromDate == null && row.FromDate.HasValue)
                fromDate = row.FromDate.Value.Date;
            if (toDate == null && row.ToDate.HasValue)
                toDate = row.ToDate.Value.Date;
            if (prevFromDate == null && row.PreviousYearFromDate.HasValue)
                prevFromDate = row.PreviousYearFromDate.Value.Date;
            if (prevToDate == null && row.PreviousYearToDate.HasValue)
                prevToDate = row.PreviousYearToDate.Value.Date;

            if (row.SalesAmounts.TryGetValue("USD", out var usd))
                sumUsd += usd;
            if (row.SalesAmounts.TryGetValue("LBP", out var lbp))
                sumLbp += lbp;
            sumQty += row.SalesQuantity;

            if (row.PreviousYearSalesAmounts.TryGetValue("USD", out var prevUsd))
                prevSumUsd += prevUsd;
            if (row.PreviousYearSalesAmounts.TryGetValue("LBP", out var prevLbp))
                prevSumLbp += prevLbp;
            prevSumQty += row.PreviousYearSalesQuantity;

            systemCurrency ??= row.SystemCurrency;
        }

        decimal growthPercentageUSD = 0;
        if (prevSumUsd != 0)
            growthPercentageUSD = ((sumUsd - prevSumUsd) / prevSumUsd) * 100;

        return new CVR_TargetSalesDto
        {
            ClientId = clientIds[0],
            TargetId = targetId,
            FromDate = fromDate,
            ToDate = toDate,
            SalesAmounts = new Dictionary<string, decimal> { ["USD"] = sumUsd, ["LBP"] = sumLbp },
            SalesAmount = sumUsd,
            SalesAmountBase = sumUsd,
            SalesQuantity = sumQty,
            SystemCurrency = systemCurrency ?? "USD",
            SalesAmountCurrency = null,
            ReferenceScope = metadata.ReferenceScope,
            References = metadata.References,
            ResolvedStockItemCount = metadata.StockIds.Count,
            FetchedAt = DateTime.UtcNow,
            PreviousYearSalesAmounts = new Dictionary<string, decimal>
            {
                ["USD"] = prevSumUsd,
                ["LBP"] = prevSumLbp,
            },
            PreviousYearSalesQuantity = prevSumQty,
            GrowthPercentageUSD = growthPercentageUSD,
            PreviousYearFromDate = prevFromDate,
            PreviousYearToDate = prevToDate,
        };
    }
}
