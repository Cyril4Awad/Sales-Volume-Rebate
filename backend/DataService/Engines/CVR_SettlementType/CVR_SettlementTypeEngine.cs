using DataService.Models.DTOs;

public class CVRSettlementTypeEngine
{
    private readonly CVRSettlementTypeDAL _dal;
    public CVRSettlementTypeEngine(CVRSettlementTypeDAL dal) => _dal = dal;

    public Task<IEnumerable<dynamic>> GetAll() => _dal.GetAll();
    public Task<int> Create(CVR_SettlementTypeDto dto, string user) =>
        ValidateAndInsert(dto, user);

    public Task<int> Update(decimal id, CVR_SettlementTypeDto dto, string user) =>
        ValidateAndUpdate(id, dto, user);

    private static void ValidatePeriodLength(CVR_SettlementTypeDto dto)
    {
        if (dto.PeriodLength < 1 || dto.PeriodLength > 12)
            throw new InvalidOperationException("Period length must be between 1 and 12 months.");
    }

    private Task<int> ValidateAndInsert(CVR_SettlementTypeDto dto, string user)
    {
        ValidatePeriodLength(dto);
        return _dal.Insert(dto, user);
    }

    private Task<int> ValidateAndUpdate(decimal id, CVR_SettlementTypeDto dto, string user)
    {
        ValidatePeriodLength(dto);
        return _dal.Update(id, dto, user);
    }
    public Task<int> Delete(decimal id) => _dal.Delete(id);
}