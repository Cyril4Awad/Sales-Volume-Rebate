using DataService.Models.DTOs;

public class CVRPlanWorkspaceEngine
{
    private readonly CVRPlanWorkspaceDAL _dal;
    private readonly CVRSavedComputationDAL _savedDal;

    public CVRPlanWorkspaceEngine(CVRPlanWorkspaceDAL dal, CVRSavedComputationDAL savedDal)
    {
        _dal = dal;
        _savedDal = savedDal;
    }

    public Task<IEnumerable<CVR_PlanWorkspaceResponseDto>> GetAll() =>
        _dal.GetAll();

    public Task<List<string>> GetAppCurrenciesAsync() =>
        _dal.GetAppCurrenciesAsync();

    public async Task<int> BulkSave(CVR_WorkspaceSavePayload payload, string user)
    {
        CVR_WorkspaceValidator.ValidatePayload(payload);
        await EnsureNoLockedContractsInPayloadAsync(payload);
        return await _dal.BulkSave(payload, user);
    }

    private async Task EnsureNoLockedContractsInPayloadAsync(CVR_WorkspaceSavePayload payload)
    {
        var contractIds = new HashSet<long>();

        foreach (var planId in payload.DeletedPlanIds ?? new List<decimal>())
        {
            var contractId = await _savedDal.GetContractIdByPlanIdAsync((int)planId);
            if (contractId.HasValue) contractIds.Add(contractId.Value);
        }

        foreach (var entry in (payload.NewPlans ?? new List<CVR_PlanWorkspaceEntryDto>())
            .Concat(payload.ModifiedPlans ?? new List<CVR_PlanWorkspaceEntryDto>()))
        {
            var cid = entry.Plan?.ContractID;
            if (cid.HasValue && cid.Value > 0) contractIds.Add(cid.Value);
        }

        foreach (var contractId in contractIds)
        {
            if (await _savedDal.IsContractLockedAsync(contractId))
                throw new InvalidOperationException(CVRSavedComputationDAL.LockedMessage);
        }
    }
}