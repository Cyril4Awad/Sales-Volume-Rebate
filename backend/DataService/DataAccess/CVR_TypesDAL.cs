using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CVRTypeDAL
{
    private readonly IConfiguration _config;

    public CVRTypeDAL(IConfiguration config)
    {
        _config = config;
    }

    public async Task<IEnumerable<CVR_Type>> GetAll()
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        return await con.QueryAsync<CVR_Type>(
            "SELECT * FROM CVR_Types"
        );
    }

    public async Task<int> Insert(CVR_TypeDto dto, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        string sql = @"
        INSERT INTO CVR_Types
        (VRT_TypeName, VRT_Behavior, VRT_Remarks, VRT_Active, VRT_CDStamp, VRT_CUStamp, VRT_MDStamp, VRT_MUStamp)
        VALUES
        (@TypeName, @Behavior, @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)";

        return await con.ExecuteAsync(sql, new
        {
            dto.TypeName,
            dto.Behavior,
            dto.Remarks,
            dto.Active,
            User = user
        });
    }

    public async Task<int> Update(decimal id, CVR_TypeDto dto, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        string sql = @"
        UPDATE CVR_Types
        SET 
            VRT_TypeName = @TypeName,
            VRT_Behavior = @Behavior,
            VRT_Remarks = @Remarks,
            VRT_Active = @Active,
            VRT_MDStamp = GETDATE(),
            VRT_MUStamp = @User
        WHERE VRT_TypeID = @Id";

        return await con.ExecuteAsync(sql, new
        {
            Id = id,
            dto.TypeName,
            dto.Behavior,
            dto.Remarks,
            dto.Active,
            User = user
        });
    }

    public async Task<int> Delete(decimal id)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        return await con.ExecuteAsync(
            "DELETE FROM CVR_Types WHERE VRT_TypeID = @Id",
            new { Id = id }
        );
    }
    public async Task<int> BulkSave(List<CVR_TypeDto> list, string user)
    {
        using var con = new SqlConnection(_config.GetConnectionString("Constr"));

        await con.OpenAsync();
        using var transaction = con.BeginTransaction();

        try
        {
            // optional strategy: replace all
            await con.ExecuteAsync("DELETE FROM CVR_Types", transaction: transaction);

            foreach (var item in list)
            {
                await con.ExecuteAsync(@"
                INSERT INTO CVR_Types
                (VRT_TypeName, VRT_Behavior, VRT_Remarks, VRT_Active, VRT_CDStamp, VRT_CUStamp, VRT_MDStamp, VRT_MUStamp)
                VALUES
                (@TypeName, @Behavior, @Remarks, @Active, GETDATE(), @User, GETDATE(), @User)",
                new
                {
                    item.TypeName,
                    item.Behavior,
                    item.Remarks,
                    item.Active,
                    User = user
                },
                transaction);
            }

            transaction.Commit();
            return 1;
        }
        catch
        {
            transaction.Rollback();
            throw;
        }
    }
}