using DataService.Models.DTOs;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

/// <summary>
/// Read-only lookup endpoints used by the reference-selection modals in the frontend.
/// GET /api/CVRLookups/stock-items?skip=0&amp;take=50&amp;search=
/// GET /api/CVRLookups/product-groups?skip=0&amp;take=50&amp;search=
/// </summary>
[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CVRLookupsController : ControllerBase
{
    private const int MaxTake = 200;
    private const int DefaultTake = 50;

    private readonly CVRLookupsDAL _dal;

    public CVRLookupsController(CVRLookupsDAL dal) => _dal = dal;

    /// <summary>
    /// Paged stock items: { items, totalCount }.
    /// Columns: STK_RECID, STK_REF, STK_DESC, DBAR_BARCODE, STK_UNIT
    /// </summary>
    [HttpGet("stock-items")]
    public async Task<IActionResult> GetStockItems(
        int skip = 0,
        int take = DefaultTake,
        string? search = null)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var (items, totalCount) = await _dal.GetStockItemsPage(
            skip,
            take,
            string.IsNullOrWhiteSpace(search) ? null : search.Trim());

        return Ok(new { items, totalCount });
    }

    /// <summary>
    /// Paged product groups: { items, totalCount }.
    /// Columns: IT_RecID, IT_Code, IT_DESC, GRP_CODE, GRP_DESC
    /// </summary>
    [HttpGet("product-groups")]
    public async Task<IActionResult> GetProductGroups(
        int skip = 0,
        int take = DefaultTake,
        string? search = null)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var (items, totalCount) = await _dal.GetProductGroupsPage(
            skip,
            take,
            string.IsNullOrWhiteSpace(search) ? null : search.Trim());

        return Ok(new { items, totalCount });
    }

    /// <summary>
    /// Deployment Location/CashReg active checks against ERP tables.
    /// GET /api/CVRLookups/location-cashreg-status
    /// </summary>
    [HttpGet("location-cashreg-status")]
    public async Task<IActionResult> GetLocationCashRegStatus()
    {
        var status = await _dal.GetLocationCashRegStatusAsync();
        return Ok(new
        {
            locationValid = status.LocationValid,
            cashRegValid = status.CashRegValid,
        });
    }

    /// <summary>
    /// GET /api/CVRLookups/last-accounting-generation-date
    /// </summary>
    [HttpGet("last-accounting-generation-date")]
    public async Task<IActionResult> GetLastAccountingGenerationDate()
    {
        var generationDate = await _dal.GetLastAccountingGenerationDateAsync();
        return Ok(new { generationDate });
    }
}
