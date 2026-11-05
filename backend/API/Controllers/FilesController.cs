using DataService.Storage;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;

namespace Authentication.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class FilesController : ControllerBase
    {
        private readonly IWebHostEnvironment _env;

        private readonly string _assetsRoot;
        private readonly IStorage _storage; 
        public FilesController(IWebHostEnvironment env,IStorage storage)
        {
            _env = env;
            _assetsRoot = Path.Combine(env.ContentRootPath, "assets");
            _storage = storage;
        }

        [HttpGet("generate")]
        public async Task<IActionResult> Generate([FromQuery] string input)
        {
            if (string.IsNullOrWhiteSpace(input))
                return BadRequest("Input string cannot be empty.");

            // 1) Sanitize folder name based on DateTime
            var folderName = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            var folderPath = Path.Combine(_assetsRoot, folderName);
            Directory.CreateDirectory(folderPath);

            // 2) Create text file
            var fileName = "output.txt";
            var fullPath = Path.Combine(folderPath, fileName);

            await System.IO.File.WriteAllTextAsync(fullPath, input);

            // 3) Build public URL (exposed at /media/*)
            var relativePath = Path.Combine(folderName, fileName)
                                  .Replace("\\", "/"); // normalize slashes
            var url = $"{Request.Scheme}://{Request.Host}/media/{relativePath}";

            return Ok(new { url });

        }

        [HttpGet("serve")]
        public IActionResult Serve([FromQuery] string folder, [FromQuery] string file, [FromQuery] bool download = true)
        {
            if (string.IsNullOrWhiteSpace(folder) || string.IsNullOrWhiteSpace(file))
                return BadRequest("Folder and file parameters are required.");

            // Reconstruct the physical path
            var fullPath = Path.Combine(_assetsRoot, folder, file);

            if (!System.IO.File.Exists(fullPath))
                return NotFound("File not found.");

            // Detect content type
            var provider = new FileExtensionContentTypeProvider();
            if (!provider.TryGetContentType(file, out var contentType))
            {
                // fallback if extension is unknown
                contentType = "application/octet-stream";
            }

            if (download)
            {
                //To force a download, send a Content-Disposition: attachment header. Easiest way in ASP.NET Core is to use the fileDownloadName overload,
                //which automatically sets that heade
                // This sets: Content-Disposition: attachment; filename="<file>" so that 
                // (and keeps correct Content-Type)
                return PhysicalFile(fullPath, contentType, file);
            }

            // Infer content type
            //var contentType = "text/plain"; // could use FileExtensionContentTypeProvider
            return PhysicalFile(fullPath, contentType, enableRangeProcessing: true);
        }


            // POST /api/storage/upload
    // Form fields:
    //   files: one or more files
    //   folder (optional): relative folder (defaults to timestamp like 20250909_153012)
    [HttpPost("upload")]
    [RequestFormLimits(MultipartBodyLengthLimit = 1024L * 1024L * 200L)] // 200 MB example
    [DisableRequestSizeLimit] // or configure Kestrel/appsettings instead
    public async Task<IActionResult> Upload([FromForm] List<IFormFile> files, [FromForm] string? folder = null)
    {
        if (files == null || files.Count == 0) return BadRequest("No files provided.");

        // Default folder = sanitized timestamp per your earlier pattern
        folder ??= DateTime.Now.ToString("yyyyMMdd_HHmmss");

        var results = new List<StoreResult>();
        foreach (var file in files)
        {
            // Take only the file name (strip any path the client may send)
            var safeName = Path.GetFileName(file.FileName);
            if (string.IsNullOrWhiteSpace(safeName))
            {
                // fallback name
                safeName = $"{Guid.NewGuid():N}";
            }

            var relPath = $"{folder}/{safeName}";
            await using var stream = file.OpenReadStream();
            var res = await _storage.SaveAsync(
                relativePath: relPath,
                content: stream,
                overwrite: false,
                contentType: string.IsNullOrWhiteSpace(file.ContentType) ? null : file.ContentType
            );
            results.Add(res);
        }

        // Each StoreResult includes RelativePath, PublicUrl, Size, ContentType, LastModified
        return Ok(new { count = results.Count, items = results });
    }

        [HttpGet("fetchFiles")]
        public async Task<IActionResult> fetchFiles([FromQuery]string folder, [FromQuery] string? fileName)
        {
            var res = await _storage.ListAsync(folder);
            if (fileName != null) { 
                res = res.Where(w=>w.Name == fileName).ToList();
            }
            return Ok(res);
        }

        [HttpGet("getFilesB64")]

        public async Task<IActionResult> getFilesB64([FromQuery] string folder, [FromQuery] string? fileName)
        {
            var res = await _storage.ListAsync(folder);
            if (fileName != null) {
                res = res.Where(w => w.Name == fileName).ToList();
            }

            var returnList = res.Select(async item =>
            {
                using var strm = await _storage.OpenReadAsync(item.RelativePath);
                var b64 = string.Empty;
                if (strm != null)
                {
                    if (strm.CanSeek) strm.Position = 0;
                    using var ms = new MemoryStream();
                    await strm.CopyToAsync(ms);
                    b64 = Convert.ToBase64String(ms.ToArray());
                }
                return new
                {
                    item,
                    b64
                };

            });

            var ret = await Task.WhenAll(returnList);


            return Ok(ret);

            

        }

    }
}
