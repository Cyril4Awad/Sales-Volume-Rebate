using DataService.Engine;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DataService.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class CVRDailyRatesController : ControllerBase
    {
        private readonly CVRDailyRatesEngine _engine;

        public CVRDailyRatesController(CVRDailyRatesEngine engine) => _engine = engine;

        [HttpGet("current")]
        [AllowAnonymous]
        public async Task<IActionResult> GetCurrent()
        {
            var rate = await _engine.GetCurrentUsdLbpRateAsync();
            return Ok(new { rate });
        }
    }
}
