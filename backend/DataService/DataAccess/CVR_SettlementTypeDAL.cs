using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CVRSettlementTypeDAL
{
    private readonly IConfiguration _config;
    public CVRSettlementTypeDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    public async Task<IEnumerable<dynamic>> GetAll()
    {
        using var con = Con();
        return await con.QueryAsync("SELECT * FROM CVR_SettlementTypes ORDER BY STT_SettlementTypeID");
    }

    public async Task<int> Insert(CVR_SettlementTypeDto dto, string user)
    {
        using var con = Con();
        return await con.ExecuteAsync(@"
            INSERT INTO CVR_SettlementTypes
                (STT_SettlementTypeName, STT_PeriodLength, STT_IsCustom,
                 STT_Remarks, STT_Active, STT_CDStamp, STT_CUStamp, STT_MDStamp, STT_MUStamp)
            VALUES
                (@SettlementTypeName, @PeriodLength, @IsCustom,
                 @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)",
            new
            {
                dto.SettlementTypeName,
                dto.PeriodLength,
                dto.IsCustom,
                dto.Remarks,
                dto.Active,
                User = user
            });
    }

    public async Task<int> Update(decimal id, CVR_SettlementTypeDto dto, string user)
    {
        using var con = Con();
        return await con.ExecuteAsync(@"
            UPDATE CVR_SettlementTypes SET
                STT_SettlementTypeName = @SettlementTypeName,
                STT_PeriodLength       = @PeriodLength,
                STT_IsCustom           = @IsCustom,
                STT_Remarks            = @Remarks,
                STT_Active             = @Active,
                STT_MDStamp            = GETDATE(),
                STT_MUStamp            = @User
            WHERE STT_SettlementTypeID = @Id",
            new
            {
                Id = id,
                dto.SettlementTypeName,
                dto.PeriodLength,
                dto.IsCustom,
                dto.Remarks,
                dto.Active,
                User = user
            });
    }

    public async Task<int> Delete(decimal id)
    {
        using var con = Con();
        return await con.ExecuteAsync(
            "DELETE FROM CVR_SettlementTypes WHERE STT_SettlementTypeID = @Id",
            new { Id = id });
    }
}