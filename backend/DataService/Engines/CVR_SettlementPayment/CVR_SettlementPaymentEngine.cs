using DataService.Legacy.POS;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

// Settlement endpoints intentionally bypass computation lock — payouts continue on live data.

public class CVRSettlementPaymentEngine
{
    private readonly CVRSettlementPaymentDAL _dal;
    private readonly CVRComputationDAL _computationDal;
    private readonly CVRSavedComputationDAL _savedComputationDal;
    private readonly POSCreditNote _posCreditNote;
    private readonly CVRLookupsDAL _lookups;
    private readonly IConfiguration _config;

    public CVRSettlementPaymentEngine(
        CVRSettlementPaymentDAL dal,
        CVRComputationDAL computationDal,
        CVRSavedComputationDAL savedComputationDal,
        POSCreditNote posCreditNote,
        CVRLookupsDAL lookups,
        IConfiguration config)
    {
        _dal = dal;
        _computationDal = computationDal;
        _savedComputationDal = savedComputationDal;
        _posCreditNote = posCreditNote;
        _lookups = lookups;
        _config = config;
    }

    public Task<IEnumerable<CVR_SettlementPaymentDto>> GetByPlanIdAsync(int planId) =>
        _dal.GetByPlanIdAsync(planId);

    public Task<bool> HasPaymentsForContractAsync(long contractId) =>
        _dal.ExistsForContractAsync(contractId);

