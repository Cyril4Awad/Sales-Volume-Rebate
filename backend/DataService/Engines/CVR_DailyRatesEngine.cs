using DataService.DataAccess;

namespace DataService.Engine
{
    public class CVRDailyRatesEngine
    {
        private readonly COM_DailyRateDAL _dal;

        public CVRDailyRatesEngine(COM_DailyRateDAL dal) => _dal = dal;

        public Task<decimal?> GetCurrentUsdLbpRateAsync() =>
            _dal.GetCurrentUsdLbpRateAsync();
    }
}
