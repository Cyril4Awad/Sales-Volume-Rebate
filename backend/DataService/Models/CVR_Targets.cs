using System;

namespace DataService.Models
{
    public class CVR_Target
    {
        public decimal TAR_TargetID { get; set; }
        public decimal? TAR_PlanID { get; set; }
        public string TAR_TargetName { get; set; }
        public DateTime? TAR_FromDate { get; set; }
        public DateTime? TAR_ToDate { get; set; }
        public decimal? TAR_RebateValue { get; set; }
        public string TAR_RebateValueType { get; set; }
        public string TAR_Currency { get; set; }
        public decimal? TAR_SettlementTypeID { get; set; }
        public decimal? TAR_ComputationTypeID { get; set; }
        public string TAR_TargetType { get; set; }
        public bool TAR_Override { get; set; }
        public DateTime? TAR_CDStamp { get; set; }
        public string TAR_CUStamp { get; set; }
        public DateTime? TAR_MDStamp { get; set; }
        public string TAR_MUStamp { get; set; }
    }
}
