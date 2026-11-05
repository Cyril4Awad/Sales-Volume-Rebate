using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

public class ClientsDAL
{
    private const int MaxTake = 200;
    private const int DefaultTake = 50;

    private readonly IConfiguration _config;

    public ClientsDAL(IConfiguration config) => _config = config;

    private SqlConnection Con() =>
        new SqlConnection(_config.GetConnectionString("Constr"));

    private const string FromWhere = @"
FROM stk04_clients
LEFT JOIN Com_Folio         ON CL_FolioNo  = FO_SerNo AND CL_FolioSubNo = FO_SubNo
LEFT JOIN STK04_Employee    ON E_Code       = CL_ACExec
LEFT JOIN Stk04_ClientType  ON ClTp_Code    = CL_Type
WHERE CL_Type <> 'FID'
  AND CL_ACTIVE = 'Y'
  AND (@ExcludeClientId IS NULL OR CL_RecID <> @ExcludeClientId)
  AND (
        @Like IS NULL
        OR CL_Name LIKE @Like
        OR CONVERT(VARCHAR(50), CL_Code) LIKE @Like
      )";

    private const string FromWhereContractMainClients = @"
FROM stk04_clients
LEFT JOIN Com_Folio         ON CL_FolioNo  = FO_SerNo AND CL_FolioSubNo = FO_SubNo
LEFT JOIN STK04_Employee    ON E_Code       = CL_ACExec
LEFT JOIN Stk04_ClientType  ON ClTp_Code    = CL_Type
WHERE CL_Type <> 'FID'
  AND CL_ACTIVE = 'Y'
  AND EXISTS (SELECT 1 FROM CVR_Contracts WHERE CTR_ClientID = CL_RecID)
  AND (@ExcludeClientId IS NULL OR CL_RecID <> @ExcludeClientId)
  AND (
        @Like IS NULL
        OR CL_Name LIKE @Like
        OR CONVERT(VARCHAR(50), CL_Code) LIKE @Like
      )";

    private const string SelectList = @"
SELECT
    CL_RecID                        AS ClientID,
    CONVERT(VARCHAR(50), CL_Code)   AS ClientCode,
    CONVERT(VARCHAR(50), cl_no)     AS ClientNo,
    CL_Name                         AS ClientName,
    ISNULL(E_Name, '')              AS AE,
    ISNULL(Fo_MOF, '')              AS MOF,
    ISNULL(FO_Addres, '')           AS Address,
    ISNULL(FO_Phone1, '')           AS Phone1,
    ISNULL(FO_Phone2, '')           AS Phone2,
    CASE
        WHEN CL_PriceCat = 'r' THEN 'Retail'
        WHEN CL_PriceCat = 'W' THEN 'Wholesale'
        WHEN CL_PriceCat = 'F' THEN 'Franchise'
        WHEN CL_PriceCat = 'X' THEN 'Export'
        ELSE ''
    END                             AS Categ,
    ISNULL(ClTp_Desc, '')           AS ClientType";

    public async Task<(IReadOnlyList<ClientDto> Items, int TotalCount)> GetActiveClientsPage(
        int skip = 0,
        int take = DefaultTake,
        string? search = null,
        int? excludeClientId = null,
        bool onlyContractMainClients = false)
    {
        if (take <= 0) take = DefaultTake;
        if (take > MaxTake) take = MaxTake;
        if (skip < 0) skip = 0;

        var like = BuildLikePattern(search);
        var fromWhere = onlyContractMainClients ? FromWhereContractMainClients : FromWhere;

        using var con = Con();

        var countSql = "SELECT COUNT(*) " + fromWhere;
        var totalCount = await con.ExecuteScalarAsync<int>(countSql, new
        {
            ExcludeClientId = excludeClientId,
            Like = like,
        });

        var dataSql = SelectList + " " + fromWhere + @"
ORDER BY CL_Code, CL_No
OFFSET @Skip ROWS FETCH NEXT @Take ROWS ONLY";

        var rows = (await con.QueryAsync<ClientDto>(dataSql, new
        {
            Skip = skip,
            Take = take,
            ExcludeClientId = excludeClientId,
            Like = like,
        })).ToList();

        return (rows, totalCount);
    }

    public async Task<IReadOnlyList<ClientLookupRowDto>> LookupClientsByIds(IEnumerable<int> ids)
    {
        var idList = ids?.Where(i => i > 0).Distinct().Take(2000).ToList() ?? new List<int>();
        if (idList.Count == 0)
            return Array.Empty<ClientLookupRowDto>();

        using var con = Con();
        return (await con.QueryAsync<ClientLookupRowDto>(@"
SELECT CL_RecID                       AS ClientID,
       CONVERT(VARCHAR(50), CL_Code)  AS ClientCode,
       CONVERT(VARCHAR(50), cl_no)    AS ClientNo,
       CL_Name                        AS ClientName
FROM   stk04_clients
WHERE  CL_Type <> 'FID'
  AND  CL_RecID IN @Ids",
            new { Ids = idList })).ToList();
    }

    private static string? BuildLikePattern(string? search)
    {
        if (string.IsNullOrWhiteSpace(search)) return null;
        var t = search.Trim();
        if (t.Length == 0) return null;
        t = t.Replace("[", "[[]").Replace("%", "[%]").Replace("_", "[_]");
        return "%" + t + "%";
    }
}