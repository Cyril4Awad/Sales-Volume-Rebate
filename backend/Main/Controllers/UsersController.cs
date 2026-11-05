using DataService.Engines.Main;
using DataService.Models;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Main.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly MainEngine engine;
        private readonly UserTenantContextProvider userProvider;
        private readonly JWTTokenProvider jwtTokenProvider;

        public UsersController(
            MainEngine engine,
            UserTenantContextProvider userProvider,
            JWTTokenProvider jwtTokenProvider)
        {
            this.engine = engine;
            this.userProvider = userProvider;
            this.jwtTokenProvider = jwtTokenProvider;
        }
    }
}
