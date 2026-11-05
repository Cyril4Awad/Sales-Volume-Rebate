using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Data.SqlClient;

namespace DataService.Others
{
    public class NotFoundException : Exception
    {
        public NotFoundException(string message) : base(message) { }
    }
    public class ValidationException : Exception
    {
        public ValidationException(string message) : base(message) { }
    }
    public class UnauthorizedAccessException : Exception
    {
        public UnauthorizedAccessException(string message) : base(message) { }
    }
    public class InternalServerErrorException : Exception
    {
        public InternalServerErrorException(string message) : base(message) { }
    }
    public class GlobalExceptionFilter : IExceptionFilter
    {
        public void OnException(ExceptionContext context)
        {
            var ex = context.Exception;
            int statusCode;
            string message;

            if (ex is InvalidOperationException ioe
                && !string.IsNullOrWhiteSpace(ioe.Message)
                && ioe.Message.Contains("Target \"", StringComparison.Ordinal))
            {
                statusCode = StatusCodes.Status400BadRequest;
                message = ioe.Message;
            }
            else if (ex is SqlException sqlEx)
            {
                statusCode = StatusCodes.Status400BadRequest;
                message = MapSqlException(sqlEx);
            }
            else
            {
                statusCode = ex switch
                {
                    NotFoundException => StatusCodes.Status404NotFound,
                    ValidationException => StatusCodes.Status400BadRequest,
                    UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
                    InvalidOperationException => StatusCodes.Status400BadRequest,
                    _ => StatusCodes.Status500InternalServerError
                };
                message = ex.Message;
            }

            context.Result = new ObjectResult(new
            {
                error = message,
                innerException = ex.InnerException?.Message
            })
            {
                StatusCode = statusCode,
            };
            context.ExceptionHandled = true;
        }

        private static string MapSqlException(SqlException ex)
        {
            foreach (SqlError err in ex.Errors)
            {
                switch (err.Number)
                {
                    case 2627:
                    case 2601:
                        if (err.Message.Contains("UQ_CVR_Contracts_Ref", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("ContractReference", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Contract reference must be unique.";
                        }
                        if (err.Message.Contains("UX_CVR_Computations_Target", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("CMP_TargetID", StringComparison.OrdinalIgnoreCase))
                        {
                            return "A saved computation for this target already exists.";
                        }
                        if (err.Message.Contains("UX_CVR_Computations_Fee", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("CMP_FeeID", StringComparison.OrdinalIgnoreCase))
                        {
                            return "A saved computation for this fee already exists.";
                        }
                        return "A record with the same unique value already exists.";
                    case 547:
                        if (err.Message.Contains("FK_CVR_Contracts_Clients", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("ClientID", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Invalid client selected.";
                        }
                        if (err.Message.Contains("FK_CVR_Targets_SettlementTypes", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("FK_CVR_Fees_SettlementTypes", StringComparison.OrdinalIgnoreCase))
                        {
                            return "This settlement type is in use by targets or fees and cannot be deleted.";
                        }
                        if (err.Message.Contains("Com_Currency", StringComparison.OrdinalIgnoreCase)
                            || err.Message.Contains("Currency", StringComparison.OrdinalIgnoreCase))
                        {
                            return "Invalid currency code.";
                        }
                        return "Invalid reference to a related record.";
                    case 515:
                        return $"Required field is missing. {err.Message}";
                    case 8152:
                        return "One or more values exceed the maximum allowed length.";
                }
            }

            return ex.Message;
        }
    }
}
