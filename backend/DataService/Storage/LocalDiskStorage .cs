using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.StaticFiles;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Storage
{
    public sealed class LocalDiskStorage : IStorage
    {
        private readonly StorageOptions _options;
        private readonly IHttpContextAccessor _http;
        private readonly FileExtensionContentTypeProvider _types = new();

        public LocalDiskStorage(StorageOptions options, IHttpContextAccessor http)
        {
            _options = options;
            _http = http;
        }

        public async Task<StoreResult> SaveAsync(string relativePath, Stream content, bool overwrite = false, string? contentType = null, Func<Guid>? idGenerator = null)
        {
            var safeRel = SanitizeRelativePath(relativePath);
            var full = SafeJoin(_options.AssetsRoot, safeRel);

            Directory.CreateDirectory(Path.GetDirectoryName(full)!);

            var finalFull = full;
            if (!overwrite && File.Exists(finalFull))
            {
                var dir = Path.GetDirectoryName(full)!;
                var name = Path.GetFileNameWithoutExtension(full);
                var ext = Path.GetExtension(full);
                finalFull = Path.Combine(dir, $"{name}-{Guid.NewGuid():N}{ext}");
                safeRel = ToRelativeUnderRoot(finalFull);
            }

            using (var fs = new FileStream(finalFull, FileMode.Create, FileAccess.Write, FileShare.None))
            {
                await content.CopyToAsync(fs);
            }

            var fi = new FileInfo(finalFull);
            var ct = contentType ?? GuessContentType(finalFull);

            return new StoreResult(
                Id: idGenerator != null ? idGenerator():null,
                Name: fi.Name,
                RelativePath: NormalizeSlashes(safeRel),
                PublicUrl: GetPublicUrl(safeRel),
                Size: fi.Length,
                ContentType: ct,
                LastModified: fi.LastWriteTimeUtc
            );
        }

        public Task<bool> ExistsAsync(string relativePath)
        {
            var full = SafeJoin(_options.AssetsRoot, SanitizeRelativePath(relativePath));
            return Task.FromResult(File.Exists(full));
        }

        public  Task<Stream> OpenReadAsync(string relativePath)
        {
            var full = SafeJoin(_options.AssetsRoot, SanitizeRelativePath(relativePath));
            if (!File.Exists(full)) throw new FileNotFoundException("Not found", full);
            Stream s = new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read);
            return Task.FromResult(s);
        }

        public Task DeleteAsync(string relativePath)
        {
            var full = SafeJoin(_options.AssetsRoot, SanitizeRelativePath(relativePath));
            if (File.Exists(full)) File.Delete(full);
            return Task.CompletedTask;
        }

        public async Task<IReadOnlyList<StoreResult>> ListAsync(string relativeFolder = "")
        {
            var list = new List<StoreResult>();
            var folder = SafeJoin(_options.AssetsRoot, SanitizeRelativePath(relativeFolder));

            if (!Directory.Exists(folder)) return list;

            foreach (var path in Directory.EnumerateFiles(folder))
            {
                var fi = new FileInfo(path);
                var rel = ToRelativeUnderRoot(path);
                list.Add(new StoreResult(
                    Id: null,
                    Name: fi.Name,
                    RelativePath: NormalizeSlashes(rel),
                    PublicUrl: GetPublicUrl(rel),
                    Size: fi.Length,
                    ContentType: GuessContentType(path),
                    LastModified: fi.LastWriteTimeUtc
                ));
            }
            return await Task.FromResult(list);
        }

        public string GetPublicUrl(string relativePath)
        {
            var rel = NormalizeSlashes(SanitizeRelativePath(relativePath));

            if (!string.IsNullOrWhiteSpace(_options.PublicBaseUrl))
            {
                return $"{_options.PublicBaseUrl.TrimEnd('/')}/{_options.RequestPath.Trim('/')}/{rel}".Replace("}//", "}/");
            }

            var http = _http.HttpContext ?? throw new InvalidOperationException("No HttpContext; set StorageOptions.PublicBaseUrl or use IHttpContextAccessor in web requests.");
            var baseUrl = $"{http.Request.Scheme}://{http.Request.Host}";
            return $"{baseUrl}{_options.RequestPath}/{rel}".Replace("//", "/").Replace(":/", "://");
        }

        // ---- helpers ----
        private static string NormalizeSlashes(string p) => p.Replace("\\", "/");

        private string GuessContentType(string path)
            => _types.TryGetContentType(path, out var ct) ? ct : "application/octet-stream";

        private static string SanitizeRelativePath(string path)
        {
            // Split by separators and sanitize each segment (no traversal)
            var parts = path.Replace("\\", "/").Split('/', StringSplitOptions.RemoveEmptyEntries)
                .Select(SanitizeSegment);
            return string.Join(Path.DirectorySeparatorChar, parts);
        }

        private static string SanitizeSegment(string segment)
        {
            var invalid = Path.GetInvalidFileNameChars();
            var clean = new string(segment.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray());
            // Prevent path traversal artifacts
            clean = clean.Replace("..", "_");
            return string.IsNullOrWhiteSpace(clean) ? "_" : clean;
        }

        private static string SafeJoin(string root, string relative)
        {
            var full = Path.GetFullPath(Path.Combine(root, relative));
            var rootFull = Path.GetFullPath(root);
            if (!full.StartsWith(rootFull, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Invalid path.");
            return full;
        }

        private string ToRelativeUnderRoot(string absolute)
        {
            var root = Path.GetFullPath(_options.AssetsRoot).TrimEnd(Path.DirectorySeparatorChar);
            var full = Path.GetFullPath(absolute);
            if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Path outside root.");
            var rel = full.Substring(root.Length).TrimStart(Path.DirectorySeparatorChar);
            return rel;
        }

    }
}
