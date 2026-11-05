using DataService.Engine;
using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace DataService.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class Com_CurrencyController : ControllerBase
    {
        private readonly Com_CurrencyEngine _engine;
        private readonly UserTenantContextProvider _userProvider;

        public Com_CurrencyController(Com_CurrencyEngine engine, UserTenantContextProvider userProvider)
        {
            _engine = engine;
            _userProvider = userProvider;
        }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            var data = await _engine.GetAll();
            return Ok(data);
        }

        [HttpGet("{code}")]
        public async Task<IActionResult> GetByCode(string code)
        {
            var data = await _engine.GetByCode(code);
            if (data == null)
                return NotFound();
            return Ok(data);
        }

        [HttpPost]
        public async Task<IActionResult> Insert([FromBody] Com_CurrencyDTO dto)
        {
            var user = _userProvider.GetCurrentContextAsync();
            var result = await _engine.Create(dto, user.User_Code);
            return Ok(result);
        }

        [HttpPut("{code}")]
        public async Task<IActionResult> Update(string code, [FromBody] Com_CurrencyDTO dto)
        {
            var user = _userProvider.GetCurrentContextAsync();
            var result = await _engine.Update(code, dto, user.User_Code);
            return Ok(result);
        }

        [HttpDelete("{code}")]
        public async Task<IActionResult> Delete(string code)
        {
            var result = await _engine.Delete(code);
            return Ok(result);
        }
    }
}