    public async Task<CVR_SettlementPaymentDto> ProcessTargetAsync(
        CVR_ProcessTargetSettlementRequest request, string user)
    {
        if (request.TargetId <= 0)
            throw new InvalidOperationException("targetId is required.");
        if (request.ClientIds == null || request.ClientIds.Count == 0)
            throw new InvalidOperationException("At least one clientId is required.");

        if (!await _savedComputationDal.ExistsComputationForTargetAsync(request.TargetId))
            throw new InvalidOperationException("Save the computation before processing settlement for this target.");

        var target = await _dal.GetTargetAsync(request.TargetId)
            ?? throw new InvalidOperationException($"Target {request.TargetId} was not found.");

        var conditions = await _dal.GetTargetConditionsAsync(request.TargetId);
        var existing = (await _dal.GetByTargetIdAsync(request.TargetId)).ToList();
        var alreadyPaid = existing.Sum(p => p.AmountProcessed);

        var planId = (int)(target.TAR_PlanID ?? 0);
        var contractId = planId > 0
            ? await _dal.GetContractIdByPlanIdAsync(planId)
            : null;
        if (!contractId.HasValue || contractId.Value <= 0)
            throw new InvalidOperationException("Unable to resolve contract for this target.");

        var contractCurrency = planId > 0
            ? await _dal.GetContractCurrencyByPlanIdAsync(planId) ?? "USD"
            : "USD";

        var periodLength = await _dal.GetSettlementPeriodLengthAsync((int?)target.TAR_SettlementTypeID);
        var now = DateTime.Now;
        var isConditioned = SettlementPaymentCalculator.IsConditionedTarget(target, conditions);

        DateTime? periodStart = null;
        DateTime? periodEnd = null;
        DateTime fixedAnchor = default;
        int periodsPaid = 0;
        int periodsCount = 0;
        var isFinalCatchUp = false;

        if (isConditioned)
        {
            if (SettlementPaymentCalculator.IsTargetInProgress(target.TAR_ToDate, now))
                throw new InvalidOperationException("Target is still in progress.");

            if (existing.Count > 0 || alreadyPaid > 0)
                throw new InvalidOperationException("Target has already been fully settled.");

            if (target.TAR_FromDate.HasValue && target.TAR_ToDate.HasValue)
            {
                periodStart = target.TAR_FromDate.Value.Date;
                periodEnd = target.TAR_ToDate.Value.Date;
            }
        }
        else
        {
            if (!SettlementPaymentCalculator.IsValidPeriodLength(periodLength))
                throw new InvalidOperationException("Settlement type has an invalid period length.");

            var contractEnd = planId > 0
                ? await _dal.GetContractEndDateByPlanIdAsync(planId)
                : null;

            var targetEnd = target.TAR_ToDate;
            fixedAnchor = target.TAR_FromDate!.Value;
            var lastProcessDate = existing.LastOrDefault()?.ProcessDate;
            periodsPaid = SettlementPaymentCalculator.PeriodsPaidCountForTarget(
                fixedAnchor, periodLength!.Value, lastProcessDate, contractEnd, targetEnd);
            periodsCount = SettlementPaymentCalculator.PeriodsOwed(
                fixedAnchor, periodLength!.Value, periodsPaid, now, contractEnd, targetEnd);

            if (periodsCount > 0
                && SettlementPaymentCalculator.TryResolveCoveredPeriodRange(
                    fixedAnchor, periodLength.Value, periodsPaid, periodsCount,
                    out var resolvedStart, out var resolvedEnd))
            {
                periodStart = resolvedStart;
                periodEnd = resolvedEnd;
            }
        }

        // Always Applied normal cycle: cap to last closed settlement cycle (exclusive end).
        // Always Applied final catch-up + Conditioned/Range: sales through TAR_ToDate.
        DateTime effectiveToDate;
        if (isConditioned)
        {
            effectiveToDate = target.TAR_ToDate!.Value.Date;
        }
        else if (periodsCount > 0)
        {
            if (!periodEnd.HasValue)
                throw new InvalidOperationException("Unable to resolve the closed settlement period for this target.");
            effectiveToDate = periodEnd.Value.Date.AddDays(1);
        }
        else if (target.TAR_ToDate.HasValue && now.Date > target.TAR_ToDate.Value.Date)
        {
            effectiveToDate = target.TAR_ToDate.Value.Date;
        }
        else
        {
            var next = SettlementPaymentCalculator.NextEligibleDate(fixedAnchor, periodLength!.Value, periodsPaid);
            throw new InvalidOperationException($"Next settlement available starting {next:yyyy-MM-dd}.");
        }

        var sales = await _computationDal.GetTargetSalesAsync(
            request.ClientIds, request.TargetId, null, effectiveToDate)
            ?? throw new InvalidOperationException("Unable to load target sales.");

        var evaluation = SettlementPaymentCalculator.EvaluateTarget(
            target, conditions, sales, contractCurrency, now);

        if (isConditioned)
        {
            if (evaluation.State == "Missed")
                throw new InvalidOperationException("Target was missed. There is no rebate to process.");
            if (evaluation.State != "Achieved" || evaluation.RebateAmount <= 0)
                throw new InvalidOperationException("Target is not eligible for settlement.");
        }
        else if (periodsCount == 0)
        {
            if (!SettlementPaymentCalculator.IsAlwaysAppliedFinalCatchUpDue(
                    target.TAR_ToDate, now, periodsCount, evaluation.RebateAmount, alreadyPaid))
            {
                if (target.TAR_ToDate.HasValue && now.Date > target.TAR_ToDate.Value.Date)
                {
                    throw new InvalidOperationException(
                        $"Target ended on {target.TAR_ToDate.Value:yyyy-MM-dd}; no further settlements are due.");
                }

                var next = SettlementPaymentCalculator.NextEligibleDate(fixedAnchor, periodLength!.Value, periodsPaid);
                throw new InvalidOperationException($"Next settlement available starting {next:yyyy-MM-dd}.");
            }

            if (!target.TAR_FromDate.HasValue || !target.TAR_ToDate.HasValue
                || !SettlementPaymentCalculator.TryResolveFinalCatchUpPeriodRange(
                    fixedAnchor, periodLength!.Value, periodsPaid,
                    target.TAR_FromDate.Value, target.TAR_ToDate.Value,
                    out var trailingStart, out var trailingEnd))
            {
                throw new InvalidOperationException("Unable to resolve the trailing settlement period for this target.");
            }

            isFinalCatchUp = true;
            periodStart = trailingStart;
            periodEnd = trailingEnd;
        }

        var currentTotal = SettlementPaymentCalculator.TruncateMoney2(evaluation.RebateAmount);
        var amountProcessed = SettlementPaymentCalculator.TruncateMoney2(
            isConditioned ? currentTotal : currentTotal - alreadyPaid);
        if (amountProcessed <= 0)
            throw new InvalidOperationException("No amount available to process.");

        var totalSales = SettlementPaymentCalculator.TruncateMoney2(
            SettlementPaymentCalculator.ResolveSalesBase(sales, contractCurrency));

        string? remarkRebateType;
        decimal? remarkRebateValue;
        if (SettlementPaymentCalculator.IsRangeTarget(target, conditions))
        {
            remarkRebateType = evaluation.RemarkRebateType;
            remarkRebateValue = evaluation.RemarkRebateValue;
        }
        else
        {
            remarkRebateType = SettlementPaymentCalculator.NormalizeRemarkRebateType(target.TAR_RebateValueType);
            remarkRebateValue = target.TAR_RebateValue;
        }

        string monthList;
        if (isConditioned)
        {
            monthList = target.TAR_FromDate.HasValue && target.TAR_ToDate.HasValue
                ? SettlementPaymentCalculator.BuildMonthListLabelForDateRange(
                    target.TAR_FromDate.Value, target.TAR_ToDate.Value)
                : "";
        }
        else if (isFinalCatchUp && periodStart.HasValue && periodEnd.HasValue)
        {
            monthList = SettlementPaymentCalculator.BuildMonthListLabelForDateRange(
                periodStart.Value, periodEnd.Value);
        }
        else
        {
            monthList = SettlementPaymentCalculator.BuildMonthListLabel(
                fixedAnchor, periodLength!.Value, periodsPaid, periodsCount);
        }

        var settlementTypeName = await _dal.GetSettlementTypeNameAsync((int?)target.TAR_SettlementTypeID);
        var targetRemark = SettlementPaymentCalculator.BuildTargetSettlementRemark(
            settlementTypeName,
            request.TargetId,
            monthList,
            remarkRebateType,
            remarkRebateValue);

        var row = new CVR_SettlementPaymentDto
        {
            ResultType = "T",
            TargetID = request.TargetId,
            FeeID = null,
            ContractID = contractId.Value,
            AmountProcessed = amountProcessed,
            AmountLeft = 0,
            TotalAmountAtProcess = currentTotal,
            TotalSalesAtProcess = totalSales,
            Currency = contractCurrency,
            ProcessDate = DateTime.Today,
            PeriodStart = periodStart,
            PeriodEnd = periodEnd,
        };

        // Resolve POS lookups read-only before opening the write transaction.
        var posCtx = await ResolvePosCreditNoteContextAsync(contractId.Value);

        using var con = new SqlConnection(_config.GetConnectionString("Constr"));
        await con.OpenAsync();
        using var tx = con.BeginTransaction();
        try
        {
            var id = await _dal.InsertAsync(row, user, tx, con);
            row.SettlementPaymentID = id;

            using var cmsql = con.CreateCommand();
            cmsql.Transaction = tx;
            InsertPosCreditNote(
                cmsql,
                posCtx,
                (double)row.AmountProcessed,
                row.Currency,
                user,
                targetRemark);

            tx.Commit();
            return row;
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    public async Task<IReadOnlyList<CVR_SettlementPaymentDto>> ProcessFeesBatchAsync(
        CVR_ProcessFeesSettlementBatchRequest request, string user)
    {
        if (request.FeeIds == null || request.FeeIds.Count == 0)
            throw new InvalidOperationException("At least one fee is required.");

        var rows = new List<CVR_SettlementPaymentDto>();
        var feeRemarksById = new Dictionary<int, string>();
        var now = DateTime.Now;
        long? batchContractId = null;

        foreach (var feeId in request.FeeIds)
        {
            if (feeId <= 0)
                throw new InvalidOperationException("Each fee requires a valid feeId.");

            if (!await _savedComputationDal.ExistsComputationForFeeAsync(feeId))
                throw new InvalidOperationException($"Save the computation before processing settlement for fee {feeId}.");

            var fee = await _dal.GetFeeAsync(feeId)
                ?? throw new InvalidOperationException($"Fee {feeId} was not found.");

            var planId = (int)(fee.FEE_PlanID ?? 0);
            var contractId = planId > 0
                ? await _dal.GetContractIdByPlanIdAsync(planId)
                : null;
            if (!contractId.HasValue || contractId.Value <= 0)
                throw new InvalidOperationException($"Unable to resolve contract for fee {feeId}.");

            if (batchContractId == null)
                batchContractId = contractId.Value;
            else if (batchContractId.Value != contractId.Value)
                throw new InvalidOperationException("All fees in a batch must belong to the same contract.");

            var existing = (await _dal.GetByFeeIdAsync(feeId)).ToList();
            var alreadyPaid = existing.Sum(p => p.AmountProcessed);
            var feeAmount = fee.FEE_Amount ?? 0m;
            var amountLeft = feeAmount - alreadyPaid;

            if (amountLeft <= 0)
                throw new InvalidOperationException($"Fee {feeId} is already fully settled.");

            var periodLength = await _dal.GetSettlementPeriodLengthAsync((int?)fee.FEE_SettlementType);
            if (!SettlementPaymentCalculator.IsValidPeriodLength(periodLength))
                throw new InvalidOperationException($"Fee {feeId} has an invalid settlement period length.");

            var planIdForDates = planId;
            var contractStart = planIdForDates > 0
                ? await _dal.GetContractStartDateByPlanIdAsync(planIdForDates)
                : null;
            if (!contractStart.HasValue)
                throw new InvalidOperationException($"Unable to resolve contract start date for fee {feeId}.");

            var contractEnd = planIdForDates > 0
                ? await _dal.GetContractEndDateByPlanIdAsync(planIdForDates)
                : null;

            var fixedAnchor = contractStart.Value;
            var periodsPaid = SettlementPaymentCalculator.PeriodsPaidCountForFee(
                alreadyPaid, feeAmount, periodLength!.Value, fixedAnchor, contractEnd);
            var periodsCount = SettlementPaymentCalculator.PeriodsOwed(
                fixedAnchor, periodLength!.Value, periodsPaid, now, contractEnd);

            if (periodsCount == 0)
            {
                var next = SettlementPaymentCalculator.NextEligibleDate(fixedAnchor, periodLength.Value, periodsPaid);
                throw new InvalidOperationException($"Fee {feeId} next settlement available starting {next:dd-MM-yyyy}.");
            }

            var processAmount = SettlementPaymentCalculator.TruncateMoney2(
                SettlementPaymentCalculator.ComputeFeeProcessAmount(
                    feeAmount, periodLength.Value, amountLeft, periodsCount, fixedAnchor, contractEnd));
            if (processAmount <= 0)
                throw new InvalidOperationException($"Fee {feeId} has no amount available to process.");

            DateTime? feePeriodStart = null;
            DateTime? feePeriodEnd = null;
            if (SettlementPaymentCalculator.TryResolveCoveredPeriodRange(
                    fixedAnchor, periodLength.Value, periodsPaid, periodsCount,
                    out var resolvedStart, out var resolvedEnd))
            {
                feePeriodStart = resolvedStart;
                feePeriodEnd = resolvedEnd;
            }

            var currency = string.IsNullOrWhiteSpace(fee.FEE_Currency) ? "USD" : fee.FEE_Currency.Trim().ToUpperInvariant();
            var monthList = SettlementPaymentCalculator.BuildMonthListLabel(
                fixedAnchor, periodLength!.Value, periodsPaid, periodsCount);
            var feeSettlementTypeName = await _dal.GetSettlementTypeNameAsync((int?)fee.FEE_SettlementType);
            feeRemarksById[feeId] = SettlementPaymentCalculator.BuildFeeSettlementRemark(
                feeSettlementTypeName, feeId, monthList);

            rows.Add(new CVR_SettlementPaymentDto
            {
                ResultType = "F",
                TargetID = null,
                FeeID = feeId,
                ContractID = contractId.Value,
                AmountProcessed = processAmount,
                AmountLeft = SettlementPaymentCalculator.TruncateMoney2(amountLeft - processAmount),
                TotalAmountAtProcess = SettlementPaymentCalculator.TruncateMoney2(feeAmount),
                TotalSalesAtProcess = null,
                Currency = currency,
                ProcessDate = DateTime.Today,
                PeriodStart = feePeriodStart,
                PeriodEnd = feePeriodEnd,
            });
        }

        // Resolve POS lookups read-only before opening the write transaction.
        var posCtx = await ResolvePosCreditNoteContextAsync(batchContractId!.Value);

        using var con = new SqlConnection(_config.GetConnectionString("Constr"));
        await con.OpenAsync();
        using var tx = con.BeginTransaction();
        try
        {
            foreach (var row in rows)
            {
                var id = await _dal.InsertAsync(row, user, tx, con);
                row.SettlementPaymentID = id;

                var feeId = row.FeeID ?? 0;
                if (!feeRemarksById.TryGetValue(feeId, out var feeRemark))
                    feeRemark = SettlementPaymentCalculator.BuildFeeSettlementRemark(null, feeId, null);

                using var cmsql = con.CreateCommand();
                cmsql.Transaction = tx;
                InsertPosCreditNote(
                    cmsql,
                    posCtx,
                    (double)row.AmountProcessed,
                    row.Currency,
                    user,
                    feeRemark);
            }

            tx.Commit();
            return rows;
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    private sealed class PosCreditNoteContext
    {
        public required string LocationCode { get; init; }
        public required string CashReg { get; init; }
        public required string Prefix { get; init; }
        public required int ClientRecId { get; init; }
        public required string ClientName { get; init; }
        public required PosoAppCompDto Poso { get; init; }
        public required string ComputerName { get; init; }
    }

    private async Task<PosCreditNoteContext> ResolvePosCreditNoteContextAsync(long contractId)
    {
        var locationCode = _config["Location"]?.Trim();
        if (string.IsNullOrWhiteSpace(locationCode))
            throw new InvalidOperationException("Location is not configured.");

        var cashReg = _config["CashReg"]?.Trim();
        if (string.IsNullOrWhiteSpace(cashReg))
            throw new InvalidOperationException("CashReg is not configured.");

        var prefix = _config["Prefix"]?.Trim();
        if (string.IsNullOrWhiteSpace(prefix))
            throw new InvalidOperationException("Prefix is not configured.");

        var poso = await _lookups.GetPosoAppCompAsync();
        var computerName = await _lookups.GetCashRegComputerNameAsync(locationCode, cashReg);
        var client = await _dal.GetContractMainClientAsync(contractId)
            ?? throw new InvalidOperationException($"Main client not found for contract {contractId}.");

        if (client.ClientId <= 0)
            throw new InvalidOperationException($"Main client not found for contract {contractId}.");

        return new PosCreditNoteContext
        {
            LocationCode = locationCode,
            CashReg = cashReg,
            Prefix = prefix,
            ClientRecId = client.ClientId,
            ClientName = client.ClientName ?? string.Empty,
            Poso = poso,
            ComputerName = computerName,
        };
    }

    private void InsertPosCreditNote(
        SqlCommand cmsql,
        PosCreditNoteContext ctx,
        double amount,
        string currency,
        string user,
        string remark)
    {
        _posCreditNote.InsertCreditNote(
            cmsql,
            ctx.LocationCode,
            ctx.ClientRecId,
            ctx.ClientName,
            ctx.CashReg,
            ctx.Prefix,
            amount,
            currency,
            DateTime.Today,
            "POSO",
            ctx.Poso.Comp,
            ctx.Poso.Year,
            user,
            ctx.Poso.Curr1,
            ctx.Poso.Curr2,
            ctx.ComputerName,
            remark);
    }
}
