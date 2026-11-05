using System;

namespace DataService.Models
{
    public class CVR_TargetCondition
    {
        public decimal TCD_TargetConditionID { get; set; }
        public decimal TCD_TargetID { get; set; }
        public string TCD_ConditionType { get; set; }
        public string TCD_Operator { get; set; }
        public decimal? TCD_Value { get; set; }
        public decimal? TCD_LogicalGroup { get; set; }
        public string TCD_LogicalOperator { get; set; }
        public string TCD_RebateType { get; set; }
        public string TCD_RebateCurrency { get; set; }
        public string TCD_SalesAmountCurrency { get; set; }
        public decimal? TCD_RebateAmount { get; set; }
        public DateTime? TCD_CDStamp { get; set; }
        public string TCD_CUStamp { get; set; }
        public DateTime? TCD_MDStamp { get; set; }
        public string TCD_MUStamp { get; set; }
    }
}
