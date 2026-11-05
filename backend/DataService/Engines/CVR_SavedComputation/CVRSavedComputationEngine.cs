using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CVRSavedComputationEngine
{
    private readonly CVRSavedComputationDAL _dal;
    private readonly CVRComputationDAL _computationDal;
    private readonly IConfiguration _config;

    public CVRSavedComputationEngine(
        CVRSavedComputationDAL dal,
        CVRComputationDAL computationDal,
        IConfiguration config)
    {
        _dal = dal;
        _computationDal = computationDal;
        _config = config;
    }

    public Task<bool> IsContractLockedAsync(long contractId) =>
        _dal.IsContractLockedAsync(contractId);

    public Task<Dictionary<long, CVR_ContractLockStatusDto>> GetLockStatusBatchAsync(IEnumerable<long> contractIds) =>
        _dal.GetLockStatusBatchAsync(contractIds);

    public async Task EnsureContractNotLockedAsync(long contractId)
    {
        if (await _dal.IsContractLockedAsync(contractId))
            throw new InvalidOperationException(CVRSavedComputationDAL.LockedMessage);
    }

    public async Task<CVR_SaveComputationResultDto> SavePlanComputationsAsync(int planId, string user)
    {
        if (planId <= 0)
            throw new InvalidOperationException("planId is required.");

        var ctx = await _dal.GetPlanSaveContextAsync(planId)
            ?? throw new InvalidOperationException($"Plan {planId} was not found.");

        if (!ctx.ContractStartDate.HasValue || !ctx.ContractEndDate.HasValue)
            throw new InvalidOperationException("Contract start and end dates are required to save computations.");

        var contractId = ctx.ContractId;
        var contractCurrency = string.IsNullOrWhiteSpace(ctx.ContractCurrency)
            ? "USD"
            : ctx.ContractCurrency.Trim().ToUpperInvariant();
        var clientIds = await _dal.GetAllClientIdsForContractAsync(contractId, ctx.MainClientId);
        if (clientIds.Count == 0)
            throw new InvalidOperationException("No clients found for this contract.");

        var targets = await _dal.GetTargetsByPlanIdAsync(planId);
        var fees = await _dal.GetFeesByPlanIdAsync(planId);
        if (targets.Count == 0 && fees.Count == 0)
            throw new InvalidOperationException("No targets or fees found for this plan.");

        var now = DateTime.Now;
        var targetCount = 0;
        var feeCount = 0;
        var snapshotCount = 0;

        var comp = await _computationDal.GetAppCompAsync();
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));
        await con.OpenAsync();
        using var tx = con.BeginTransaction();

        try
        {
            foreach (var target in targets)
            {
                var targetId = (int)target.TAR_TargetID;
                var conditionsTask = _dal.GetTargetConditionsAsync(targetId);
                var metadataTask = _computationDal.LoadTargetSalesMetadataAsync(targetId, comp);
                await Task.WhenAll(conditionsTask, metadataTask);
                var conditions = conditionsTask.Result;
                var metadata = metadataTask.Result;

                var salesByClient = await _computationDal.GetTargetSalesByClientBatchAsync(
                    clientIds, target, metadata);
                var sales = CVR_TargetSalesAggregates.AggregateFromByClient(
                    salesByClient, clientIds, target, metadata);

                var evaluation = SettlementPaymentCalculator.EvaluateTarget(
                    target, conditions, sales, contractCurrency, now);

                var salesAmount = SettlementPaymentCalculator.ResolveSalesBase(sales, contractCurrency);
                var previousYear = ResolvePreviousYearAmount(sales, contractCurrency);

                var computationId = await _dal.UpsertTargetComputationAsync(con, tx, new CVR_ComputationUpsertDto
                {
                    ContractId = contractId,
                    TargetId = targetId,
                    SalesAmount = salesAmount,
                    SalesQty = sales.SalesQuantity,
                    PreviousYearSalesAmount = previousYear,
                    Growth = sales.GrowthPercentageUSD,
                    RebateAmount = evaluation.RebateAmount,
                    Currency = contractCurrency,
                    DateFrom = target.TAR_FromDate,
                    DateTo = now,
                }, user);
                targetCount++;

                foreach (var clientId in clientIds)
                {
                    if (!salesByClient.TryGetValue(clientId, out var clientSales)) continue;
                    if (!SettlementPaymentCalculator.ClientHasNonZeroSalesActivity(clientSales, contractCurrency))
                        continue;

                    await _dal.InsertSalesSnapshotAsync(con, tx, new CVR_SalesSnapshotInsertDto
                    {
                        ComputationId = computationId,
                        ClientId = clientId,
                        SalesAmount = SettlementPaymentCalculator.ResolveSalesBase(clientSales, contractCurrency),
                        SalesQty = clientSales.SalesQuantity,
                        PreviousYearSalesAmount = ResolvePreviousYearAmount(clientSales, contractCurrency),
                        Growth = clientSales.GrowthPercentageUSD,
                        Currency = contractCurrency,
                    }, user);
                    snapshotCount++;
                }
            }

            var feeAggregateSales = await _computationDal.GetTotalClientSalesAsync(
                clientIds, ctx.ContractStartDate.Value, ctx.ContractEndDate.Value);
            var feeAggregateAmount = ResolveTotalSalesAmount(feeAggregateSales, contractCurrency);

            foreach (var fee in fees)
            {
                var feeId = (int)fee.FEE_FeeID;
                var feeCurrency = string.IsNullOrWhiteSpace(fee.FEE_Currency)
                    ? contractCurrency
                    : fee.FEE_Currency.Trim().ToUpperInvariant();

                await _dal.UpsertFeeComputationAsync(con, tx, new CVR_ComputationUpsertDto
                {
                    ContractId = contractId,
                    FeeId = feeId,
                    SalesAmount = feeAggregateAmount,
                    SalesQty = feeAggregateSales.SalesQuantity,
                    PreviousYearSalesAmount = 0,
                    Growth = 0,
                    RebateAmount = fee.FEE_Amount ?? 0,
                    Currency = feeCurrency,
                    DateFrom = ctx.ContractStartDate,
                    DateTo = now,
                }, user);
                feeCount++;
            }

            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }

        return new CVR_SaveComputationResultDto
        {
            PlanId = planId,
            ContractId = contractId,
            TargetCount = targetCount,
            FeeCount = feeCount,
            SnapshotCount = snapshotCount,
            Locked = true,
        };
    }

    private static decimal ResolvePreviousYearAmount(CVR_TargetSalesDto sales, string contractCurrency)
    {
        var cur = contractCurrency.Trim().ToUpperInvariant();
        if (sales.PreviousYearSalesAmounts.TryGetValue(cur, out var amt))
            return amt;
        if (sales.PreviousYearSalesAmounts.TryGetValue("USD", out var usd))
            return usd;
        return 0;
    }

    private static decimal ResolveTotalSalesAmount(CVR_TotalSalesDto sales, string contractCurrency) =>
        contractCurrency.Trim().ToUpperInvariant() == "LBP"
            ? sales.SalesAmountLBP
            : sales.SalesAmountUSD;
}
