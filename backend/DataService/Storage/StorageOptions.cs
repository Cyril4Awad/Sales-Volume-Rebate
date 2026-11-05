using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Storage
{
    public sealed class StorageOptions
    {
        // Physical path where files are written (e.g., ".../assets")
        public required string AssetsRoot { get; init; }

        // Public request path that static files are mounted on (e.g., "/media")
        public string RequestPath { get; init; } = "/media";

        // Optional absolute base URL (e.g., "https://files.example.com")
        // If null, we’ll build URLs from the current HttpContext.
        public string? PublicBaseUrl { get; init; }
    }


}
