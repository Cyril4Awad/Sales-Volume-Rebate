using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;

namespace Main.Security
{
    public class UserTenantContextProvider
    {
        private readonly IHttpContextAccessor _contextAccessor;
        private UserTenantContext? _userTenantContext;

        public UserTenantContextProvider(IHttpContextAccessor contextAccessor)
        {
            _contextAccessor = contextAccessor;
        }

        public UserTenantContext GetCurrentContextAsync()
        {
            if (_userTenantContext != null)
                return _userTenantContext;

            var user = _contextAccessor.HttpContext?.User;
            var userCode = user?.FindFirst(JwtRegisteredClaimNames.Sub)?.Value
                        ?? user?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                        ?? user?.FindFirst(ClaimTypes.Name)?.Value
                        ?? "SU";

            _userTenantContext = new UserTenantContext
            {
                User_Code = userCode,
                User_Name = userCode,
            };

            return _userTenantContext;
        }
    }
}
