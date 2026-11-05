using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class CVRLookupsDAL
{
    private const int MaxTake = 200;
    private const int DefaultTake = 50;

    private readonly IConfiguration _config;

    public CVRLookupsDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    private const string StockFromWhere = @"
FROM STK04_STKFIL s
LEFT JOIN dbo.Stk04_DetBarcode b ON b.DBAR_STKID = s.STK_RECID
WHERE s.STK_ACTIVE = 'y'
  AND (
        @Like IS NULL
        OR s.STK_REF LIKE @Like
        OR s.STK_DESC LIKE @Like
        OR b.DBAR_BARCODE LIKE @Like
      )";

    private const string ProductGroupFromWhere = @"
FROM STK04_ItemType it
INNER JOIN Stk04_Group g ON it.IT_Group = g.GRP_CODE
WHERE it.IT_ACTIVE = 'y'
  AND g.GRP_ACTIVE = 'y'
  AND (
        @Like IS NULL
        OR it.IT_Code LIKE @Like
        OR it.IT_DESC LIKE @Like
        OR g.GRP_CODE LIKE @Like
        OR g.GRP_DESC LIKE @Like
      )";

    public async Task<(IReadOnlyList<StockItemLookupDto> Items, int TotalCount)> GetStockItemsPage(
        int skip = 0,
        int take = DefaultTake,
        string? search = null)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var like = BuildLikePattern(search);

        using var con = Con();

        var countSql = "SELECT COUNT(DISTINCT s.STK_RECID) " + StockFromWhere;
        var totalCount = await con.ExecuteScalarAsync<int>(countSql, new { Like = like });

        const string selectList = @"
SELECT
    s.STK_RECID,
    s.STK_REF,
    s.STK_DESC,
    MAX(b.DBAR_BARCODE) AS DBAR_BARCODE,
    s.STK_UNIT";

        var dataSql = selectList + StockFromWhere + @"
GROUP BY s.STK_RECID, s.STK_REF, s.STK_DESC, s.STK_UNIT
ORDER BY s.STK_REF, s.STK_RECID
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY";

        var rows = (await con.QueryAsync<StockItemLookupDto>(dataSql, new
        {
            Skip = skip,
            Take = take,
            Like = like,
        })).ToList();

        return (rows, totalCount);
    }

    public async Task<(IReadOnlyList<ProductGroupLookupDto> Items, int TotalCount)> GetProductGroupsPage(
        int skip = 0,
        int take = DefaultTake,
        string? search = null)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var like = BuildLikePattern(search);

        using var con = Con();

        var countSql = "SELECT COUNT(*) " + ProductGroupFromWhere;
        var totalCount = await con.ExecuteScalarAsync<int>(countSql, new { Like = like });

        const string selectList = @"
SELECT
    it.IT_RecID,
    it.IT_Code,
    it.IT_DESC,
    g.GRP_CODE,
    g.GRP_DESC";

        var dataSql = selectList + ProductGroupFromWhere + @"
ORDER BY it.IT_Code, it.IT_RecID
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY";

        var rows = (await con.QueryAsync<ProductGroupLookupDto>(dataSql, new
        {
            Skip = skip,
            Take = take,
            Like = like,
        })).ToList();

        return (rows, totalCount);
    }

    public async Task<LocationCashRegStatusDto> GetLocationCashRegStatusAsync()
    {
        var locationCode = _config["Location"]?.Trim();
        var cashRegCode = _config["CashReg"]?.Trim();

        var locationValid = false;
        var cashRegValid = false;

        using var con = Con();

        if (!string.IsNullOrWhiteSpace(locationCode))
        {
            locationValid = await con.ExecuteScalarAsync<int?>(
                @"SELECT 1 FROM stk04_location
                  WHERE Loc_Code = @LocationCode AND Loc_Active = 'Y'",
                new { LocationCode = locationCode }) == 1;
        }

        if (!string.IsNullOrWhiteSpace(locationCode) && !string.IsNullOrWhiteSpace(cashRegCode))
        {
            cashRegValid = await con.ExecuteScalarAsync<int?>(
                @"SELECT 1 FROM pos_cashreg
                  WHERE CR_Loc = @LocationCode AND CR_Code = @CashRegCode AND CR_Active = 'Y'",
                new { LocationCode = locationCode, CashRegCode = cashRegCode }) == 1;
        }

        return new LocationCashRegStatusDto
        {
            LocationValid = locationValid,
            CashRegValid = cashRegValid,
        };
    }

    public async Task<PosoAppCompDto> GetPosoAppCompAsync()
    {
        using var con = Con();
        var row = await con.QueryFirstOrDefaultAsync<PosoAppCompDto>(@"
SELECT TOP 1
    Ac_Comp  AS Comp,
    Ac_Year  AS [Year],
    Ac_Curr1 AS Curr1,
    Ac_Curr2 AS Curr2
FROM Com_Appcomp
WHERE Ac_Code = 'POSO'
ORDER BY Ac_Comp");

        if (row == null
            || string.IsNullOrWhiteSpace(row.Comp)
            || string.IsNullOrWhiteSpace(row.Year)
            || string.IsNullOrWhiteSpace(row.Curr1)
            || string.IsNullOrWhiteSpace(row.Curr2))
        {
            throw new InvalidOperationException(
                "POSO application company settings were not found in Com_Appcomp (Ac_Code = 'POSO').");
        }

        row.Comp = row.Comp.Trim();
        row.Year = row.Year.Trim();
        row.Curr1 = row.Curr1.Trim();
        row.Curr2 = row.Curr2.Trim();
        return row;
    }

    /// <summary>
    /// Latest accounting generation timestamp from sum control (POS sales posted to accounting).
    /// </summary>
    public async Task<DateTime?> GetLastAccountingGenerationDateAsync()
    {
        using var con = Con();
        return await con.ExecuteScalarAsync<DateTime?>(@"
SELECT MAX(sc_acdate)
FROM stk04_sumcontrol
WHERE sc_source = '2'
  AND sc_vtype IS NOT NULL");
    }

    public async Task<string> GetCashRegComputerNameAsync(string locationCode, string cashReg)
    {
        if (string.IsNullOrWhiteSpace(locationCode) || string.IsNullOrWhiteSpace(cashReg))
        {
            throw new InvalidOperationException(
                "Location and CashReg are required to resolve cash register computer name.");
        }

        using var con = Con();
        var name = await con.ExecuteScalarAsync<string?>(@"
SELECT CR_CompName
FROM pos_cashreg
WHERE CR_Loc = @LocationCode AND CR_Code = @CashRegCode AND CR_Active = 'Y'",
            new { LocationCode = locationCode.Trim(), CashRegCode = cashReg.Trim() });

        if (string.IsNullOrWhiteSpace(name))
        {
            throw new InvalidOperationException(
                $"Cash register computer name (CR_CompName) was not found for Location '{locationCode.Trim()}' / CashReg '{cashReg.Trim()}'.");
        }

        return name.Trim();
    }

    private static string? BuildLikePattern(string? search)
    {
        if (string.IsNullOrWhiteSpace(search))
            return null;
        var t = search.Trim();
        if (t.Length == 0)
            return null;
        t = t.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
        return "%" + t + "%";
    }
}
