using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Data;

public class CVRSettlementPaymentDAL
{
    private readonly IConfiguration _config;

    public CVRSettlementPaymentDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    public async Task<IEnumerable<CVR_SettlementPaymentDto>> GetByPlanIdAsync(int planId)
    {
        using var con = Con();
        const string sql = @"
SELECT
    sp.STP_SettlementPaymentID   AS SettlementPaymentID,
    sp.STP_ResultType            AS ResultType,
    sp.STP_TargetID              AS TargetID,
    sp.STP_FeeID                 AS FeeID,
    sp.STP_ContractID            AS ContractID,
    sp.STP_AmountProcessed       AS AmountProcessed,
    sp.STP_AmountLeft            AS AmountLeft,
    sp.STP_TotalAmountAtProcess  AS TotalAmountAtProcess,
    sp.STP_TotalSalesAtProcess   AS TotalSalesAtProcess,
    sp.STP_Currency              AS Currency,
    sp.STP_ProcessDate           AS ProcessDate,
    sp.STP_PeriodStart           AS PeriodStart,
    sp.STP_PeriodEnd             AS PeriodEnd
FROM CVR_SettlementPayments sp
WHERE sp.STP_TargetID IN (SELECT TAR_TargetID FROM CVR_Targets WHERE TAR_PlanID = @PlanId)
   OR sp.STP_FeeID IN (SELECT FEE_FeeID FROM CVR_Fees WHERE FEE_PlanID = @PlanId)
ORDER BY sp.STP_ProcessDate DESC, sp.STP_SettlementPaymentID DESC";

        return await con.QueryAsync<CVR_SettlementPaymentDto>(sql, new { PlanId = planId });
    }

    public async Task<IEnumerable<CVR_SettlementPaymentDto>> GetByTargetIdAsync(int targetId)
    {
        using var con = Con();
        return await con.QueryAsync<CVR_SettlementPaymentDto>(@"
SELECT
    STP_SettlementPaymentID   AS SettlementPaymentID,
    STP_ResultType            AS ResultType,
    STP_TargetID              AS TargetID,
    STP_FeeID                 AS FeeID,
    STP_ContractID            AS ContractID,
    STP_AmountProcessed       AS AmountProcessed,
    STP_AmountLeft            AS AmountLeft,
    STP_TotalAmountAtProcess  AS TotalAmountAtProcess,
    STP_TotalSalesAtProcess   AS TotalSalesAtProcess,
    STP_Currency              AS Currency,
    STP_ProcessDate           AS ProcessDate,
    STP_PeriodStart           AS PeriodStart,
    STP_PeriodEnd             AS PeriodEnd
FROM CVR_SettlementPayments
WHERE STP_ResultType = 'T' AND STP_TargetID = @TargetId
ORDER BY STP_ProcessDate ASC, STP_SettlementPaymentID ASC",
            new { TargetId = targetId });
    }

    public async Task<IEnumerable<CVR_SettlementPaymentDto>> GetByFeeIdAsync(int feeId)
    {
        using var con = Con();
        return await con.QueryAsync<CVR_SettlementPaymentDto>(@"
SELECT
    STP_SettlementPaymentID   AS SettlementPaymentID,
    STP_ResultType            AS ResultType,
    STP_TargetID              AS TargetID,
    STP_FeeID                 AS FeeID,
    STP_ContractID            AS ContractID,
    STP_AmountProcessed       AS AmountProcessed,
    STP_AmountLeft            AS AmountLeft,
    STP_TotalAmountAtProcess  AS TotalAmountAtProcess,
    STP_TotalSalesAtProcess   AS TotalSalesAtProcess,
    STP_Currency              AS Currency,
    STP_ProcessDate           AS ProcessDate,
    STP_PeriodStart           AS PeriodStart,
    STP_PeriodEnd             AS PeriodEnd
FROM CVR_SettlementPayments
WHERE STP_ResultType = 'F' AND STP_FeeID = @FeeId
ORDER BY STP_ProcessDate ASC, STP_SettlementPaymentID ASC",
            new { FeeId = feeId });
    }

    public async Task<CVR_Target?> GetTargetAsync(int targetId)
    {
        using var con = Con();
        return await con.QueryFirstOrDefaultAsync<CVR_Target>(
            "SELECT * FROM CVR_Targets WHERE TAR_TargetID = @TargetId",
            new { TargetId = targetId });
    }

    public async Task<List<CVR_TargetCondition>> GetTargetConditionsAsync(int targetId)
    {
        using var con = Con();
        var rows = await con.QueryAsync<CVR_TargetCondition>(
            "SELECT * FROM CVR_TargetConditions WHERE TCD_TargetID = @TargetId",
            new { TargetId = targetId });
        return rows.ToList();
    }

    public async Task<CVR_Fee?> GetFeeAsync(int feeId)
    {
        using var con = Con();
        return await con.QueryFirstOrDefaultAsync<CVR_Fee>(
            "SELECT * FROM CVR_Fees WHERE FEE_FeeID = @FeeId",
            new { FeeId = feeId });
    }

