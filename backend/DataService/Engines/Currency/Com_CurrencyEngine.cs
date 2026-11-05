using DataService.DataAccess;
using DataService.Models;
using DataService.Models.DTOs;

namespace DataService.Engine
{
    public class Com_CurrencyEngine
    {
        private readonly COM_CurrencyDAL _dal;

        public Com_CurrencyEngine(COM_CurrencyDAL dal)
        {
            _dal = dal;
        }

        public Task<IEnumerable<Com_Currency>> GetAll() =>
            _dal.GetAll();

        public Task<Com_Currency?> GetByCode(string code) =>
            _dal.GetByCode(code);

        public Task<int> Create(Com_CurrencyDTO dto, string user) =>
            _dal.Insert(dto, user);

        public Task<int> Update(string code, Com_CurrencyDTO dto, string user) =>
            _dal.Update(code, dto, user);

        public Task<int> Delete(string code) =>
            _dal.Delete(code);
    }
}