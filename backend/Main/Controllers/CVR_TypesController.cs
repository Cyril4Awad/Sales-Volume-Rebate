using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRTypesController : ControllerBase
{
    private readonly CVRTypeEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRTypesController(CVRTypeEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(await _engine.GetAll());
    }

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CVR_TypeDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Create(dto, user.User_Code));
    }

    [HttpPost("bulk-save")]
    public async Task<IActionResult> BulkSave([FromBody] List<CVR_TypeDto> list)
    {
        var user = _userProvider.GetCurrentContextAsync();
        await _engine.BulkSave(list, user.User_Code);
        return Ok();
    }

    [HttpPut("{id}")]
    public async Task<IActionResult> Update(decimal id, [FromBody] CVR_TypeDto dto)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.Update(id, dto, user.User_Code));
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> Delete(decimal id)
    {
        return Ok(await _engine.Delete(id));
    }
}
