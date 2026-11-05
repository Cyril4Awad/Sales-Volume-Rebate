using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using DataService.Models.DTOs;
using CvrValidationException = DataService.Others.ValidationException;

/// <summary>Server-side validation for CVR workspace bulk-save payloads.</summary>
public static class CVR_WorkspaceValidator
{
    public static void ValidatePayload(CVR_WorkspaceSavePayload? payload)
    {
        if (payload == null)
            throw new CvrValidationException("Save payload is required.");

        foreach (var entry in (payload.NewPlans ?? new List<CVR_PlanWorkspaceEntryDto>())
            .Concat(payload.ModifiedPlans ?? new List<CVR_PlanWorkspaceEntryDto>()))
        {
            ValidateEntry(entry);
        }
    }

    private static void ValidateEntry(CVR_PlanWorkspaceEntryDto entry)
    {
        if (entry?.Plan == null)
            throw new CvrValidationException("Each plan entry must include a plan.");

        ValidateObject(entry.Plan, "Plan");

        var feeIndex = 0;
        foreach (var fee in entry.Fees ?? new List<CVR_FeeDto>())
        {
            feeIndex += 1;
            ValidateObject(fee, $"Fee {feeIndex}");
            ValidateFee(fee);
        }

        foreach (var target in entry.Targets ?? new List<CVR_TargetDto>())
        {
            ValidateObject(target, $"Target \"{target.TargetName ?? "unnamed"}\"");
            ValidateTargetReferences(target);
        }
    }

    private static void ValidateObject(object instance, string prefix)
    {
        var results = new List<ValidationResult>();
        var context = new ValidationContext(instance);
        if (!Validator.TryValidateObject(instance, context, results, validateAllProperties: true))
        {
            var first = results.FirstOrDefault();
            var memberName = first?.MemberNames?.FirstOrDefault() ?? "unknown field";
            var message = first?.ErrorMessage ?? "Invalid value.";
            throw new CvrValidationException($"{prefix}: {memberName} - {message}");
        }
    }
    private static void ValidateFee(CVR_FeeDto fee)
    {
        if (fee.Amount.HasValue && string.IsNullOrWhiteSpace(fee.Currency))
        {
            throw new CvrValidationException(
                $"Fee \"{fee.Name ?? "unnamed"}\": currency is required when amount is set.");
        }
    }

    private static void ValidateTargetReferences(CVR_TargetDto target)
    {
        var name = string.IsNullOrWhiteSpace(target.TargetName)
            ? "Unnamed target"
            : target.TargetName.Trim();

        foreach (var r in target.References ?? new List<CVR_TargetReferenceDto>())
        {
            ValidateTargetReference(name, r);
        }
    }

    internal static void ValidateTargetReference(string targetName, CVR_TargetReferenceDto r)
    {
        var scope = UiRefTypeToDb(r.ReferenceType ?? r.ScopeType);
        if (string.IsNullOrWhiteSpace(scope))
            return;

        if (scope == "S")
        {
            if (!r.STKRecId.HasValue || r.STKRecId.Value <= 0)
            {
                throw new CvrValidationException(
                    $"Target \"{targetName}\": stock item reference requires a stock item ID.");
            }
            return;
        }

        if (scope == "P")
        {
            if (!r.ItemTypeRecId.HasValue || r.ItemTypeRecId.Value <= 0)
            {
                throw new CvrValidationException(
                    $"Target \"{targetName}\": product group reference requires a product group ID.");
            }
            return;
        }

        throw new CvrValidationException(
            $"Target \"{targetName}\": invalid reference scope type \"{r.ReferenceType ?? r.ScopeType}\".");
    }

    private static string UiRefTypeToDb(string? uiOrDb)
    {
        if (string.IsNullOrWhiteSpace(uiOrDb)) return "";
        return uiOrDb.Trim() switch
        {
            "StockItem"    => "S",
            "ProductGroup" => "P",
            "S"            => "S",
            "P"            => "P",
            _              => uiOrDb.Trim()
        };
    }
}
