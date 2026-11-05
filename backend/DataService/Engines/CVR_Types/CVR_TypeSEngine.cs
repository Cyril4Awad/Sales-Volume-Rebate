using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;

public class CVRTypeEngine
{
    private readonly CVRTypeDAL _dal;

    public CVRTypeEngine(CVRTypeDAL dal)
    {
        _dal = dal;
    }

    public Task<IEnumerable<CVR_Type>> GetAll()
    {
        return _dal.GetAll();
    }

    public Task<int> Create(CVR_TypeDto dto, string user)
    {
        return _dal.Insert(dto, user);
    }

    public Task<int> Update(decimal id, CVR_TypeDto dto, string user)
    {
        return _dal.Update(id, dto, user);
    }

    public Task<int> Delete(decimal id)
    {
        return _dal.Delete(id);
    }
    public async Task<int> BulkSave(List<CVR_TypeDto> list, string user)
    {
        return await _dal.BulkSave(list, user);
    }

}