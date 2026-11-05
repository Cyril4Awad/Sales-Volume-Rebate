using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Models.DTOs
{
    public class NotificationDto
    {
        // Original SSE notification properties
        public int sse_notif_id { get; set; }
        public string notification_type { get; set; }
        = string.Empty;

        public string notification_message { get; set; } = string.Empty;

        public string notification_recipient { get; set; } = string.Empty;

    }
    public class TemplateDefinitionRow : ICloneable
    {
        public int TemplateId { get; set; }
        public string Code { get; set; }
        public string Name { get; set; }
        public int Version { get; set; }
        public TemplateRoot? Json { get; set; }
        public DateTime CreatedAt { get; set; }
        public DateTime UpdatedAt { get; set; }
        public object Clone()
        {
            return this.MemberwiseClone();
        }
    }

    public class JobDefinition
    {

        public Guid? JobId { get; set; }
        public string? Title { get; set; }
        public string? Department { get; set; }
        public string? Location { get; set; }
        public string? HiringManager { get; set; }
        public System.DateTime? OpenDate { get; set; }
        public string? Notes { get; set; }
        public string? CVPath { get; set; }
        public int TemplateId { get; set; }
    }

    public class CandidateDefinition
    {
        public Guid CandidateId { get; set; }
        public Guid JobId { get; set; }

        public string? FullName { get; set; }
        public string? Phone { get; set; }
        public string? Email { get; set; }
        public string? Source { get; set; }

        public string? CvPath { get; set; }
        public string? ConvertedPath { get; set; }

        public string? Tag0Status { get; set; }
        public string? Tag0Remarks { get; set; }
        public DateTime? Tag0UpdatedAt { get; set; }   // nullable since datetime2 can be NULL

        public TemplateRoot? Json { get; set; }  // nvarchar(max)
        public string? ExcludedOnPhase { get; set; }
        public string? NextPhase { get; set; }
    }

    //Sales Volume Rebate 
    public class CVR_TypeDto
    {
        public int? TypeID { get; set; }
        [MaxLength(100)] public string TypeName { get; set; }
        [MaxLength(1)] public string Behavior { get; set; }
        [MaxLength(500)] public string? Remarks { get; set; }
        public bool Active { get; set; }
    }
    public class CVR_ComputationTypeDto
    {
        public int? ComputationTypeID { get; set; }
        [MaxLength(100)] public string ComputationTypeName { get; set; }
        [Range(1, 12)] public int PeriodLength { get; set; }
        public bool IsCustom { get; set; }
        [MaxLength(500)] public string? Remarks { get; set; }
        public bool Active { get; set; }
    }

    public class CVR_SettlementTypeDto
    {
        public int? SettlementTypeID { get; set; }
        [MaxLength(100)] public string SettlementTypeName { get; set; }
        [Range(1, 12)] public int PeriodLength { get; set; }
        public bool IsCustom { get; set; }
        [MaxLength(500)] public string? Remarks { get; set; }
        public bool Active { get; set; }
    }

    public class CVR_ContractDto
    {
        public int? ContractID { get; set; }
        public int? ClientID { get; set; }
        [MaxLength(50)] public string ContractReference { get; set; }
        [MaxLength(100)] public string ContractName { get; set; }
        /// <summary>Multipart upload body (PDF only). Filename is persisted into CTR_DocumentName; bytes into CTR_Document.</summary>
        public IFormFile? Document { get; set; }
        public bool DeleteDocument { get; set; }

        public DateTime? StartDate { get; set; }
        public DateTime? EndDate { get; set; }
        public string? Terms { get; set; }
        [MaxLength(500)] public string? Remarks { get; set; }
        public bool Active { get; set; }
        [MaxLength(3)] public string? ContractCurrency { get; set; }
    }

    public class CVR_ContractClientDto
    {
        public int? ContractClientID { get; set; }
        public int? ContractID { get; set; }
        public int? ClientID { get; set; }
    }

    public class CVR_FeeDto : IValidatableObject
    {
        public int? FeeID { get; set; }
        public int? PlanID { get; set; }
        [MaxLength(100)] public string? Name { get; set; }
        [MaxLength(3)] public string? Currency { get; set; }
        public decimal? Amount { get; set; }
        public int? SettlementType { get; set; }

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (Amount.HasValue && string.IsNullOrWhiteSpace(Currency))
            {
                yield return new ValidationResult(
                    "Currency is required when fee amount is set.",
                    new[] { nameof(Currency) });
            }
        }
    }

    public class CVR_PlanDto
    {
        public int? PlanID { get; set; }
        public int? ContractID { get; set; }
        public int? TypeID { get; set; }
        [MaxLength(100)] public string PlanName { get; set; }
        [MaxLength(500)] public string? Remarks { get; set; }
        public bool Active { get; set; }
    }

    public class CVR_TargetDto : IValidatableObject
    {
        public int? TargetID { get; set; }
        public int? PlanID { get; set; }
        [MaxLength(100)] public string TargetName { get; set; }
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public decimal? RebateValue { get; set; }
        [MaxLength(1)] public string? RebateValueType { get; set; }
        [MaxLength(3)] public string? Currency { get; set; }
        public int? ComputationTypeID { get; set; }
        public int? SettlementTypeID { get; set; }
        /// <summary>F = formula, R = range.</summary>
        public string? TargetType { get; set; }
        public bool Override { get; set; }
        public List<CVR_TargetConditionDto> Conditions { get; set; } = new();
        public List<CVR_TargetReferenceDto> References { get; set; } = new();

        public IEnumerable<ValidationResult> Validate(ValidationContext validationContext)
        {
            if (!string.IsNullOrWhiteSpace(TargetType)
                && string.Equals(TargetType.Trim(), "R", StringComparison.OrdinalIgnoreCase))
                yield break;

            if ((Conditions ?? new List<CVR_TargetConditionDto>())
                .Any(c => string.Equals(c.LogicalOperator, "R", StringComparison.OrdinalIgnoreCase)
                    || string.Equals(c.LogicalOperator, "T", StringComparison.OrdinalIgnoreCase)))
                yield break;

            var rebateType = NormalizeRebateValueType(RebateValueType);
            var rebateNum = RebateValue ?? 0;
            var hasCurrency = !string.IsNullOrWhiteSpace(Currency);

            if (rebateType == "F" && rebateNum > 0 && !hasCurrency)
            {
                yield return new ValidationResult(
                    "Currency is required for fixed rebate.",
                    new[] { nameof(Currency) });
            }
        }

        private static string NormalizeRebateValueType(string? raw)
        {
            if (string.IsNullOrWhiteSpace(raw)) return "F";
            var s = raw.Trim();
            var u = s.ToUpperInvariant();
            if (u == "P" || u == "PERCENTAGE" || u == "PERCENT" || u == "%"
                || s.Contains("percent", StringComparison.OrdinalIgnoreCase))
                return "P";
            if (u == "F" || u == "FIXED" || u == "FIX"
                || s.Contains("fixed", StringComparison.OrdinalIgnoreCase))
                return "F";
            return u == "P" ? "P" : "F";
        }
    }

    public class CVR_TargetConditionDto
    {
        public int? TargetConditionID { get; set; }
        public int? TargetID { get; set; }
        [MaxLength(1)] public string ConditionType { get; set; }
        [MaxLength(2)] public string Operator { get; set; }
        public decimal? Value { get; set; }
        public int? LogicalGroup { get; set; }
        [MaxLength(3)] public string? LogicalOperator { get; set; }
        /// <summary>Rebate value type (F/P). Persisted as TCD_RebateType.</summary>
        [MaxLength(1)] public string? Type { get; set; }
        /// <summary>Rebate currency code. Persisted as TCD_RebateCurrency.</summary>
        [MaxLength(3)] public string? Currency { get; set; }
        [MaxLength(3)] public string? SalesAmountCurrency { get; set; }
        public decimal? RebateAmount { get; set; }
        public bool Override { get; set; }
    }

    public class CVR_ContractReferenceExistsDto
    {
        public bool Exists { get; set; }
    }

    /// <summary>One stock item or product group linked to a target (<c>CVR_TargetReferences</c>).</summary>
    public class CVR_TargetReferenceDto
    {
        public int? TargetReferenceId { get; set; }
        public int? TargetID { get; set; }
        /// <summary>UI value: StockItem or ProductGroup. Persisted as TRF_ScopeType S/P.</summary>
        [MaxLength(20)] public string? ReferenceType { get; set; }
        [MaxLength(1)] public string? ScopeType { get; set; }
        public decimal? STKRecId { get; set; }
        public decimal? ItemTypeRecId { get; set; }
        /// <summary>Display only (joined from STK04 / item type).</summary>
        public string? RefCode { get; set; }
        /// <summary>Display only (joined from STK04 / item type).</summary>
        public string? RefDesc { get; set; }
        /// <summary>Display only — stock ref (STK_REF).</summary>
        public string? StkRef { get; set; }
        /// <summary>Display only — stock description (STK_DESC).</summary>
        public string? StkDesc { get; set; }
        /// <summary>Display only — barcode (Stk04_DetBarcode).</summary>
        public string? DbarBarcode { get; set; }
        /// <summary>Display only — stock unit (STK_UNIT).</summary>
        public string? StkUnit { get; set; }
        /// <summary>Display only — item type code (IT_Code).</summary>
        public string? ItCode { get; set; }
        /// <summary>Display only — item type description (IT_DESC).</summary>
        public string? ItDesc { get; set; }
        /// <summary>Display only — group code (GRP_CODE).</summary>
        public string? GrpCode { get; set; }
        /// <summary>Display only — group description (GRP_DESC).</summary>
        public string? GrpDesc { get; set; }
    }

    public class ClientLookupRequest
    {
        public List<int> Ids { get; set; } = new();
    }

    public class ClientLookupRowDto
    {
        public int ClientID { get; set; }
        public string ClientCode { get; set; } = string.Empty;
        public string ClientNo { get; set; } = string.Empty;
        public string ClientName { get; set; } = string.Empty;
    }

   public class ClientDto
{
    public int ClientID { get; set; }
    public string ClientCode { get; set; } = string.Empty;
    public string ClientNo { get; set; } = string.Empty;
    public string ClientName { get; set; } = string.Empty;
    public string AE { get; set; } = string.Empty;
    public string MOF { get; set; } = string.Empty;
    public string Address { get; set; } = string.Empty;
    public string Phone1 { get; set; } = string.Empty;
    public string Phone2 { get; set; } = string.Empty;
    public string Categ { get; set; } = string.Empty;
    public string ClientType { get; set; } = string.Empty;
}
 
    public class CVR_PlanWorkspaceResponseDto
    {
        public CVR_PlanDto Plan { get; set; }
        public List<CVR_FeeDto> Fees { get; set; } = new();
        public List<CVR_TargetDto> Targets { get; set; } = new();
    }

    /// <summary>
    /// One entry (plan + sub-items) inside the bulk-save payload.
    /// Used for both new and modified plans.
    /// </summary>
    public class CVR_PlanWorkspaceEntryDto
    {
        public CVR_PlanDto Plan { get; set; }
        public List<CVR_FeeDto> Fees { get; set; } = new();
        public List<CVR_TargetDto> Targets { get; set; } = new();
    }

    /// <summary>
    /// Root payload sent by the frontend on Save.
    /// Everything in one transaction on the backend.
    /// </summary>
    public class CVR_WorkspaceSavePayload
    {
        public List<CVR_PlanWorkspaceEntryDto> NewPlans { get; set; } = new();
        public List<CVR_PlanWorkspaceEntryDto> ModifiedPlans { get; set; } = new();
        public List<decimal> DeletedPlanIds { get; set; } = new();
    }

    public class Com_CurrencyDTO
    {
        public string Cur_Code { get; set; } = string.Empty;
        public string? Cur_Desc { get; set; }
    }

    public class StockItemLookupDto
    {
        public int STK_RECID { get; set; }
        public string STK_REF { get; set; } = string.Empty;
        public string STK_DESC { get; set; } = string.Empty;
        public string DBAR_BARCODE { get; set; } = string.Empty;
        public string STK_UNIT { get; set; } = string.Empty;
    }

    public class ProductGroupLookupDto
    {
        public int IT_RecID { get; set; }
        public string IT_Code { get; set; } = string.Empty;
        public string IT_DESC { get; set; } = string.Empty;
        public string GRP_CODE { get; set; } = string.Empty;
        public string GRP_DESC { get; set; } = string.Empty;
    }

    public class LocationCashRegStatusDto
    {
        public bool LocationValid { get; set; }
        public bool CashRegValid { get; set; }
    }

    public class PosoAppCompDto
    {
        public string Comp { get; set; } = string.Empty;
        public string Year { get; set; } = string.Empty;
        public string Curr1 { get; set; } = string.Empty;
        public string Curr2 { get; set; } = string.Empty;
    }

    public class CashRegComputerNameDto
    {
        public string ComputerName { get; set; } = string.Empty;
    }

    public class ContractMainClientDto
    {
        public int ClientId { get; set; }
        public string ClientName { get; set; } = string.Empty;
    }

    public class CVR_TargetSalesReferenceDto
    {
        public string ScopeType { get; set; } = string.Empty;
        public string Code { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
    }

    public class CVR_TargetSalesDto
    {
        public int ClientId { get; set; }
        public int TargetId { get; set; }
        public decimal SalesAmountBase { get; set; }
        public string SystemCurrency { get; set; } = "USD";
        public DateTime? FromDate { get; set; }
        public DateTime? ToDate { get; set; }
        public decimal SalesAmount { get; set; }
        public decimal SalesQuantity { get; set; }
        public Dictionary<string, decimal> SalesAmounts { get; set; } = new();
        /// <summary>"scoped" when references resolve to a stock pool; "all" when no references.</summary>
        public string ReferenceScope { get; set; } = "all";
        public List<CVR_TargetSalesReferenceDto> References { get; set; } = new();
        public int ResolvedStockItemCount { get; set; }
        public DateTime FetchedAt { get; set; }
        public string? SalesAmountCurrency { get; set; }
        public Dictionary<string, decimal> PreviousYearSalesAmounts { get; set; } = new();
        public decimal PreviousYearSalesQuantity { get; set; }
        public decimal GrowthPercentageUSD { get; set; }
        public DateTime? PreviousYearFromDate { get; set; }
        public DateTime? PreviousYearToDate { get; set; }
    }


    public class CVR_TotalSalesDto
    {
        public int ClientId { get; set; }
        public DateTime FromDate { get; set; }
        public DateTime ToDate { get; set; }
        public decimal SalesAmountUSD { get; set; }
        public decimal SalesAmountLBP { get; set; }
        public decimal SalesQuantity { get; set; }
        public string SystemCurrency { get; set; } = "USD";
    }

    public class CVR_SalesBatchPreviewRequest
    {
        public List<int> ClientIds { get; set; } = new();
        public List<CVR_SalesBatchPreviewTarget> Targets { get; set; } = new();
    }

    public class CVR_SalesBatchPreviewTarget
    {
        public int? TargetId { get; set; }
        public string? LocalKey { get; set; }
        public DateTime FromDate { get; set; }
        public DateTime ToDate { get; set; }
    }
    public class CVR_TargetItemDto
    {
        public string ItemRef { get; set; } = string.Empty;
        public string ItemDesc { get; set; } = string.Empty;
        public decimal QtySal { get; set; }
        public decimal QtyRet { get; set; }
        public decimal NetQty { get; set; }
        public decimal NetSal { get; set; }
        public decimal NetRet { get; set; }
        public decimal NetSalUSD { get; set; }
        public decimal NetRetUSD { get; set; }
        public decimal NetSalLBP { get; set; }
        public decimal NetRetLBP { get; set; }
        public string Currency { get; set; } = "USD";
        public decimal NetSalesAmount => NetSal - NetRet;
        public decimal NetSalesAmountUSD => NetSalUSD - NetRetUSD;
        public decimal NetSalesAmountLBP => NetSalLBP - NetRetLBP;
    }

    public class CVR_TargetItemsResponseDto
    {
        public int ClientId { get; set; }
        public int TargetId { get; set; }
        public string ReferenceScope { get; set; } = "all";
        public List<string> Currencies { get; set; } = new();
        public List<CVR_TargetItemDto> Items { get; set; } = new();
        public decimal TotalNetQty => Items.Sum(i => i.NetQty);
        public decimal TotalNetSalesAmount => Items.Sum(i => i.NetSalesAmount);
    }

    public class CVR_SettlementPaymentDto
    {
        public int SettlementPaymentID { get; set; }
        public string ResultType { get; set; } = "";
        public int? TargetID { get; set; }
        public int? FeeID { get; set; }
        public long ContractID { get; set; }
        public decimal AmountProcessed { get; set; }
        public decimal AmountLeft { get; set; }
        public decimal TotalAmountAtProcess { get; set; }
        public decimal? TotalSalesAtProcess { get; set; }
        public string Currency { get; set; } = "";
        public DateTime ProcessDate { get; set; }
        public DateTime? PeriodStart { get; set; }
        public DateTime? PeriodEnd { get; set; }
    }

    public class CVR_ProcessTargetSettlementRequest
    {
        public int TargetId { get; set; }
        public List<int> ClientIds { get; set; } = new();
    }

    public class CVR_ProcessFeesSettlementBatchRequest
    {
        public List<int> ClientIds { get; set; } = new();
        public List<int> FeeIds { get; set; } = new();
    }

    public class CVR_SaveComputationRequest
    {
        public int PlanId { get; set; }
    }

    public class CVR_SaveComputationResultDto
    {
        public int PlanId { get; set; }
        public long ContractId { get; set; }
        public int TargetCount { get; set; }
        public int FeeCount { get; set; }
        public int SnapshotCount { get; set; }
        public bool Locked { get; set; }
    }

    public class CVR_ContractLockStatusDto
    {
        public bool Locked { get; set; }
        public DateTime? FirstSavedAt { get; set; }
    }

    public class CVR_PlanSaveContext
    {
        public int PlanId { get; set; }
        public long ContractId { get; set; }
        public DateTime? ContractStartDate { get; set; }
        public DateTime? ContractEndDate { get; set; }
        public string? ContractCurrency { get; set; }
        public int MainClientId { get; set; }
    }

    public class CVR_ComputationUpsertDto
    {
        public long ContractId { get; set; }
        public int? TargetId { get; set; }
        public int? FeeId { get; set; }
        public decimal SalesAmount { get; set; }
        public decimal SalesQty { get; set; }
        public decimal PreviousYearSalesAmount { get; set; }
        public decimal Growth { get; set; }
        public decimal RebateAmount { get; set; }
        public string Currency { get; set; } = "USD";
        public DateTime? DateFrom { get; set; }
        public DateTime? DateTo { get; set; }
    }

    public class CVR_SalesSnapshotInsertDto
    {
        public int ComputationId { get; set; }
        public int ClientId { get; set; }
        public decimal SalesAmount { get; set; }
        public decimal SalesQty { get; set; }
        public decimal PreviousYearSalesAmount { get; set; }
        public decimal Growth { get; set; }
        public string Currency { get; set; } = "USD";
    }

}
