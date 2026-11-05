using Dapper;
using DataService.Models;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System;

namespace DataService.DataAccess
{
    public class AutDAL
    {
        private readonly IConfiguration _config;

        public AutDAL(IConfiguration configuration)
        {
            _config = configuration;
        }

        public async Task<COM_UserInfo?> GetUserByCredentials(string userCode, string password)
        {
            using var con = new SqlConnection(_config.GetConnectionString("Constr"));
            return await con.QueryFirstOrDefaultAsync<COM_UserInfo>(
                @"SELECT User_Code, User_Name, User_Pwd, User_Status
                  FROM   com_userinfo
                  WHERE  User_Code = @Code
                    AND  User_Pwd  = @Pwd
                    AND  ISNULL(User_Status, 'I') = 'A'",
                new { Code = userCode, Pwd = password }
            );
        }
        public async Task<COM_UserInfo?> GetUserByCode(string userCode)
        {
            using var con = new SqlConnection(_config.GetConnectionString("Constr"));
            return await con.QueryFirstOrDefaultAsync<COM_UserInfo>(
                @"SELECT User_Code, User_Name, User_Pwd, User_Status
          FROM   com_userinfo
          WHERE  User_Code = @Code",
                new { Code = userCode }
            );
        }
        public async Task<DateTime> test()
        {
            using var con = new SqlConnection(_config.GetConnectionString("Constr"));
            var dt = (await con.ExecuteScalarAsync("SELECT GETDATE()"))?.ToString();
            DateTime.TryParse(dt, out var res);
            return res;
        }
    }
}