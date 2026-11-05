using System.IdentityModel.Tokens.Jwt;

namespace Main.Security
{
    public class JWTTokenProvider
    {
        private IHttpContextAccessor contextAccessor;
        public JWTTokenProvider(IHttpContextAccessor contextAccessor)
        {
            this.contextAccessor = contextAccessor;
        }

        public string getJWTToken()
        {
            var token = this.contextAccessor.HttpContext.Request.Headers["Authorization"].ToString().Replace("Bearer ", string.Empty);
            var handler = new JwtSecurityTokenHandler();
            var jsonToken = handler.ReadToken(token) as JwtSecurityToken;
            return jsonToken.UnsafeToString();
        }

    }
}
