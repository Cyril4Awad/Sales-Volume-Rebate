using System;

namespace DataService.Models
{
    public class CVR_Fee
    {
        public decimal FEE_FeeID { get; set; }
        public decimal? FEE_PlanID { get; set; }
        public string FEE_Name { get; set; }
        public string FEE_Currency { get; set; }
        public decimal? FEE_Amount { get; set; }
        public decimal? FEE_SettlementType { get; set; }
        public DateTime? FEE_CDStamp { get; set; }
        public string FEE_CUStamp { get; set; }
        public DateTime? FEE_MDStamp { get; set; }
        public string FEE_MUStamp { get; set; }
    }
}
