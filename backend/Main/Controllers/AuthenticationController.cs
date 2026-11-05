using DataService.Engines.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Main.Controllers
{
    [AllowAnonymous]
    [Route("api/[controller]")]
    [ApiController]
    public class AuthenticationController : ControllerBase
    {
        private readonly AuthenticationEngine _authenticationEngine;

        public AuthenticationController(AuthenticationEngine authenticationEngine)
        {
            _authenticationEngine = authenticationEngine;
        }

        [HttpPost("Login")]
        public async Task<IActionResult> Login([FromBody] userRec login)
        {
            var res = await _authenticationEngine.AuthenticateLogin(login);
            if (res != null)
                return Ok(res);

            return Unauthorized("Invalid username or password.");
        }

        [HttpPost("GetTokenLogin")]
        public async Task<IActionResult> GetTokenLogin([FromBody] userRec login)
        {
            var res = await _authenticationEngine.AuthenticateLogin(login);
            if (res != null)
                return Ok(res);

            return Unauthorized("Invalid username or password.");
        }

        [HttpGet("test")]
        public async Task<DateTime> Test()
        {
            return await _authenticationEngine.test();
        }
    }
}
