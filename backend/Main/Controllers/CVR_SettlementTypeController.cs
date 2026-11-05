using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRSettlementTypesController : ControllerBase
{
    private readonly CVRSettlementTypeEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRSettlementTypesController(CVRSettlementTypeEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await _engine.GetAll());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CVR_SettlementTypeDto dto)
    {
        try
        {
            var user = _userProvider.GetCurrentContextAsync();
            return Ok(await _engine.Create(dto, user.User_Code));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(decimal id, [FromBody] CVR_SettlementTypeDto dto)
    {
        try
        {
            var user = _userProvider.GetCurrentContextAsync();
            return Ok(await _engine.Update(id, dto, user.User_Code));
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(decimal id) =>
        Ok(await _engine.Delete(id));
}