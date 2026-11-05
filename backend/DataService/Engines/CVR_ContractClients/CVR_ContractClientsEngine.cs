using DataService.Models.DTOs;

public class CVRContractClientEngine
{
    private readonly CVRContractClientDAL _dal;
    private readonly CVRSavedComputationDAL _savedDal;

    public CVRContractClientEngine(CVRContractClientDAL dal, CVRSavedComputationDAL savedDal)
    {
        _dal = dal;
        _savedDal = savedDal;
    }

    public Task<IEnumerable<dynamic>> GetAll() => _dal.GetAll();

    public async Task<int> Create(CVR_ContractClientDto dto, string user)
    {
        if (dto.ContractID.HasValue && await _savedDal.IsContractLockedAsync(dto.ContractID.Value))
            throw new InvalidOperationException(CVRSavedComputationDAL.LockedMessage);
        return await _dal.Insert(dto, user);
    }

    public async Task<int> Update(decimal id, CVR_ContractClientDto dto, string user)
    {
        var contractId = dto.ContractID
            ?? await _savedDal.GetContractIdByContractClientIdAsync(id);
        if (contractId.HasValue && await _savedDal.IsContractLockedAsync(contractId.Value))
            throw new InvalidOperationException(CVRSavedComputationDAL.LockedMessage);
        return await _dal.Update(id, dto, user);
    }

    public async Task<int> Delete(decimal id)
    {
        var contractId = await _savedDal.GetContractIdByContractClientIdAsync(id);
        if (contractId.HasValue && await _savedDal.IsContractLockedAsync(contractId.Value))
            throw new InvalidOperationException(CVRSavedComputationDAL.LockedMessage);
        return await _dal.Delete(id);
    }
}
