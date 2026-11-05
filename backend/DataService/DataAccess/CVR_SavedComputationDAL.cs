using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Data;

public class CVRSavedComputationDAL
{
    private readonly IConfiguration _config;

    public CVRSavedComputationDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    public const string LockedMessage = "Contract is locked after computation save.";

    public async Task<bool> IsContractLockedAsync(long contractId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<bool>(@"
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM CVR_Computations WHERE CMP_ContractID = @ContractId
) THEN 1 ELSE 0 END",
            new { ContractId = contractId });
    }

    public async Task<bool> ExistsComputationForTargetAsync(int targetId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<bool>(@"
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM CVR_Computations WHERE CMP_TargetID = @TargetId
) THEN 1 ELSE 0 END",
            new { TargetId = targetId });
    }

    public async Task<bool> ExistsComputationForFeeAsync(int feeId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<bool>(@"
SELECT CASE WHEN EXISTS (
    SELECT 1 FROM CVR_Computations WHERE CMP_FeeID = @FeeId
) THEN 1 ELSE 0 END",
            new { FeeId = feeId });
    }

    public async Task<Dictionary<long, CVR_ContractLockStatusDto>> GetLockStatusBatchAsync(IEnumerable<long> contractIds)
    {
        var ids = contractIds?.Where(id => id > 0).Distinct().ToList() ?? new List<long>();
        var result = ids.ToDictionary(id => id, _ => new CVR_ContractLockStatusDto { Locked = false });

        if (ids.Count == 0) return result;

        using var con = Con();
        var rows = await con.QueryAsync<(long ContractId, DateTime? FirstSavedAt)>(@"
SELECT CMP_ContractID AS ContractId, MIN(CMP_CDStamp) AS FirstSavedAt
FROM CVR_Computations
WHERE CMP_ContractID IN @ContractIds
GROUP BY CMP_ContractID",
            new { ContractIds = ids });

        foreach (var row in rows)
        {
            result[row.ContractId] = new CVR_ContractLockStatusDto
            {
                Locked = true,
                FirstSavedAt = row.FirstSavedAt,
            };
        }

        return result;
    }

    public async Task<CVR_PlanSaveContext?> GetPlanSaveContextAsync(int planId)
    {
        using var con = Con();
        return await con.QueryFirstOrDefaultAsync<CVR_PlanSaveContext>(@"
SELECT
    p.PLN_PlanID          AS PlanId,
    c.CTR_ContractID      AS ContractId,
    c.CTR_StartDate       AS ContractStartDate,
    c.CTR_EndDate         AS ContractEndDate,
    c.CTR_ContractCurrency AS ContractCurrency,
    c.CTR_ClientID        AS MainClientId
FROM CVR_Plans p
INNER JOIN CVR_Contracts c ON c.CTR_ContractID = p.PLN_ContractID
WHERE p.PLN_PlanID = @PlanId",
            new { PlanId = planId });
    }

    public async Task<List<int>> GetAllClientIdsForContractAsync(long contractId, int mainClientId)
    {
        using var con = Con();
        var subIds = (await con.QueryAsync<int>(@"
SELECT CTC_ClientID FROM CVR_ContractClients WHERE CTC_ContractID = @ContractId",
            new { ContractId = contractId })).ToList();

        return new[] { mainClientId }
            .Concat(subIds)
            .Where(id => id > 0)
            .Distinct()
            .ToList();
    }

    public async Task<List<CVR_Target>> GetTargetsByPlanIdAsync(int planId)
    {
        using var con = Con();
        var rows = await con.QueryAsync<CVR_Target>(
            "SELECT * FROM CVR_Targets WHERE TAR_PlanID = @PlanId ORDER BY TAR_TargetID",
            new { PlanId = planId });
        return rows.ToList();
    }

    public async Task<List<CVR_Fee>> GetFeesByPlanIdAsync(int planId)
    {
        using var con = Con();
        var rows = await con.QueryAsync<CVR_Fee>(
            "SELECT * FROM CVR_Fees WHERE FEE_PlanID = @PlanId ORDER BY FEE_FeeID",
            new { PlanId = planId });
        return rows.ToList();
    }

    public async Task<List<CVR_TargetCondition>> GetTargetConditionsAsync(int targetId)
    {
        using var con = Con();
        var rows = await con.QueryAsync<CVR_TargetCondition>(
            "SELECT * FROM CVR_TargetConditions WHERE TCD_TargetID = @TargetId",
            new { TargetId = targetId });
        return rows.ToList();
    }

    public async Task<long?> GetContractIdByPlanIdAsync(int planId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<long?>(
            "SELECT PLN_ContractID FROM CVR_Plans WHERE PLN_PlanID = @PlanId",
            new { PlanId = planId });
    }

    public async Task<long?> GetContractIdByContractClientIdAsync(decimal contractClientId)
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<long?>(
            "SELECT CTC_ContractID FROM CVR_ContractClients WHERE CTC_ContractClientID = @Id",
            new { Id = contractClientId });
    }

    public async Task<int> UpsertTargetComputationAsync(
        SqlConnection con, IDbTransaction tx, CVR_ComputationUpsertDto row, string user)
    {
        var existingId = await GetTargetComputationIdAsync(con, tx, row.TargetId!.Value);

        if (existingId.HasValue)
        {
            await UpdateTargetComputationAsync(con, tx, existingId.Value, row, user);
            return existingId.Value;
        }

        try
        {
            return await InsertTargetComputationAsync(con, tx, row, user);
        }
        catch (SqlException ex) when (IsUniqueConstraintViolation(ex))
        {
            existingId = await GetTargetComputationIdAsync(con, tx, row.TargetId!.Value);
            if (!existingId.HasValue) throw;
            await UpdateTargetComputationAsync(con, tx, existingId.Value, row, user);
            return existingId.Value;
        }
    }

    public async Task<int> UpsertFeeComputationAsync(
        SqlConnection con, IDbTransaction tx, CVR_ComputationUpsertDto row, string user)
    {
        var existingId = await GetFeeComputationIdAsync(con, tx, row.FeeId!.Value);

        if (existingId.HasValue)
        {
            await UpdateFeeComputationAsync(con, tx, existingId.Value, row, user);
            return existingId.Value;
        }

        try
        {
            return await InsertFeeComputationAsync(con, tx, row, user);
        }
        catch (SqlException ex) when (IsUniqueConstraintViolation(ex))
        {
            existingId = await GetFeeComputationIdAsync(con, tx, row.FeeId!.Value);
            if (!existingId.HasValue) throw;
            await UpdateFeeComputationAsync(con, tx, existingId.Value, row, user);
            return existingId.Value;
        }
    }

    public async Task InsertSalesSnapshotAsync(
        SqlConnection con, IDbTransaction tx, CVR_SalesSnapshotInsertDto row, string user)
    {
        await con.ExecuteAsync(@"
INSERT INTO CVR_SalesSnapshot
    (SSN_ComputationID, SSN_ClientID,
     SSN_SalesAmount, SSN_SalesQty, SSN_PreviousYearSalesAmount, SSN_Growth, SSN_Currency,
     SSN_CDStamp, SSN_CUStamp, SSN_MDStamp, SSN_MUStamp)
VALUES
    (@ComputationId, @ClientId,
     @SalesAmount, @SalesQty, @PreviousYearSalesAmount, @Growth, @Currency,
     GETDATE(), @User, GETDATE(), @User)",
            new
            {
                row.ComputationId,
                row.ClientId,
                row.SalesAmount,
                row.SalesQty,
                row.PreviousYearSalesAmount,
                row.Growth,
                row.Currency,
                User = user,
            }, tx);
    }

    private static bool IsUniqueConstraintViolation(SqlException ex)
    {
        foreach (SqlError err in ex.Errors)
        {
            if (err.Number is 2627 or 2601) return true;
        }
        return false;
    }

    private static Task<int?> GetTargetComputationIdAsync(SqlConnection con, IDbTransaction tx, int targetId) =>
        con.ExecuteScalarAsync<int?>(@"
SELECT CMP_ComputationID FROM CVR_Computations WHERE CMP_TargetID = @TargetId",
            new { TargetId = targetId }, tx);

    private static Task<int?> GetFeeComputationIdAsync(SqlConnection con, IDbTransaction tx, int feeId) =>
        con.ExecuteScalarAsync<int?>(@"
SELECT CMP_ComputationID FROM CVR_Computations WHERE CMP_FeeID = @FeeId",
            new { FeeId = feeId }, tx);

    private static Task UpdateTargetComputationAsync(
        SqlConnection con, IDbTransaction tx, int id, CVR_ComputationUpsertDto row, string user) =>
        con.ExecuteAsync(@"
UPDATE CVR_Computations SET
    CMP_SalesAmount = @SalesAmount,
    CMP_SalesQty = @SalesQty,
    CMP_PreviousYearSalesAmount = @PreviousYearSalesAmount,
    CMP_Growth = @Growth,
    CMP_RebateAmount = @RebateAmount,
    CMP_Currency = @Currency,
    CMP_DateTo = @DateTo,
    CMP_MDStamp = GETDATE(),
    CMP_MUStamp = @User
WHERE CMP_ComputationID = @Id",
            new
            {
                Id = id,
                row.SalesAmount,
                row.SalesQty,
                row.PreviousYearSalesAmount,
                row.Growth,
                row.RebateAmount,
                row.Currency,
                row.DateTo,
                User = user,
            }, tx);

    private static Task UpdateFeeComputationAsync(
        SqlConnection con, IDbTransaction tx, int id, CVR_ComputationUpsertDto row, string user) =>
        con.ExecuteAsync(@"
UPDATE CVR_Computations SET
    CMP_SalesAmount = @SalesAmount,
    CMP_SalesQty = @SalesQty,
    CMP_PreviousYearSalesAmount = @PreviousYearSalesAmount,
    CMP_Growth = @Growth,
    CMP_RebateAmount = @RebateAmount,
    CMP_Currency = @Currency,
    CMP_DateTo = @DateTo,
    CMP_MDStamp = GETDATE(),
    CMP_MUStamp = @User
WHERE CMP_ComputationID = @Id",
            new
            {
                Id = id,
                row.SalesAmount,
                row.SalesQty,
                row.PreviousYearSalesAmount,
                row.Growth,
                row.RebateAmount,
                row.Currency,
                row.DateTo,
                User = user,
            }, tx);

    private static Task<int> InsertTargetComputationAsync(
        SqlConnection con, IDbTransaction tx, CVR_ComputationUpsertDto row, string user) =>
        con.ExecuteScalarAsync<int>(@"
INSERT INTO CVR_Computations
    (CMP_ContractID, CMP_TargetID, CMP_FeeID,
     CMP_SalesAmount, CMP_SalesQty, CMP_PreviousYearSalesAmount, CMP_Growth,
     CMP_RebateAmount, CMP_Currency, CMP_DateFrom, CMP_DateTo,
     CMP_CDStamp, CMP_CUStamp, CMP_MDStamp, CMP_MUStamp)
VALUES
    (@ContractId, @TargetId, NULL,
     @SalesAmount, @SalesQty, @PreviousYearSalesAmount, @Growth,
     @RebateAmount, @Currency, @DateFrom, @DateTo,
     GETDATE(), @User, GETDATE(), @User);
SELECT CAST(SCOPE_IDENTITY() AS int);",
            new
            {
                row.ContractId,
                TargetId = row.TargetId,
                row.SalesAmount,
                row.SalesQty,
                row.PreviousYearSalesAmount,
                row.Growth,
                row.RebateAmount,
                row.Currency,
                row.DateFrom,
                row.DateTo,
                User = user,
            }, tx);

    private static Task<int> InsertFeeComputationAsync(
        SqlConnection con, IDbTransaction tx, CVR_ComputationUpsertDto row, string user) =>
        con.ExecuteScalarAsync<int>(@"
INSERT INTO CVR_Computations
    (CMP_ContractID, CMP_TargetID, CMP_FeeID,
     CMP_SalesAmount, CMP_SalesQty, CMP_PreviousYearSalesAmount, CMP_Growth,
     CMP_RebateAmount, CMP_Currency, CMP_DateFrom, CMP_DateTo,
     CMP_CDStamp, CMP_CUStamp, CMP_MDStamp, CMP_MUStamp)
VALUES
    (@ContractId, NULL, @FeeId,
     @SalesAmount, @SalesQty, @PreviousYearSalesAmount, @Growth,
     @RebateAmount, @Currency, @DateFrom, @DateTo,
     GETDATE(), @User, GETDATE(), @User);
SELECT CAST(SCOPE_IDENTITY() AS int);",
            new
            {
                row.ContractId,
                FeeId = row.FeeId,
                row.SalesAmount,
                row.SalesQty,
                row.PreviousYearSalesAmount,
                row.Growth,
                row.RebateAmount,
                row.Currency,
                row.DateFrom,
                row.DateTo,
                User = user,
            }, tx);
}
