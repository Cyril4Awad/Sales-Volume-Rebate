using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace DataService.DataAccess
{
    public class COM_CurrencyDAL
    {
        private readonly IConfiguration _config;

        public COM_CurrencyDAL(IConfiguration config) => _config = config;

        private SqlConnection Con() =>
            new SqlConnection(_config.GetConnectionString("Constr"));

        public async Task<IEnumerable<Com_Currency>> GetAll()
        {
            using var con = Con();
            return await con.QueryAsync<Com_Currency>(@"
                SELECT
                    Cur_Code,
                    Cur_Desc,
                    Cur_Ustmp,
                    Cur_Dstmp
                FROM COM_Currency
                ORDER BY Cur_Code");
        }

        public async Task<Com_Currency?> GetByCode(string code)
        {
            using var con = Con();
            return await con.QueryFirstOrDefaultAsync<Com_Currency>(@"
                SELECT
                    Cur_Code,
                    Cur_Desc,
                    Cur_Ustmp,
                    Cur_Dstmp
                FROM COM_Currency
                WHERE Cur_Code = @Code",
                new { Code = code });
        }

        public async Task<int> Insert(Com_CurrencyDTO dto, string user)
        {
            using var con = Con();
            return await con.ExecuteAsync(@"
                INSERT INTO COM_Currency
                (
                    Cur_Code,
                    Cur_Desc,
                    Cur_Ustmp,
                    Cur_Dstmp
                )
                VALUES
                (
                    @Cur_Code,
                    @Cur_Desc,
                    @User,
                    GETDATE()
                )",
                new
                {
                    dto.Cur_Code,
                    dto.Cur_Desc,
                    User = user
                });
        }

        public async Task<int> Update(string code, Com_CurrencyDTO dto, string user)
        {
            using var con = Con();
            return await con.ExecuteAsync(@"
                UPDATE COM_Currency SET
                    Cur_Desc   = @Cur_Desc,
                    Cur_Ustmp  = @User,
                    Cur_Dstmp  = GETDATE()
                WHERE Cur_Code = @Code",
                new
                {
                    Code = code,
                    dto.Cur_Desc,
                    User = user
                });
        }

        public async Task<int> Delete(string code)
        {
            using var con = Con();
            return await con.ExecuteAsync(@"
                DELETE FROM COM_Currency
                WHERE Cur_Code = @Code",
                new { Code = code });
        }
    }
}