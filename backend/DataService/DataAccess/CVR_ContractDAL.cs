using Dapper;

using DataService.Models.DTOs;

using DataService.Others;

using Microsoft.AspNetCore.Http;

using Microsoft.Data.SqlClient;

using Microsoft.Extensions.Configuration;

using System.Text;



public class CVRContractDAL

{

    private const string PdfDataUrlPrefix = "data:application/pdf;base64,";



    private readonly IConfiguration _config;

    public CVRContractDAL(IConfiguration config) => _config = config;



    private SqlConnection Con() =>

        new SqlConnection(_config.GetConnectionString("Constr"));



    public async Task<IEnumerable<dynamic>> GetAll()

    {

        using var con = Con();

        var rows = (await con.QueryAsync(@"

        SELECT CTR_ContractID, CTR_ClientID, CTR_ContractReference,

               CTR_ContractName, CTR_StartDate, CTR_EndDate,

               CTR_Terms, CTR_Remarks, CTR_Active, CTR_ContractCurrency, CTR_Document,

               CTR_DocumentName

        FROM   CVR_Contracts

        ORDER  BY CTR_ContractID")).ToList();



        foreach (IDictionary<string, object> row in rows)

        {

            if (row["CTR_Document"] is not byte[] bytes || bytes.Length == 0)

            {

                row["CTR_Document"] = null;

                continue;

            }



            var rawBytes = bytes;

            string? legacyName = null;

            if (TryDecodeLegacyUtf8DataUrlStored(bytes, out var repaired, out var ln))

            {

                rawBytes = repaired;

                legacyName = ln;

            }



            var nameFromRow = row["CTR_DocumentName"] as string;

            if (string.IsNullOrWhiteSpace(nameFromRow) && !string.IsNullOrWhiteSpace(legacyName))

                row["CTR_DocumentName"] = legacyName;



            row["CTR_Document"] = PdfDataUrlPrefix + Convert.ToBase64String(rawBytes);

        }



        return rows;

    }



    public async Task<int> Insert(CVR_ContractDto dto, string user)

    {

        var terms = dto.Terms ?? null;

        var remarks = dto.Remarks ?? null;



        using var con = Con();

        byte[]? fileBytes = null;

        string? fileName = null;

        if (dto.Document != null)

        {

            (fileBytes, fileName) = await ReadUploadedDocumentAsync(dto.Document);

        }



        return await con.ExecuteScalarAsync<int>(@"

        INSERT INTO CVR_Contracts

            (CTR_ClientID, CTR_ContractReference, CTR_ContractName,

             CTR_StartDate, CTR_EndDate, CTR_Terms, CTR_Remarks,

             CTR_Active, CTR_ContractCurrency, CTR_Document, CTR_DocumentName,

             CTR_CDStamp, CTR_CUStamp, CTR_MDStamp, CTR_MUStamp)

        OUTPUT INSERTED.CTR_ContractID

        VALUES

            (@ClientID, @ContractReference, @ContractName,

             @StartDate, @EndDate, @Terms, @Remarks,

             @Active, @ContractCurrency, @Document, @DocumentName,

             GETDATE(), @User, GETDATE(), @User)",

            new

            {

                dto.ClientID,

                dto.ContractReference,

                dto.ContractName,

                dto.StartDate,

                dto.EndDate,

                Terms = terms,

                Remarks = remarks,

                dto.Active,

                ContractCurrency = NormalizeContractCurrency(dto.ContractCurrency),

                Document = fileBytes,

                DocumentName = fileName,

                User = user

            });

    }



    public async Task<int> Update(decimal id, CVR_ContractDto dto, string user)

    {

        var terms = dto.Terms ?? null;

        var remarks = dto.Remarks ?? null;



        using var con = Con();



        if (dto.DeleteDocument)

        {

            return await con.ExecuteAsync(@"

            UPDATE CVR_Contracts SET

                CTR_ClientID          = @ClientID,

                CTR_ContractReference = @ContractReference,

                CTR_ContractName      = @ContractName,

                CTR_StartDate         = @StartDate,

                CTR_EndDate           = @EndDate,

                CTR_Terms             = @Terms,

                CTR_Remarks           = @Remarks,

                CTR_Active            = @Active,

                CTR_ContractCurrency  = @ContractCurrency,

                CTR_Document          = NULL,

                CTR_DocumentName      = NULL,

                CTR_MDStamp         = GETDATE(),

                CTR_MUStamp         = @User

            WHERE CTR_ContractID = @Id",

                new

                {

                    Id = id,

                    dto.ClientID,

                    dto.ContractReference,

                    dto.ContractName,

                    dto.StartDate,

                    dto.EndDate,

                    Terms = terms,

                    Remarks = remarks,

                    dto.Active,

                    ContractCurrency = NormalizeContractCurrency(dto.ContractCurrency),

                    User = user

                });

        }



        if (dto.Document != null)

        {

            var (fileBytes, fileName) = await ReadUploadedDocumentAsync(dto.Document);



            return await con.ExecuteAsync(@"

            UPDATE CVR_Contracts SET

                CTR_ClientID          = @ClientID,

                CTR_ContractReference = @ContractReference,

                CTR_ContractName      = @ContractName,

                CTR_StartDate         = @StartDate,

                CTR_EndDate           = @EndDate,

                CTR_Terms             = @Terms,

                CTR_Remarks           = @Remarks,

                CTR_Active            = @Active,

                CTR_ContractCurrency  = @ContractCurrency,

                CTR_Document          = @Document,

                CTR_DocumentName      = @DocumentName,

                CTR_MDStamp         = GETDATE(),

                CTR_MUStamp         = @User

            WHERE CTR_ContractID = @Id",

                new

                {

                    Id = id,

                    dto.ClientID,

                    dto.ContractReference,

                    dto.ContractName,

                    dto.StartDate,

                    dto.EndDate,

                    Terms = terms,

                    Remarks = remarks,

                    dto.Active,

                    ContractCurrency = NormalizeContractCurrency(dto.ContractCurrency),

                    Document = fileBytes,

                    DocumentName = fileName,

                    User = user

                });

        }



        return await con.ExecuteAsync(@"

        UPDATE CVR_Contracts SET

            CTR_ClientID          = @ClientID,

            CTR_ContractReference = @ContractReference,

            CTR_ContractName      = @ContractName,

            CTR_StartDate         = @StartDate,

            CTR_EndDate           = @EndDate,

            CTR_Terms             = @Terms,

            CTR_Remarks           = @Remarks,

            CTR_Active            = @Active,

            CTR_ContractCurrency  = @ContractCurrency,

            CTR_MDStamp         = GETDATE(),

            CTR_MUStamp         = @User

        WHERE CTR_ContractID = @Id",

            new

            {

                Id = id,

                dto.ClientID,

                dto.ContractReference,

                dto.ContractName,

                dto.StartDate,

                dto.EndDate,

                Terms = terms,

                Remarks = remarks,

                dto.Active,

                ContractCurrency = NormalizeContractCurrency(dto.ContractCurrency),

                User = user

            });

    }



    public async Task<int> Delete(decimal id)

    {

        using var con = Con();

        return await con.ExecuteAsync(

            "DELETE FROM CVR_Contracts WHERE CTR_ContractID = @Id",

            new { Id = id });

    }



    public async Task<bool> ReferenceExists(string reference, int? excludeContractId = null)

    {

        var normalized = NormalizeContractReference(reference);

        if (string.IsNullOrEmpty(normalized))

            return false;



        using var con = Con();

        const string sql = @"

            SELECT CASE WHEN EXISTS (

                SELECT 1

                FROM CVR_Contracts

                WHERE LOWER(LTRIM(RTRIM(CTR_ContractReference))) = @Ref

                  AND (@ExcludeId IS NULL OR CTR_ContractID <> @ExcludeId)

            ) THEN 1 ELSE 0 END";



        return await con.ExecuteScalarAsync<bool>(sql, new

        {

            Ref = normalized,

            ExcludeId = excludeContractId,

        });

    }



    private static string NormalizeContractReference(string? value) =>

        (value ?? "").Trim().ToLowerInvariant();



    private static string? NormalizeContractCurrency(string? value)
    {
        var s = (value ?? "").Trim().ToUpperInvariant();
        return string.IsNullOrEmpty(s) ? null : s;
    }



    /// <summary>Raw PDF bytes and filename only (no content-type persistence).</summary>

    private static async Task<(byte[] Bytes, string? FileName)> ReadUploadedDocumentAsync(IFormFile file)

    {

        using var ms = new MemoryStream();

        await file.CopyToAsync(ms);

        var raw = ms.ToArray();



        if (!IsPdfBytes(raw))

            throw new ValidationException("Only PDF documents are allowed. The uploaded file is not a valid PDF.");



        var fn = Path.GetFileName(file.FileName ?? string.Empty);

        if (string.IsNullOrWhiteSpace(fn))

            fn = null;



        return (raw, fn);

    }



    private static bool IsPdfBytes(byte[] bytes) =>

        bytes.Length >= 4

        && bytes[0] == 0x25

        && bytes[1] == 0x50

        && bytes[2] == 0x44

        && bytes[3] == 0x46;



    /// <summary>

    /// Detects rows that still store a UTF-8 text data-URL in CTR_Document (legacy) and returns decoded payload + parsed name.

    /// </summary>

    private static bool TryDecodeLegacyUtf8DataUrlStored(byte[] bytes, out byte[] payload, out string? name)

    {

        payload = bytes;

        name = null;

        if (bytes.Length < 10)

            return false;



        ReadOnlySpan<byte> span = bytes;

        if (span.Length >= 3 && span[0] == 0xEF && span[1] == 0xBB && span[2] == 0xBF)

            span = span.Slice(3);



        ReadOnlySpan<byte> dataPrefix = stackalloc byte[] { (byte)'d', (byte)'a', (byte)'t', (byte)'a', (byte)':' };

        if (span.Length < dataPrefix.Length || !span.StartsWith(dataPrefix))

            return false;



        string s;

        try

        {

            s = Encoding.UTF8.GetString(bytes);

        }

        catch

        {

            return false;

        }



        if (!s.StartsWith("data:", StringComparison.OrdinalIgnoreCase))

            return false;



        const string marker = ";base64,";

        var idx = s.IndexOf(marker, StringComparison.Ordinal);

        if (idx < 0)

            return false;



        var b64 = s[(idx + marker.Length)..].Replace("\r", "").Replace("\n", "").Replace(" ", "");

        byte[] decoded;

        try

        {

            decoded = Convert.FromBase64String(b64);

        }

        catch

        {

            return false;

        }



        var meta = s.Substring(5, idx - 5);

        var nameIdx = meta.IndexOf(";name=", StringComparison.OrdinalIgnoreCase);

        if (nameIdx >= 0)

        {

            var start = nameIdx + ";name=".Length;

            var end = meta.IndexOf(';', start);

            var rawName = end > start ? meta[start..end] : meta[start..];

            try

            {

                name = Uri.UnescapeDataString(rawName);

            }

            catch

            {

                name = rawName;

            }

        }



        payload = decoded;

        return true;

    }

}

