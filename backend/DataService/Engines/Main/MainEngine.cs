using DataService.DataAccess;
using DataService.Models;
using DataService.Models.DTOs;
using Microsoft.AspNetCore.Http;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Engines.Main
{
    public class MainEngine
    {
        private readonly MainDAL _dal = null;
        public MainEngine(MainDAL dal)
        {
            _dal = dal;
        }

        public async Task<TemplateDefinitionRow?> GetJobTemplateById(int Id)
        {
            return await _dal.GetJobTemplateById(Id);
        }

        public async Task<List<TemplateDefinitionRow>> GetAllJobTemplates()
        {
            return await _dal.GetAllJobTemplates();
        }

        public async Task<object>LoadJob ( string JobId)
        {
            return await _dal.LoadJob(JobId);
        }

        public async Task<object> SaveJob(JobDefinition job, List<IFormFile> jobCVs)
        {
            // Implement the logic to save the job template using _dal
           return await _dal.SaveJob(job, jobCVs);
        } 


    }
}
