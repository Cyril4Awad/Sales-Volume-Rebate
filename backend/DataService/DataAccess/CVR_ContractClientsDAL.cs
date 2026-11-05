using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

// ─── DAL ──────────────────────────────────────────────────────────────────────
public class CVRContractClientDAL
{
    private readonly IConfiguration _config;
    public CVRContractClientDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    public async Task<IEnumerable<dynamic>> GetAll()
    {
        using var con = Con();
        return await con.QueryAsync(@"
            SELECT CTC_ContractClientID, CTC_ContractID, CTC_ClientID
            FROM   CVR_ContractClients
            ORDER  BY CTC_ContractClientID");
    }

    public async Task<int> Insert(CVR_ContractClientDto dto, string user)
    {
        using var con = Con();
        return await con.ExecuteAsync(@"
            INSERT INTO CVR_ContractClients
                (CTC_ContractID, CTC_ClientID, CTC_CDStamp, CTC_CUStamp, CTC_MDStamp, CTC_MUStamp)
            VALUES
                (@ContractID, @ClientID, GETDATE(), @User, GETDATE(), @User)",
            new { dto.ContractID, dto.ClientID, User = user });
    }

    public async Task<int> Update(decimal id, CVR_ContractClientDto dto, string user)
    {
        using var con = Con();
        return await con.ExecuteAsync(@"
            UPDATE CVR_ContractClients SET
                CTC_ContractID = @ContractID,
                CTC_ClientID   = @ClientID,
                CTC_MDStamp    = GETDATE(),
                CTC_MUStamp    = @User
            WHERE CTC_ContractClientID = @Id",
            new { Id = id, dto.ContractID, dto.ClientID, User = user });
    }

    public async Task<int> Delete(decimal id)
    {
        using var con = Con();
        return await con.ExecuteAsync(
            "DELETE FROM CVR_ContractClients WHERE CTC_ContractClientID = @Id",
            new { Id = id });
    }
}