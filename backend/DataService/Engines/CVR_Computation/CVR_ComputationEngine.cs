using DataService.Models.DTOs;

public class CVRComputationEngine
{
    private readonly CVRComputationDAL _dal;

    public CVRComputationEngine(CVRComputationDAL dal) => _dal = dal;

    public Task<CVR_TargetSalesDto?> GetTargetSalesAsync(List<int> clientIds, int targetId) =>
        _dal.GetTargetSalesAsync(clientIds, targetId);

    public Task<Dictionary<int, CVR_TargetSalesDto>> GetTargetSalesBatchAsync(
        List<int> clientIds, List<int> targetIds) =>
        _dal.GetTargetSalesBatchAsync(clientIds, targetIds);

    public Task<CVR_TargetItemsResponseDto?> GetTargetItemsAsync(List<int> clientIds, int targetId) =>
        _dal.GetTargetItemsAsync(clientIds, targetId);

    public Task<CVR_TotalSalesDto> GetTotalClientSalesAsync(
    List<int> clientIds, DateTime fromDate, DateTime toDate) =>
    _dal.GetTotalClientSalesAsync(clientIds, fromDate, toDate);

    public Task<Dictionary<string, CVR_TargetSalesDto>> GetTargetSalesPreviewBatchAsync(
        List<int> clientIds, List<CVR_SalesBatchPreviewTarget> targets) =>
        _dal.GetTargetSalesPreviewBatchAsync(clientIds, targets);
}