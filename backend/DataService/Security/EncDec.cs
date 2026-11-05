using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;

namespace FixedAssets_WS.Classes
{
    public static class EncDec
    {
        private static string initVector = "REDACTED";
        private static int keysize = 256;

        public static string DecryptConnectionString(string cipherText)
        {
            return DecryptString(cipherText, DecPS("ju" + (char)128 + "zz{j"));
        }

        public static string DecPS(string spwd1)
        {
            try
            {
                string result = "";
                int lp = spwd1.Length;

                for (int i = 1; i <= lp; i++)
                {
                    char rightChar = spwd1[spwd1.Length - i];
                    char decodedChar = (char)(rightChar - lp);

                    byte[] bytes = Encoding.GetEncoding("windows-1252")
                                           .GetBytes(decodedChar.ToString());

                    result += Encoding.GetEncoding("windows-1256")
                                      .GetString(bytes);
                }

                return result;
            }
            catch
            {
                throw;
            }
        }

       public static string DecryptString(string cipherText, string passPhrase)
{
    try
    {
        byte[] initVectorBytes = Encoding.UTF8.GetBytes(initVector);
        byte[] cipherTextBytes = Convert.FromBase64String(cipherText);

        PasswordDeriveBytes password = REDACTED PasswordDeriveBytes(passPhrase, null);
        byte[] keyBytes = password.GetBytes(keysize / 8);

        using (Aes symmetricKey = Aes.Create())
        {
            symmetricKey.Mode = CipherMode.CBC;
            symmetricKey.Padding = PaddingMode.PKCS7;

            using (ICryptoTransform decryptor =
                   symmetricKey.CreateDecryptor(keyBytes, initVectorBytes))
            using (MemoryStream memoryStream = new MemoryStream(cipherTextBytes))
            using (CryptoStream cryptoStream =
                   new CryptoStream(memoryStream, decryptor, CryptoStreamMode.Read))
            using (StreamReader reader = new StreamReader(cryptoStream, Encoding.UTF8))
            {
                return reader.ReadToEnd();
            }
        }
    }
    catch (Exception ex)
    {
        File.AppendAllText(@"C:\PublishIIS\Authentication\logs\decrypt.log",
            $"{DateTime.Now}: {ex.GetType().Name}: {ex.Message}\n");
        return "";
    }
}
    }
}