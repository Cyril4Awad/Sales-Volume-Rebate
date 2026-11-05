using System.Text;

namespace DataService.Security
{
    public static class PasswordCrypto
    {
        static PasswordCrypto()
        {
            Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);
        }

        public static string Decpassword(string spwd1)
        {
            int lp = spwd1?.Length ?? 0;

            var enc1256 = Encoding.GetEncoding("windows-1256");
            var enc1252 = Encoding.GetEncoding("windows-1252");

            string result = "";

            for (int i = 1; i <= lp; i++)
            {
                string right = spwd1.Substring(lp - i, i);
                char ch = right[0];

                int newCode = (int)ch - lp;

                char newChar = (char)newCode;
                byte[] bytes1252 = enc1252.GetBytes(new[] { newChar });
                string converted = enc1256.GetString(bytes1252);

                result += converted;
            }

            return result;
        }

        public static string Encpassword(string spwd1)
        {
            int lp = spwd1?.Length ?? 0;

            var enc1256 = Encoding.GetEncoding("windows-1256");
            var enc1252 = Encoding.GetEncoding("windows-1252");

            string result = "";

            for (int i = 1; i <= lp; i++)
            {
                string right = spwd1.Substring(lp - i, i);
                char ch = right[0];

                int newCode = (int)ch + lp;

                char newChar = (char)newCode;
                byte[] bytes1252 = enc1252.GetBytes(new[] { newChar });
                string converted = enc1256.GetString(bytes1252);

                result += converted;
            }

            return result;
        }
    }
}
