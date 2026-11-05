using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]

public class CVRContractsController : ControllerBase
{
    private readonly CVRContractEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRContractsController(CVRContractEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    [HttpGet]
    public async Task<IActionResult> Get() =>
        Ok(await _engine.GetAll());

    [HttpGet("reference-exists")]
    public async Task<IActionResult> ReferenceExists(
        [FromQuery] string reference,
        [FromQuery] int? excludeContractId = null)
    {
        var exists = await _engine.ReferenceExists(reference, excludeContractId);
        return Ok(new { exists });
    }

    // CVRContractsController.cs
    [HttpPost]
    public async Task<IActionResult> Create([FromForm] CVR_ContractDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        var newId = await _engine.Create(dto, user.User_Code);
        return Ok(new { CTR_ContractID = newId });   // ← return object, not raw int
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(decimal id, [FromForm] CVR_ContractDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Update(id, dto, user.User_Code));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(decimal id) =>
        Ok(await _engine.Delete(id));
}