    public async Task<int?> GetSettlementPeriodLengthAsync(int? settlementTypeId)
    {
        if (!settlementTypeId.HasValue || settlementTypeId <= 0) return null;
        using var con = Con();
        return await con.ExecuteScalarAsync<int?>(
            "SELECT STT_PeriodLength FROM CVR_SettlementTypes WHERE STT_SettlementTypeID = @Id",
            new { Id = settlementTypeId.Value });
    }

    public async Task<string?> GetSettlementTypeNameAsync(int? settlementTypeId)
    {
        if (!settlementTypeId.HasValue || settlementTypeId <= 0) return null;
        using var con = Con();
        return await con.ExecuteScalarAsync<string?>(
            "SELECT STT_SettlementTypeName FROM CVR_SettlementTypes WHERE STT_SettlementTypeID = @Id",
            new { Id = settlementTypeId.Value });
    }

    public async Task<DateTime?> GetContractStartDateByPlanIdAsync(int planId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<DateTime?>(@"
SELECT c.CTR_StartDate
FROM CVR_Plans p
INNER JOIN CVR_Contracts c ON c.CTR_ContractID = p.PLN_ContractID
WHERE p.PLN_PlanID = @PlanId",
            new { PlanId = planId });
    }

    public async Task<DateTime?> GetContractEndDateByPlanIdAsync(int planId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<DateTime?>(@"
SELECT c.CTR_EndDate
FROM CVR_Plans p
INNER JOIN CVR_Contracts c ON c.CTR_ContractID = p.PLN_ContractID
WHERE p.PLN_PlanID = @PlanId",
            new { PlanId = planId });
    }

    public async Task<long?> GetContractIdByPlanIdAsync(int planId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<long?>(@"
SELECT p.PLN_ContractID
FROM CVR_Plans p
WHERE p.PLN_PlanID = @PlanId",
            new { PlanId = planId });
    }

    public async Task<ContractMainClientDto?> GetContractMainClientAsync(long contractId)
    {
        using var con = Con();
        return await con.QueryFirstOrDefaultAsync<ContractMainClientDto>(@"
SELECT
    c.CTR_ClientID AS ClientId,
    ISNULL(cl.CL_Name, '') AS ClientName
FROM CVR_Contracts c
LEFT JOIN stk04_clients cl ON cl.CL_RecID = c.CTR_ClientID
WHERE c.CTR_ContractID = @ContractId",
            new { ContractId = contractId });
    }

    public async Task<bool> ExistsForContractAsync(long contractId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<bool>(@"
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM CVR_SettlementPayments WHERE STP_ContractID = @ContractId
) THEN 1 ELSE 0 END",
            new { ContractId = contractId });
    }

    public async Task<string?> GetContractCurrencyByPlanIdAsync(int planId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<string?>(@"
SELECT c.CTR_ContractCurrency
FROM CVR_Plans p
INNER JOIN CVR_Contracts c ON c.CTR_ContractID = p.PLN_ContractID
WHERE p.PLN_PlanID = @PlanId",
            new { PlanId = planId });
    }

    public async Task<int> InsertAsync(CVR_SettlementPaymentDto row, string user, IDbTransaction? tx = null, IDbConnection? connection = null)
    {
        const string sql = @"
INSERT INTO CVR_SettlementPayments
    (STP_ResultType, STP_TargetID, STP_FeeID, STP_ContractID,
     STP_AmountProcessed, STP_AmountLeft, STP_TotalAmountAtProcess,
     STP_TotalSalesAtProcess, STP_Currency, STP_ProcessDate,
     STP_PeriodStart, STP_PeriodEnd,
     STP_CDStamp, STP_CUStamp, STP_MDStamp, STP_MUStamp)
VALUES
    (@ResultType, @TargetID, @FeeID, @ContractID,
     @AmountProcessed, @AmountLeft, @TotalAmountAtProcess,
     @TotalSalesAtProcess, @Currency, @ProcessDate,
     @PeriodStart, @PeriodEnd,
     GETDATE(), @User, GETDATE(), @User);
SELECT CAST(SCOPE_IDENTITY() AS int);";

        var param = new
        {
            row.ResultType,
            row.TargetID,
            row.FeeID,
            row.ContractID,
            row.AmountProcessed,
            row.AmountLeft,
            row.TotalAmountAtProcess,
            row.TotalSalesAtProcess,
            row.Currency,
            ProcessDate = row.ProcessDate.Date,
            PeriodStart = row.PeriodStart?.Date,
            PeriodEnd = row.PeriodEnd?.Date,
            User = user,
        };

        if (tx != null && connection != null)
            return await connection.ExecuteScalarAsync<int>(sql, param, tx);

        using var con = Con();
        return await con.ExecuteScalarAsync<int>(sql, param);
    }

    public async Task InsertBatchAsync(IEnumerable<CVR_SettlementPaymentDto> rows, string user)
    {
        using var con = Con();
        await con.OpenAsync();
        using var tx = con.BeginTransaction();
        try
        {
            foreach (var row in rows)
                await InsertAsync(row, user, tx, con);
            tx.Commit();
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }
}
