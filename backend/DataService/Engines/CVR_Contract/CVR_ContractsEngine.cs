using DataService.Models.DTOs;

public class CVRContractEngine
{
    private readonly CVRContractDAL _dal;
    private readonly CVRSavedComputationDAL _savedDal;

    public CVRContractEngine(CVRContractDAL dal, CVRSavedComputationDAL savedDal)
    {
        _dal = dal;
        _savedDal = savedDal;
    }

    public Task<IEnumerable<dynamic>> GetAll() => _dal.GetAll();
    public Task<int> Create(CVR_ContractDto dto, string user) => _dal.Insert(dto, user);

    public async Task<int> Update(decimal id, CVR_ContractDto dto, string user)
    {
        if (await _savedDal.IsContractLockedAsync((long)id))
            throw new InvalidOperationException(CVRSavedComputationDAL.LockedMessage);
        return await _dal.Update(id, dto, user);
    }

    public async Task<int> Delete(decimal id)
    {
        if (await _savedDal.IsContractLockedAsync((long)id))
            throw new InvalidOperationException(CVRSavedComputationDAL.LockedMessage);
        return await _dal.Delete(id);
    }

    public Task<bool> ReferenceExists(string reference, int? excludeContractId = null) =>
        _dal.ReferenceExists(reference, excludeContractId);
}