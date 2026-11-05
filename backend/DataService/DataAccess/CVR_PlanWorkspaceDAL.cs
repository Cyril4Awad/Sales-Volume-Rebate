using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using DataService.Others;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System.Data;

public class CVRPlanWorkspaceDAL
{
    private readonly IConfiguration _config;

    private const string TargetReferencesSelect = @"
        SELECT
            tr.TRF_TargetScopeReferenceID AS TargetReferenceId,
            tr.TRF_TargetID            AS TargetID,
            tr.TRF_ScopeType           AS ScopeType,
            tr.TRF_StockItemID         AS STKRecId,
            tr.TRF_ProductGroupID      AS ItemTypeRecId,
            COALESCE(s.STK_REF,  it.IT_Code) AS RefCode,
            COALESCE(s.STK_DESC, it.IT_DESC) AS RefDesc,
            s.STK_REF                AS StkRef,
            s.STK_DESC               AS StkDesc,
            b.DBAR_BARCODE           AS DbarBarcode,
            s.STK_UNIT               AS StkUnit,
            it.IT_Code               AS ItCode,
            it.IT_DESC               AS ItDesc,
            g.GRP_CODE               AS GrpCode,
            g.GRP_DESC               AS GrpDesc
        FROM CVR_TargetReferences tr
        LEFT JOIN STK04_STKFIL   s  ON s.STK_RECID = tr.TRF_StockItemID
        OUTER APPLY (
            SELECT TOP 1 b2.DBAR_BARCODE
            FROM dbo.Stk04_DetBarcode b2
            WHERE b2.DBAR_STKID = s.STK_RECID
        ) b
        LEFT JOIN STK04_ItemType it  ON it.IT_RecID = tr.TRF_ProductGroupID
        LEFT JOIN Stk04_Group g ON it.IT_Group = g.GRP_CODE
        WHERE tr.TRF_TargetID = @TargetId";

    private sealed class ContractDateRange
    {
        public DateTime? Start { get; set; }
        public DateTime? ContractEnd { get; set; }
    }

    public CVRPlanWorkspaceDAL(IConfiguration config)
    {
        _config = config;
    }

