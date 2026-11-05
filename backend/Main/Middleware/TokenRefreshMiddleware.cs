using DataService.Engines.Authentication;
using Main.Security;
using System.Security.Claims;
using System.Text;
using System.Threading.Tasks;
using static System.Formats.Asn1.AsnWriter;

namespace Main.Middleware
{
    public class TokenRefreshMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IServiceProvider serviceProvider;
        private readonly IHttpContextAccessor contextAccessor;

        public TokenRefreshMiddleware(RequestDelegate next, IServiceProvider serviceProvider, IHttpContextAccessor contextAccessor)
        {
            _next = next;
            this.serviceProvider = serviceProvider;
            this.contextAccessor = contextAccessor;
        }

        public async Task InvokeAsync(HttpContext context, AuthenticationEngine authenticationEngine)
        {
            var provider = serviceProvider.CreateScope().ServiceProvider;
            var registered = provider.GetServices<UserTenantContextProvider>().FirstOrDefault();
            var loginProviderId = (ClaimsIdentity)contextAccessor.HttpContext.User.Identity;

            if (loginProviderId != null && loginProviderId.Claims.Count() > 0)
            {
                var user = registered.GetCurrentContextAsync();
                var token = context.Request.Headers["Authorization"].FirstOrDefault()?.Split(" ").Last();

                if (token != null)
                {
                    var newToken = authenticationEngine.GenerateJWT(user.User_Code);
                    if (newToken != null)
                    {
                        context.Response.Headers.Add("_auth", "Bearer " + newToken);
                    }
                }

            }
            await _next(context);
        }
    }
}
