using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRSettlementPaymentsController : ControllerBase
{
    private readonly CVRSettlementPaymentEngine _engine;
    private readonly UserTenantContextProvider _userProvider;

    public CVRSettlementPaymentsController(CVRSettlementPaymentEngine engine, UserTenantContextProvider userProvider)
    {
        _engine = engine;
        _userProvider = userProvider;
    }

    [HttpGet]
    public async Task<IActionResult> Get([FromQuery] int planId)
    {
        if (planId <= 0)
            return BadRequest("planId is required.");

        return Ok(await _engine.GetByPlanIdAsync(planId));
    }

    [HttpPost("process-target")]
    public async Task<IActionResult> ProcessTarget([FromBody] CVR_ProcessTargetSettlementRequest request)
    {
        if (request == null || request.TargetId <= 0)
            return BadRequest("targetId is required.");

        try
        {
            var user = _userProvider.GetCurrentContextAsync();
            var result = await _engine.ProcessTargetAsync(request, user.User_Code);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    [HttpPost("process-fees-batch")]
    public async Task<IActionResult> ProcessFeesBatch([FromBody] CVR_ProcessFeesSettlementBatchRequest request)
    {
        if (request?.FeeIds == null || request.FeeIds.Count == 0)
            return BadRequest("At least one fee is required.");

        try
        {
            var user = _userProvider.GetCurrentContextAsync();
            var result = await _engine.ProcessFeesBatchAsync(request, user.User_Code);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(ex.Message);
        }
    }
}
