using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Others
{
    public static class helpers
    {
        public static string GuessNameFromFile(string fileName)
        {
            var name = Path.GetFileNameWithoutExtension(fileName);
            // Replace separators with space
            name = name.Replace('_', ' ').Replace('-', ' ');
            // Collapse multiple spaces
            name = string.Join(" ", name.Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries));
            // Title-case light touch (first char upper per token)
            var parts = name.Split(' ');
            for (int i = 0; i < parts.Length; i++)
            {
                var p = parts[i];
                if (p.Length == 0) continue;
                parts[i] = char.ToUpperInvariant(p[0]) + (p.Length > 1 ? p.Substring(1) : "");
            }
            return string.Join(" ", parts);
        }
    }
}
