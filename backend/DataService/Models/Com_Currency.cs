namespace DataService.Models
{
    public class Com_Currency
    {
        public string Cur_Code { get; set; } = string.Empty;
        public string? Cur_Desc { get; set; }
        public string? Cur_Ustmp { get; set; }
        public DateTime? Cur_Dstmp { get; set; }
    }
}