    public async Task<IEnumerable<CVR_PlanWorkspaceResponseDto>> GetAll()
    {
        var connStr = _config.GetConnectionString("Constr");

        // Each query gets its own connection — parallel execution via connection pool
        var plansTask = Task.Run(async () =>
        {
            using var c = new SqlConnection(connStr);
            return (await c.QueryAsync<CVR_Plan>("SELECT * FROM CVR_Plans")).ToList();
        });

        var targetsTask = Task.Run(async () =>
        {
            using var c = new SqlConnection(connStr);
            return (await c.QueryAsync<CVR_Target>("SELECT * FROM CVR_Targets")).ToList();
        });

        var conditionsTask = Task.Run(async () =>
        {
            using var c = new SqlConnection(connStr);
            return (await c.QueryAsync<CVR_TargetCondition>("SELECT * FROM CVR_TargetConditions")).ToList();
        });

        var feesTask = Task.Run(async () =>
        {
            using var c = new SqlConnection(connStr);
            return (await c.QueryAsync<CVR_Fee>("SELECT * FROM CVR_Fees")).ToList();
        });

        var refsTask = Task.Run(async () =>
        {
            using var c = new SqlConnection(connStr);
            return (await c.QueryAsync<CVR_TargetReferenceDto>(@"
                SELECT
                    tr.TRF_TargetScopeReferenceID AS TargetReferenceId,
                    tr.TRF_TargetID            AS TargetID,
                    tr.TRF_ScopeType           AS ScopeType,
                    tr.TRF_StockItemID         AS STKRecId,
                    tr.TRF_ProductGroupID      AS ItemTypeRecId,
                    COALESCE(s.STK_REF,  it.IT_Code) AS RefCode,
                    COALESCE(s.STK_DESC, it.IT_DESC) AS RefDesc,
                    s.STK_REF                AS StkRef,
                    s.STK_DESC               AS StkDesc,
                    b.DBAR_BARCODE           AS DbarBarcode,
                    s.STK_UNIT               AS StkUnit,
                    it.IT_Code               AS ItCode,
                    it.IT_DESC               AS ItDesc,
                    g.GRP_CODE               AS GrpCode,
                    g.GRP_DESC               AS GrpDesc
                FROM CVR_TargetReferences tr
                LEFT JOIN STK04_STKFIL   s  ON s.STK_RECID = tr.TRF_StockItemID
                OUTER APPLY (
                    SELECT TOP 1 b2.DBAR_BARCODE
                    FROM dbo.Stk04_DetBarcode b2
                    WHERE b2.DBAR_STKID = s.STK_RECID
                ) b
                LEFT JOIN STK04_ItemType it  ON it.IT_RecID = tr.TRF_ProductGroupID
                LEFT JOIN Stk04_Group g ON it.IT_Group = g.GRP_CODE")).ToList();
        });

        await Task.WhenAll(plansTask, targetsTask, conditionsTask, feesTask, refsTask);

        var plans      = await plansTask;
        var targets    = await targetsTask;
        var conditions = await conditionsTask;
        var fees       = await feesTask;
        var refs       = await refsTask;

        foreach (var r in refs)
            r.ReferenceType = DbScopeTypeToUi(r.ScopeType);

        // All dictionaries keyed by decimal to match entity field types
        var targetsByPlan = targets
            .GroupBy(t => t.TAR_PlanID)
            .ToDictionary(g => g.Key, g => g.ToList());

        var condByTarget = conditions
            .GroupBy(c => c.TCD_TargetID)
            .ToDictionary(g => g.Key, g => g.ToList());

        // TargetID on CVR_TargetReferenceDto is int? — cast to decimal to match TAR_TargetID
        var refsByTarget = refs
            .GroupBy(r => (decimal)(r.TargetID ?? 0))
            .ToDictionary(g => g.Key, g => g.ToList());

        var feesByPlan = fees
            .GroupBy(f => f.FEE_PlanID)
            .ToDictionary(g => g.Key, g => g.ToList());

        var result = new List<CVR_PlanWorkspaceResponseDto>();

        foreach (var plan in plans)
        {
            var id = plan.PLN_PlanID;

            targetsByPlan.TryGetValue(id, out var planTargets);
            feesByPlan.TryGetValue(id, out var planFees);

            var targetDtos = (planTargets ?? new List<CVR_Target>()).Select(t =>
            {
                refsByTarget.TryGetValue(t.TAR_TargetID, out var tRefs);
                condByTarget.TryGetValue(t.TAR_TargetID, out var tConds);
                return MapTarget(
                    t,
                    tRefs  ?? new List<CVR_TargetReferenceDto>(),
                    tConds ?? new List<CVR_TargetCondition>());
            }).ToList();

            result.Add(new CVR_PlanWorkspaceResponseDto
            {
                Plan             = MapPlan(plan),
                Fees             = (planFees ?? new List<CVR_Fee>()).Select(MapFee).ToList(),
                Targets          = targetDtos,
            });
        }

        return result;
    }

    public async Task<List<string>> GetAppCurrenciesAsync()
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));
        var row = await con.QueryFirstOrDefaultAsync<(string Curr1, string Curr2)>(
            "SELECT AC_Curr1 AS Curr1, AC_Curr2 AS Curr2 FROM Com_Appcomp WHERE Ac_Code = 'CVR' ORDER BY Ac_Comp");
        var result = new List<string>();
        if (!string.IsNullOrWhiteSpace(row.Curr1)) result.Add(row.Curr1.Trim());
        if (!string.IsNullOrWhiteSpace(row.Curr2)) result.Add(row.Curr2.Trim());
        return result;
    }

    public async Task<int> BulkSave(CVR_WorkspaceSavePayload dto, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));
        await con.OpenAsync();
        using var tx = con.BeginTransaction();

        try
        {
            foreach (var planId in dto.DeletedPlanIds)
            {
                var contractId = await con.ExecuteScalarAsync<decimal?>(@"
                    SELECT PLN_ContractID FROM CVR_Plans WHERE PLN_PlanID = @Id",
                    new { Id = planId }, tx);

                await DeleteAllSubItems(con, tx, planId);

                await con.ExecuteAsync(
                    "DELETE FROM CVR_Plans WHERE PLN_PlanID = @Id",
                    new { Id = planId }, tx);

                if (contractId.HasValue)
                {
                    await con.ExecuteAsync(
                        "DELETE FROM CVR_ContractClients WHERE CTC_ContractID = @ContractId",
                        new { ContractId = contractId.Value }, tx);
                    await con.ExecuteAsync(
                        "DELETE FROM CVR_Contracts WHERE CTR_ContractID = @ContractId",
                        new { ContractId = contractId.Value }, tx);
                }
            }

            foreach (var entry in dto.NewPlans)
            {
                var p = entry.Plan;
                var newId = await con.ExecuteScalarAsync<int>(@"
                    INSERT INTO CVR_Plans
                    (PLN_ContractID, PLN_TypeID, PLN_PlanName,
                     PLN_Remarks, PLN_Active, PLN_CDStamp, PLN_CUStamp, PLN_MDStamp, PLN_MUStamp)
                    VALUES
                    (@ContractID, @TypeID, @PlanName,
                     @Remarks, @Active, GETDATE(), @User, GETDATE(), @User);
                    SELECT CAST(SCOPE_IDENTITY() AS INT);",
                    new { p.ContractID, p.TypeID, p.PlanName,
                          p.Remarks, p.Active, User = user }, tx);

                await InsertAllSubItems(con, tx, newId, entry, user);
            }

            foreach (var entry in dto.ModifiedPlans)
            {
                var p = entry.Plan;
                await con.ExecuteAsync(@"
                    UPDATE CVR_Plans SET
                        PLN_ContractID        = @ContractID,
                        PLN_TypeID            = @TypeID,
                        PLN_PlanName          = @PlanName,
                        PLN_Remarks           = @Remarks,
                        PLN_Active            = @Active,
                        PLN_MDStamp           = GETDATE(),
                        PLN_MUStamp           = @User
                    WHERE PLN_PlanID = @PlanID",
                    new { p.ContractID, p.TypeID, p.PlanName,
                          p.Remarks, p.Active, User = user, p.PlanID }, tx);

                await SmartUpdateAllSubItems(con, tx, (int)p.PlanID!, entry, user);
            }

            tx.Commit();
            return 1;
        }
        catch
        {
            tx.Rollback();
            throw;
        }
    }

    private static async Task DeleteAllSubItems(SqlConnection con, IDbTransaction tx, decimal planId)
    {
        await con.ExecuteAsync("DELETE FROM CVR_Fees WHERE FEE_PlanID = @Id", new { Id = planId }, tx);
        await con.ExecuteAsync(@"DELETE FROM CVR_TargetConditions
            WHERE TCD_TargetID IN (SELECT TAR_TargetID FROM CVR_Targets WHERE TAR_PlanID = @Id)",
            new { Id = planId }, tx);
        await con.ExecuteAsync(@"DELETE FROM CVR_TargetReferences
            WHERE TRF_TargetID IN (SELECT TAR_TargetID FROM CVR_Targets WHERE TAR_PlanID = @Id)",
            new { Id = planId }, tx);
        await con.ExecuteAsync("DELETE FROM CVR_Targets WHERE TAR_PlanID = @Id", new { Id = planId }, tx);
    }

    private static async Task InsertAllSubItems(
        SqlConnection con, IDbTransaction tx, int planId,
        CVR_PlanWorkspaceEntryDto entry, string user)
    {
        var targets = entry.Targets ?? new List<CVR_TargetDto>();
        for (var i = 0; i < targets.Count; i++)
        {
            var t = targets[i];
            PrepareTargetConditions(t, i + 1);
            var newTargetId = await InsertTarget(con, tx, planId, t, user);
            foreach (var c in t.Conditions ?? new List<CVR_TargetConditionDto>())
                await InsertTargetCondition(con, tx, newTargetId, c, user);
            foreach (var r in t.References ?? new List<CVR_TargetReferenceDto>())
                await InsertTargetReference(con, tx, newTargetId, r, user);
        }
        await SmartSaveFees(con, tx, planId, entry.Fees ?? new List<CVR_FeeDto>(), user);
    }

    private static async Task SmartUpdateAllSubItems(
        SqlConnection con, IDbTransaction tx, int planId,
        CVR_PlanWorkspaceEntryDto entry, string user)
    {
        await SmartSaveTargets(con, tx, planId, entry.Targets ?? new List<CVR_TargetDto>(), user);
        await SmartSaveFees(con, tx, planId, entry.Fees ?? new List<CVR_FeeDto>(), user);
    }

    private static async Task SmartSaveTargets(
        SqlConnection con, IDbTransaction tx, int planId,
        List<CVR_TargetDto> incoming, string user)
    {
        var existing = (await con.QueryAsync<CVR_Target>(
            "SELECT * FROM CVR_Targets WHERE TAR_PlanID = @PlanId",
            new { PlanId = planId }, tx)).ToList();

        var keepIds = incoming.Where(t => t.TargetID.HasValue)
            .Select(t => (decimal)t.TargetID!.Value).ToHashSet();

        foreach (var ex in existing.Where(e => !keepIds.Contains(e.TAR_TargetID)))
        {
            await con.ExecuteAsync("DELETE FROM CVR_TargetConditions WHERE TCD_TargetID = @Id",
                new { Id = ex.TAR_TargetID }, tx);
            await con.ExecuteAsync("DELETE FROM CVR_TargetReferences WHERE TRF_TargetID = @Id",
                new { Id = ex.TAR_TargetID }, tx);
            await con.ExecuteAsync("DELETE FROM CVR_Targets WHERE TAR_TargetID = @Id",
                new { Id = ex.TAR_TargetID }, tx);
        }

        var contractDates = await con.QueryFirstOrDefaultAsync<ContractDateRange>(@"
            SELECT c.CTR_StartDate AS Start, c.CTR_EndDate AS ContractEnd
            FROM CVR_Contracts c
            INNER JOIN CVR_Plans p ON p.PLN_ContractID = c.CTR_ContractID
            WHERE p.PLN_PlanID = @PlanId",
            new { PlanId = planId }, tx);

        for (var i = 0; i < incoming.Count; i++)
        {
            var t = incoming[i];
            PrepareTargetConditions(t, i + 1);

            if (contractDates?.Start.HasValue == true && t.FromDate.HasValue
                && t.FromDate.Value.Date < contractDates.Start.Value.Date)
                throw new ValidationException(
                    $"Target \"{t.TargetName}\": start date {t.FromDate.Value:yyyy-MM-dd} " +
                    $"is before the contract start date {contractDates.Start.Value:yyyy-MM-dd}.");

            if (contractDates?.ContractEnd.HasValue == true && t.ToDate.HasValue
                && t.ToDate.Value.Date > contractDates.ContractEnd.Value.Date)
                throw new ValidationException(
                    $"Target \"{t.TargetName}\": end date {t.ToDate.Value:yyyy-MM-dd} " +
                    $"is after the contract end date {contractDates.ContractEnd.Value:yyyy-MM-dd}.");

            foreach (var r in t.References ?? new List<CVR_TargetReferenceDto>())
                CVR_WorkspaceValidator.ValidateTargetReference(t.TargetName ?? "Unnamed target", r);

            if (!t.TargetID.HasValue)
            {
                var newId = await InsertTarget(con, tx, planId, t, user);
                foreach (var c in t.Conditions ?? new List<CVR_TargetConditionDto>())
                    await InsertTargetCondition(con, tx, newId, c, user);
                foreach (var r in t.References ?? new List<CVR_TargetReferenceDto>())
                    await InsertTargetReference(con, tx, newId, r, user);
            }
            else
            {
                var targetId = (decimal)t.TargetID.Value;
                await con.ExecuteAsync(@"
                    UPDATE CVR_Targets SET
                        TAR_TargetName        = @TargetName,
                        TAR_FromDate          = @FromDate,
                        TAR_ToDate            = @ToDate,
                        TAR_RebateValue       = @RebateValue,
                        TAR_RebateValueType   = @RebateValueType,
                        TAR_Currency          = @Currency,
                        TAR_SettlementTypeID  = @SettlementTypeID,
                        TAR_ComputationTypeID = @ComputationTypeID,
                        TAR_TargetType        = @TargetType,
                        TAR_Override          = @Override,
                        TAR_MDStamp           = GETDATE(),
                        TAR_MUStamp           = @User
                    WHERE TAR_TargetID = @Id",
                    new { Id = targetId, t.TargetName, t.FromDate, t.ToDate,
                          RebateValue = ResolvePersistedRebateValue(t),
                          RebateValueType = ResolvePersistedRebateValueType(t),
                          Currency = ResolvePersistedTargetCurrency(t),
                          t.SettlementTypeID, t.ComputationTypeID,
                          TargetType = NormalizeTargetType(t.TargetType),
                          t.Override, User = user }, tx);

                await SmartSaveTargetConditions(con, tx, targetId,
                    t.Conditions ?? new List<CVR_TargetConditionDto>(), user);
                await SmartSaveTargetReferences(con, tx, targetId,
                    t.References ?? new List<CVR_TargetReferenceDto>(), user);
            }
        }
    }

    private static bool TargetRefNaturalKeyEquals(CVR_TargetReferenceDto r, CVR_TargetReference e)
    {
        var uiType = DbScopeTypeToUi(e.TRF_ScopeType);
        if (!string.Equals(r.ReferenceType ?? "", uiType ?? "", StringComparison.OrdinalIgnoreCase))
            return false;
        if (string.Equals(uiType, "StockItem", StringComparison.OrdinalIgnoreCase))
            return r.STKRecId.HasValue && e.TRF_StockItemID.HasValue && r.STKRecId.Value == e.TRF_StockItemID.Value;
        return r.ItemTypeRecId.HasValue && e.TRF_ProductGroupID.HasValue
            && r.ItemTypeRecId.Value == e.TRF_ProductGroupID.Value;
    }

    private static async Task SmartSaveTargetReferences(
        SqlConnection con, IDbTransaction tx, decimal targetId,
        List<CVR_TargetReferenceDto> incoming, string user)
    {
        var existing = (await con.QueryAsync<CVR_TargetReference>(
            "SELECT * FROM CVR_TargetReferences WHERE TRF_TargetID = @Id",
            new { Id = targetId }, tx)).ToList();

        var claimedExisting = new HashSet<decimal>();
        var resolutions = new List<(CVR_TargetReferenceDto Row, decimal? EffectiveId)>();

        foreach (var r in incoming)
        {
            decimal? effectiveId = null;
            if (r.TargetReferenceId.HasValue)
            {
                var byPk = existing.FirstOrDefault(e =>
                    e.TRF_TargetScopeReferenceID == (decimal)r.TargetReferenceId.Value);
                if (byPk != null && !claimedExisting.Contains(byPk.TRF_TargetScopeReferenceID))
                {
                    effectiveId = byPk.TRF_TargetScopeReferenceID;
                    claimedExisting.Add(byPk.TRF_TargetScopeReferenceID);
                }
            }
            if (!effectiveId.HasValue)
            {
                var nk = existing.FirstOrDefault(e =>
                    !claimedExisting.Contains(e.TRF_TargetScopeReferenceID) &&
                    TargetRefNaturalKeyEquals(r, e));
                if (nk != null)
                {
                    effectiveId = nk.TRF_TargetScopeReferenceID;
                    claimedExisting.Add(nk.TRF_TargetScopeReferenceID);
                }
            }
            resolutions.Add((r, effectiveId));
        }

        var keepIds = resolutions.Where(x => x.EffectiveId.HasValue)
            .Select(x => x.EffectiveId!.Value).ToHashSet();

        foreach (var ex in existing.Where(e => !keepIds.Contains(e.TRF_TargetScopeReferenceID)))
            await con.ExecuteAsync(
                "DELETE FROM CVR_TargetReferences WHERE TRF_TargetScopeReferenceID = @Id",
                new { Id = ex.TRF_TargetScopeReferenceID }, tx);

        foreach (var (r, effectiveId) in resolutions)
        {
            if (!effectiveId.HasValue)
                await InsertTargetReference(con, tx, (int)targetId, r, user);
            else
            {
                var scopeType = UiRefTypeToDb(r.ReferenceType ?? r.ScopeType);
                await con.ExecuteAsync(@"
                    UPDATE CVR_TargetReferences SET
                        TRF_ScopeType      = @ScopeType,
                        TRF_StockItemID    = @STKRecId,
                        TRF_ProductGroupID = @ItemTypeRecId,
                        TRF_MDStamp        = GETDATE(),
                        TRF_MUStamp        = @User
                    WHERE TRF_TargetScopeReferenceID = @Id",
                    new { Id = effectiveId.Value, ScopeType = scopeType,
                          r.STKRecId, r.ItemTypeRecId, User = user }, tx);
            }
        }
    }

    private static async Task SmartSaveTargetConditions(
        SqlConnection con, IDbTransaction tx, decimal targetId,
        List<CVR_TargetConditionDto> incoming, string user)
    {
        var existing = (await con.QueryAsync<CVR_TargetCondition>(
            "SELECT * FROM CVR_TargetConditions WHERE TCD_TargetID = @TargetId",
            new { TargetId = targetId }, tx)).ToList();

        var keepIds = incoming.Where(c => c.TargetConditionID.HasValue)
            .Select(c => (decimal)c.TargetConditionID!.Value).ToHashSet();

        foreach (var ex in existing.Where(e => !keepIds.Contains(e.TCD_TargetConditionID)))
            await con.ExecuteAsync("DELETE FROM CVR_TargetConditions WHERE TCD_TargetConditionID = @Id",
                new { Id = ex.TCD_TargetConditionID }, tx);

        foreach (var c in incoming)
        {
            NormalizeCondition(c);
            if (!c.TargetConditionID.HasValue)
                await InsertTargetCondition(con, tx, (int)targetId, c, user);
            else
                await con.ExecuteAsync(@"
                    UPDATE CVR_TargetConditions SET
                        TCD_ConditionType       = @ConditionType,
                        TCD_Operator            = @Operator,
                        TCD_Value               = @Value,
                        TCD_LogicalGroup        = @LogicalGroup,
                        TCD_LogicalOperator     = @LogicalOperator,
                        TCD_RebateType          = @Type,
                        TCD_RebateCurrency      = @Currency,
                        TCD_SalesAmountCurrency = @SalesAmountCurrency,
                        TCD_RebateAmount        = @RebateAmount,
                        TCD_MDStamp             = GETDATE(),
                        TCD_MUStamp             = @User
                    WHERE TCD_TargetConditionID = @Id",
                    new { Id = (decimal)c.TargetConditionID.Value, c.ConditionType,
                          c.Operator, c.Value, c.LogicalGroup, c.LogicalOperator,
                          c.Type, c.Currency, c.SalesAmountCurrency, c.RebateAmount,
                          User = user }, tx);
        }
    }

    private static async Task SmartSaveFees(
        SqlConnection con, IDbTransaction tx, int planId,
        List<CVR_FeeDto> incoming, string user)
    {
        var existing = (await con.QueryAsync<CVR_Fee>(
            "SELECT * FROM CVR_Fees WHERE FEE_PlanID = @PlanId",
            new { PlanId = planId }, tx)).ToList();

        var keepIds = incoming.Where(f => f.FeeID.HasValue)
            .Select(f => (decimal)f.FeeID!.Value).ToHashSet();

        foreach (var ex in existing.Where(e => !keepIds.Contains(e.FEE_FeeID)))
            await con.ExecuteAsync("DELETE FROM CVR_Fees WHERE FEE_FeeID = @Id",
                new { Id = ex.FEE_FeeID }, tx);

        foreach (var f in incoming)
        {
            if (!f.FeeID.HasValue)
                await InsertFee(con, tx, planId, f, user);
            else
                await con.ExecuteAsync(@"
                    UPDATE CVR_Fees SET
                        FEE_Name           = @Name,
                        FEE_Currency       = @Currency,
                        FEE_Amount         = @Amount,
                        FEE_SettlementType = @SettlementType,
                        FEE_MDStamp        = GETDATE(),
                        FEE_MUStamp        = @User
                    WHERE FEE_FeeID = @Id",
                    new { Id = (decimal)f.FeeID.Value, f.Name,
                          f.Currency, f.Amount, f.SettlementType, User = user }, tx);
        }
    }

    private static async Task InsertFee(
        SqlConnection con, IDbTransaction tx, int planId, CVR_FeeDto f, string user)
    {
        await con.ExecuteAsync(@"
            INSERT INTO CVR_Fees
            (FEE_PlanID, FEE_Name, FEE_Currency, FEE_Amount, FEE_SettlementType,
             FEE_CDStamp, FEE_CUStamp, FEE_MDStamp, FEE_MUStamp)
            VALUES
            (@PlanID, @Name, @Currency, @Amount, @SettlementType,
             GETDATE(), @User, GETDATE(), @User)",
            new { PlanID = planId, f.Name, f.Currency,
                  f.Amount, f.SettlementType, User = user }, tx);
    }

    private static async Task<int> InsertTarget(
        SqlConnection con, IDbTransaction tx, int planId, CVR_TargetDto t, string user)
    {
        return await con.ExecuteScalarAsync<int>(@"
            INSERT INTO CVR_Targets
            (TAR_PlanID, TAR_TargetName, TAR_FromDate, TAR_ToDate,
             TAR_RebateValue, TAR_RebateValueType, TAR_Currency,
             TAR_SettlementTypeID, TAR_ComputationTypeID, TAR_TargetType,
             TAR_Override, TAR_CDStamp, TAR_CUStamp, TAR_MDStamp, TAR_MUStamp)
            VALUES
            (@PlanID, @TargetName, @FromDate, @ToDate,
             @RebateValue, @RebateValueType, @Currency,
             @SettlementTypeID, @ComputationTypeID, @TargetType,
             @Override, GETDATE(), @User, GETDATE(), @User);
            SELECT CAST(SCOPE_IDENTITY() AS INT);",
            new { PlanID = planId, t.TargetName, t.FromDate, t.ToDate,
                  RebateValue = ResolvePersistedRebateValue(t),
                  RebateValueType = ResolvePersistedRebateValueType(t),
                  Currency = ResolvePersistedTargetCurrency(t),
                  t.SettlementTypeID, t.ComputationTypeID,
                  TargetType = NormalizeTargetType(t.TargetType),
                  t.Override, User = user }, tx);
    }

    private static async Task InsertTargetReference(
        SqlConnection con, IDbTransaction tx, int targetId, CVR_TargetReferenceDto r, string user)
    {
        var scopeType = UiRefTypeToDb(r.ReferenceType ?? r.ScopeType);
        await con.ExecuteAsync(@"
            INSERT INTO CVR_TargetReferences
            (TRF_TargetID, TRF_ScopeType, TRF_StockItemID, TRF_ProductGroupID,
             TRF_CDStamp, TRF_CUStamp, TRF_MDStamp, TRF_MUStamp)
            VALUES
            (@TargetId, @ScopeType, @STKRecId, @ItemTypeRecId,
             GETDATE(), @User, GETDATE(), @User)",
            new { TargetId = targetId, ScopeType = scopeType,
                  r.STKRecId, r.ItemTypeRecId, User = user }, tx);
    }

    private static async Task InsertTargetCondition(
        SqlConnection con, IDbTransaction tx, int targetId, CVR_TargetConditionDto c, string user)
    {
        NormalizeCondition(c);
        await con.ExecuteAsync(@"
            INSERT INTO CVR_TargetConditions
            (TCD_TargetID, TCD_ConditionType, TCD_Operator,
             TCD_Value, TCD_LogicalGroup, TCD_LogicalOperator,
             TCD_RebateType, TCD_RebateCurrency, TCD_SalesAmountCurrency, TCD_RebateAmount,
             TCD_CDStamp, TCD_CUStamp, TCD_MDStamp, TCD_MUStamp)
            VALUES
            (@TargetID, @ConditionType, @Operator,
             @Value, @LogicalGroup, @LogicalOperator,
             @Type, @Currency, @SalesAmountCurrency, @RebateAmount,
             GETDATE(), @User, GETDATE(), @User)",
            new { TargetID = targetId, c.ConditionType, c.Operator, c.Value,
                  c.LogicalGroup, c.LogicalOperator, c.Type, c.Currency,
                  c.SalesAmountCurrency, c.RebateAmount, User = user }, tx);
    }

    private static bool IsTierRow(CVR_TargetConditionDto c) =>
        string.Equals(c.LogicalOperator, "R", StringComparison.OrdinalIgnoreCase)
        || string.Equals(c.LogicalOperator, "T", StringComparison.OrdinalIgnoreCase);

    private static string? NormalizeTargetType(string? targetType)
    {
        if (string.IsNullOrWhiteSpace(targetType)) return "F";
        var t = targetType.Trim().ToUpperInvariant();
        return t == "R" ? "R" : "F";
    }

    private static bool IsRangeTarget(CVR_TargetDto t) =>
        NormalizeTargetType(t.TargetType) == "R";

    private static string? ResolvePersistedRebateValueType(CVR_TargetDto t) =>
        IsRangeTarget(t)
            ? string.IsNullOrWhiteSpace(t.RebateValueType) ? null : t.RebateValueType.Trim()
            : string.IsNullOrWhiteSpace(t.RebateValueType) ? "F" : t.RebateValueType.Trim();

    private static decimal? ResolvePersistedRebateValue(CVR_TargetDto t) =>
        IsRangeTarget(t) ? null : t.RebateValue;

    private static string? ResolvePersistedTargetCurrency(CVR_TargetDto t) =>
        IsRangeTarget(t) ? null : t.Currency;

    private static void NormalizeCondition(CVR_TargetConditionDto c)
    {
        if (IsTierRow(c)) { c.LogicalOperator = "R"; c.Operator = "="; return; }
        c.Type = null; c.Currency = null; c.RebateAmount = null;
    }

    private static void PrepareTargetConditions(CVR_TargetDto target, int targetOrdinal)
    {
        foreach (var c in target.Conditions ?? new List<CVR_TargetConditionDto>())
        {
            NormalizeCondition(c);
            if (IsTierRow(c)) c.LogicalGroup = targetOrdinal;
        }
    }

    private static string UiRefTypeToDb(string? uiOrDb)
    {
        if (string.IsNullOrWhiteSpace(uiOrDb)) return "";
        return uiOrDb.Trim() switch
        {
            "StockItem"    => "S",
            "ProductGroup" => "P",
            "S"            => "S",
            "P"            => "P",
            _              => uiOrDb.Trim()
        };
    }

    private static string DbScopeTypeToUi(string? db)
    {
        return db?.Trim() switch
        {
            "S"            => "StockItem",
            "P"            => "ProductGroup",
            "StockItem"    => "StockItem",
            "ProductGroup" => "ProductGroup",
            _              => db ?? ""
        };
    }

    private static CVR_PlanDto MapPlan(CVR_Plan p) => new()
    {
        PlanID            = (int)p.PLN_PlanID,
        ContractID        = (int?)p.PLN_ContractID,
        TypeID            = (int?)p.PLN_TypeID,
        PlanName          = p.PLN_PlanName,
        Remarks           = p.PLN_Remarks,
        Active            = p.PLN_Active,
    };

    private static CVR_FeeDto MapFee(CVR_Fee f) => new()
    {
        FeeID          = (int)f.FEE_FeeID,
        PlanID         = (int?)f.FEE_PlanID,
        Name           = f.FEE_Name,
        Currency       = f.FEE_Currency,
        Amount         = f.FEE_Amount,
        SettlementType = (int?)f.FEE_SettlementType,
    };

    private static CVR_TargetDto MapTarget(
        CVR_Target t,
        List<CVR_TargetReferenceDto> refs,
        List<CVR_TargetCondition> conditions)
    {
        var conditionDtos = conditions.Select(MapTargetCondition).ToList();
        var targetType    = ResolveTargetType(t.TAR_TargetType, conditionDtos);
        return new CVR_TargetDto
        {
            TargetID          = (int)t.TAR_TargetID,
            PlanID            = (int?)t.TAR_PlanID,
            TargetName        = t.TAR_TargetName,
            FromDate          = t.TAR_FromDate,
            ToDate            = t.TAR_ToDate,
            RebateValue       = targetType == "R" ? null : t.TAR_RebateValue,
            RebateValueType   = targetType == "R" ? t.TAR_RebateValueType : (t.TAR_RebateValueType ?? "F"),
            Currency          = targetType == "R" ? null : t.TAR_Currency,
            SettlementTypeID  = (int?)t.TAR_SettlementTypeID,
            ComputationTypeID = (int?)t.TAR_ComputationTypeID,
            TargetType        = targetType,
            Override          = t.TAR_Override,
            References        = refs,
            Conditions        = conditionDtos,
        };
    }

    private static string ResolveTargetType(string? dbTargetType, List<CVR_TargetConditionDto> conditions)
    {
        if (!string.IsNullOrWhiteSpace(dbTargetType)) return NormalizeTargetType(dbTargetType)!;
        if (conditions.Any(c => IsTierRow(c))) return "R";
        return "F";
    }

    private static CVR_TargetConditionDto MapTargetCondition(CVR_TargetCondition c) => new()
    {
        TargetConditionID   = (int)c.TCD_TargetConditionID,
        TargetID            = (int)c.TCD_TargetID,
        ConditionType       = c.TCD_ConditionType,
        Operator            = c.TCD_Operator,
        Value               = c.TCD_Value,
        LogicalGroup        = (int?)c.TCD_LogicalGroup,
        LogicalOperator     = c.TCD_LogicalOperator,
        Type                = c.TCD_RebateType,
        Currency            = c.TCD_RebateCurrency,
        SalesAmountCurrency = c.TCD_SalesAmountCurrency,
        RebateAmount        = c.TCD_RebateAmount,
    };
}