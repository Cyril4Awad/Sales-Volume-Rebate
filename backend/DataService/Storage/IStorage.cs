using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Storage
{
    public interface IStorage
    {
        Task<StoreResult> SaveAsync(string relativePath, Stream content, bool overwrite = false, string? contentType = null,Func<Guid>? idGenerator = null);
        Task<bool> ExistsAsync(string relativePath);
        Task<Stream> OpenReadAsync(string relativePath);
        Task DeleteAsync(string relativePath);
        string GetPublicUrl(string relativePath);
        Task<IReadOnlyList<StoreResult>> ListAsync(string relativeFolder = "");
    }
    public sealed record StoreResult(
    Guid ?Id,
    string Name,
    string RelativePath,
    string PublicUrl,
    long Size,
    string ContentType,
    DateTimeOffset LastModified
);


}
