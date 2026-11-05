using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]

public class CVRContractClientsController : ControllerBase
{
    private readonly CVRContractClientEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRContractClientsController(CVRContractClientEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await _engine.GetAll());

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CVR_ContractClientDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Create(dto, user.User_Code));
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(decimal id, [FromBody] CVR_ContractClientDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Update(id, dto, user.User_Code));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(decimal id) =>
        Ok(await _engine.Delete(id));
}