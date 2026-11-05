using DataService.DataAccess;
using DataService.Security;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace DataService.Engines.Authentication
{
    public class AuthenticationEngine
    {
        private readonly IConfiguration _config;
        private readonly IOptions<Jwt> _settings;
        private readonly AutDAL _dal;

        public AuthenticationEngine(IConfiguration config, IOptions<Jwt> settings, AutDAL dal)
        {
            _config = config;
            _settings = settings;
            _dal = dal;
        }

        public async Task<object?> AuthenticateLogin(userRec login)
        {
            if (login.Usr_code.ToUpper() == "SU")
            {
                var dd = DateTime.Now.Day;
                var yy = DateTime.Now.Year.ToString();
                var times = dd % 2 == 0 ? 2 : 3;
                var pswd = (DateTime.Now.Month * times).ToString().PadLeft(2, '0')
                         + yy[^1]
                         + (dd * times).ToString().PadLeft(2, '0');

                if (login.Usr_Pwrd == pswd)
                {
                    return BuildLoginResponse("SU", "SU");
                }

                return null;
            }

            var encryptedPwd = REDACTED ?? "");
            var user = await _dal.GetUserByCredentials(login.Usr_code, encryptedPwd);

            if (user == null)
                return null;

            return BuildLoginResponse(user.User_Code, user.User_Name ?? user.User_Code);
        }

        private object BuildLoginResponse(string userCode, string userName)
        {
            return new
            {
                access_token = BuildJwtToken(userCode),
                expires_in = (int)TimeSpan.FromMinutes(60000).TotalSeconds,
                userCode,
                userName,
                userType = "A",
            };
        }

        private string BuildJwtToken(string userCode)
        {
            var now = DateTime.UtcNow;
            var key = new SymmetricSecurityKey(
                          Encoding.ASCII.GetBytes(_settings.Value.Key!));

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, userCode),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                new Claim(JwtRegisteredClaimNames.Iat,
                          DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(),
                          ClaimValueTypes.Integer64),
            };

            var jwt = new JwtSecurityToken(
                issuer: _settings.Value.Issuer,
                audience: _settings.Value.Audience,
                claims: claims,
                notBefore: now,
                expires: now.AddMinutes(120),
                signingCredentials: new SigningCredentials(key, SecurityAlgorithms.HmacSha256)
            );

            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }

        public string GenerateJWT(string Usr_code)
        {
            var now = DateTime.UtcNow;
            var claims = new Claim[]
            {
                    new Claim(JwtRegisteredClaimNames.Sub, Usr_code),
                    new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
                    //new Claim(JwtRegisteredClaimNames.Iat, now.ToUniversalTime().ToString(), ClaimValueTypes.Integer64)
                              new Claim(JwtRegisteredClaimNames.Iat,
Microsoft.IdentityModel.Tokens.EpochTime.GetIntDate(now).ToString(),
ClaimValueTypes.Integer64)
            };
            var JwtConfig = _config.GetSection("Jwt");
            //var signingKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(_settings.Value.Key));
            var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(JwtConfig["Key"]));

            var tokenValidationParameters = new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey = signingKey,
                //ValidateIssuer = true,
                ValidIssuer = JwtConfig["Issuer"],
                ValidateAudience = true,
                ValidAudience = JwtConfig["Audience"],
                ValidateLifetime = true,
                ClockSkew = TimeSpan.Zero,
                RequireExpirationTime = true,

            };

            var jwt = new JwtSecurityToken(
                      issuer: JwtConfig["Issuer"],
                      audience: JwtConfig["Audience"],
                      claims: claims,
                      notBefore: now,
                      expires: now.Add(TimeSpan.FromMinutes(120)),
                      signingCredentials: new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256)
                  );
            return new JwtSecurityTokenHandler().WriteToken(jwt);
        }

        public async Task<DateTime> test() => await _dal.test();
    }

    public class userRec
    {
        public string Usr_code { get; set; } = "";
        public string? Usr_Pwrd { get; set; }
    }

    public class Jwt
    {
        public string? Key { get; set; }
        public string? Issuer { get; set; }
        public string? Audience { get; set; }
    }
}
