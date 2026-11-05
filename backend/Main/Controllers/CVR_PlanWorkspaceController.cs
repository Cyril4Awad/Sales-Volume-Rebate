using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

/// <summary>
/// Unified endpoint for the VR Plans Workspace.
/// Handles the full plan (master + targets + conditions + settlement config)
/// in a single transactional bulk-save.
/// </summary>
[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRPlanWorkspaceController : ControllerBase
{
    private readonly CVRPlanWorkspaceEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRPlanWorkspaceController(CVRPlanWorkspaceEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    /// <summary>
    /// Returns all plans with their nested sub-items.
    /// GET /api/CVRPlanWorkspace
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> Get()
    {
        return Ok(await _engine.GetAll());
    }

    [HttpGet("appCurrencies")]
    public async Task<IActionResult> GetAppCurrencies()
    {
        var currencies = await _engine.GetAppCurrenciesAsync();
        return Ok(currencies);
    }

    /// <summary>
    /// Saves all workspace changes (inserts, updates, deletes) in one transaction.
    /// POST /api/CVRPlanWorkspace/bulk-save
    /// Body: { newPlans: [...], modifiedPlans: [...], deletedPlanIds: [...] }
    /// </summary>
    [HttpPost("bulk-save")]
    public async Task<IActionResult> BulkSave([FromBody] CVR_WorkspaceSavePayload payload)
    {
        var user = _userProvider.GetCurrentContextAsync();
        return Ok(await _engine.BulkSave(payload, user.User_Code));
    }
}