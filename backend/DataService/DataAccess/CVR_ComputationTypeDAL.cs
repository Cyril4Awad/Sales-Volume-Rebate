using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CVRComputationTypeDAL
{
    private readonly IConfiguration _config;
    public CVRComputationTypeDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    public async Task<IEnumerable<dynamic>> GetAll()
    {
        using var con = Con();
        return await con.QueryAsync("SELECT * FROM CVR_ComputationType ORDER BY FRT_ComputationTypeID");
    }

    public async Task<int> Insert(CVR_ComputationTypeDto dto, string user)
    {
        try
        {
            using var con = Con();
            return await con.ExecuteAsync(@"
            INSERT INTO CVR_ComputationType
                (FRT_ComputationTypeName, FRT_PeriodLength, FRT_IsCustom,
                 FRT_Remarks, FRT_Active, FRT_CDStamp, FRT_CUStamp, FRT_MDStamp, FRT_MUStamp)
            VALUES
                (@ComputationTypeName, @PeriodLength, @IsCustom,
                 @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)",
                new
                {
                    dto.ComputationTypeName,
                    dto.PeriodLength,
                    dto.IsCustom,
                    dto.Remarks,
                    dto.Active,
                    User = user
                });
        }
        catch (SqlException ex) when (ex.Number == 2627)
        {
            throw new InvalidOperationException("A computation type with this name already exists.");
        }
    }

    public async Task<int> Update(decimal id, CVR_ComputationTypeDto dto, string user)
    {
        using var con = Con();
        return await con.ExecuteAsync(@"
            UPDATE CVR_ComputationType SET
                FRT_ComputationTypeName = @ComputationTypeName,
                FRT_PeriodLength        = @PeriodLength,
                FRT_IsCustom            = @IsCustom,
                FRT_Remarks             = @Remarks,
                FRT_Active              = @Active,
                FRT_MDStamp             = GETDATE(),
                FRT_MUStamp             = @User
            WHERE FRT_ComputationTypeID = @Id",
            new
            {
                Id = id,
                dto.ComputationTypeName,
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
            "DELETE FROM CVR_ComputationType WHERE FRT_ComputationTypeID = @Id",
            new { Id = id });
    }
}