using DataService.Models.DTOs;

public class CVRComputationTypeEngine
{
    private readonly CVRComputationTypeDAL _dal;
    public CVRComputationTypeEngine(CVRComputationTypeDAL dal) => _dal = dal;

    public Task<IEnumerable<dynamic>> GetAll() => _dal.GetAll();
    public Task<int> Create(CVR_ComputationTypeDto dto, string user) => _dal.Insert(dto, user);
    public Task<int> Update(decimal id, CVR_ComputationTypeDto dto, string user) => _dal.Update(id, dto, user);
    public Task<int> Delete(decimal id) => _dal.Delete(id);
}