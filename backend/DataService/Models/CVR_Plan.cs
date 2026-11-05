using System;

namespace DataService.Models
{
    public class CVR_Plan
    {
        public decimal PLN_PlanID { get; set; }
        public decimal? PLN_ContractID { get; set; }
        public decimal? PLN_TypeID { get; set; }
        public string PLN_PlanName { get; set; }
        public string PLN_Currency { get; set; }
        public string PLN_Remarks { get; set; }
        public bool PLN_Active { get; set; }
        public DateTime? PLN_CDStamp { get; set; }
        public string PLN_CUStamp { get; set; }
        public DateTime? PLN_MDStamp { get; set; }
        public string PLN_MUStamp { get; set; }
    }
}
