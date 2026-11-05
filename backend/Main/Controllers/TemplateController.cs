using DataService.Engines.Main;
using DataService.Models.DTOs;
using Main.Security;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.OpenApi.Writers;
using System.Threading.Tasks;

namespace Main.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class TemplateController : ControllerBase
    {

        private readonly MainEngine engine;
        private readonly UserTenantContextProvider userProvider;
        private readonly JWTTokenProvider jwtTokenProvider;
        public TemplateController(MainEngine engine, UserTenantContextProvider userProvider, JWTTokenProvider jwtTokenProvider)
        {
            this.engine = engine;
            this.userProvider = userProvider;
            this.jwtTokenProvider = jwtTokenProvider;
        }
        
        [HttpGet("GetJobTemplate")]

        public async Task<IActionResult> GetJobTemplate([FromQuery] int Id)
        {
            return Ok(await engine.GetJobTemplateById(Id));
        }

        [HttpGet("GetAllJobTemplates")]
        public async Task<IActionResult> GetAllJobTemplates()
        {
            return Ok(await engine.GetAllJobTemplates());
        }

        [HttpGet("LoadJob")]
        public async Task<IActionResult> LoadJob([FromQuery] string JobId)
        {
            return Ok(await engine.LoadJob(JobId));
        }

        [HttpPost("SaveJob")]
        [RequestFormLimits(MultipartBodyLengthLimit = 1024L * 1024L * 200L)] // 200 MB example
        [DisableRequestSizeLimit] // or configure Kestrel/appsettings instead
        public async Task<IActionResult> SaveJob([FromForm] JobDefinition job, [FromForm] List<IFormFile> jobCVs)
        {
            return Ok(await engine.SaveJob(job, jobCVs));
        }
     

    }
}
