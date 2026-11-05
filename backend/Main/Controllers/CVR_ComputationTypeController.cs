using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRComputationTypesController : ControllerBase
{
    private readonly CVRComputationTypeEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRComputationTypesController(CVRComputationTypeEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await _engine.GetAll());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CVR_ComputationTypeDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Create(dto, user.User_Code));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(decimal id, [FromBody] CVR_ComputationTypeDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Update(id, dto, user.User_Code));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(decimal id) =>
        Ok(await _engine.Delete(id));
}