using Dapper;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

namespace DataService.DataAccess
{
    public class COM_DailyRateDAL
    {
        private readonly IConfiguration _config;

        public COM_DailyRateDAL(IConfiguration config) => _config = config;

        private SqlConnection Con() =>
            new SqlConnection(_config.GetConnectionString("Constr"));

        /// <summary>
        /// Latest USD daily rate (LBP per 1 USD) on or before today.
        /// </summary>
        public async Task<decimal?> GetCurrentUsdLbpRateAsync()
        {
            using var con = Con();
            return await con.ExecuteScalarAsync<decimal?>(@"
                SELECT TOP 1 DR_Rate1LC
                FROM Com_DailyRate
                WHERE DR_CurCode = 'USD'
                  AND DR_Date <= CAST(GETDATE() AS DATE)
                ORDER BY DR_Date DESC");
        }
    }
}
