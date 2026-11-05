using System;

namespace DataService.Models
{
    public class CVR_TargetReference
    {
        public decimal TRF_TargetScopeReferenceID { get; set; }
        public decimal TRF_TargetID { get; set; }
        public string TRF_ScopeType { get; set; }
        public decimal? TRF_StockItemID { get; set; }
        public decimal? TRF_ProductGroupID { get; set; }
        public DateTime? TRF_CDStamp { get; set; }
        public string TRF_CUStamp { get; set; }
        public DateTime? TRF_MDStamp { get; set; }
        public string TRF_MUStamp { get; set; }
    }
}
