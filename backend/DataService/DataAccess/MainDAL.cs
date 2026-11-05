using Dapper;
using DataService.Models;
using DataService.Models.DTOs;
using DataService.Others;
using DataService.Storage;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;

using Newtonsoft.Json;
using System.Data;
using System.Transactions;

namespace DataService.DataAccess
{

    public class MainDAL
    {
        private IConfiguration configuration;
        private IStorage _storage;

        public MainDAL(IConfiguration configuration, IStorage storage)
        {
            this.configuration = configuration;
            this._storage = storage;
        }

        public async Task<List<TemplateDefinitionRow>> GetAllJobTemplates()
        {
            const string sql = @"
                SELECT
                    TemplateId, Code, Name, Version, Json, CreatedAt, UpdatedAt
                FROM dbo.Template ORDER BY Name; ";
            using var cn = new SqlConnection(configuration.GetConnectionString("Constr"));
            using var cmd = new SqlCommand(sql, cn);
            cn.Open();
            using var r = await cmd.ExecuteReaderAsync();
            var templates = new List<TemplateDefinitionRow>();
            while (r.Read())
            {
                templates.Add(new TemplateDefinitionRow
                {
                    TemplateId = r.GetInt32(r.GetOrdinal("TemplateId")),
                    Code = r.GetString(r.GetOrdinal("Code")),
                    Name = r.GetString(r.GetOrdinal("Name")),
                    Version = r.GetInt32(r.GetOrdinal("Version")),
                    Json = (r.GetString(r.GetOrdinal("Json")) != string.Empty) ? JsonConvert.DeserializeObject<TemplateRoot>(r.GetString(r.GetOrdinal("Json"))) : null,
                    CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedAt")),
                    UpdatedAt = r.GetDateTime(r.GetOrdinal("UpdatedAt"))
                });
            }
            return templates;
        }
        public async Task<TemplateDefinitionRow?> GetJobTemplateById(int Id)
        {
            const string sql = @"
                SELECT TOP (1)
                    TemplateId, Code, Name, Version, Json, CreatedAt, UpdatedAt
                FROM dbo.Template
                WHERE TemplateId = @id;";

            using var cn = new SqlConnection(configuration.GetConnectionString("Constr"));
            using var cmd = new SqlCommand(sql, cn);

            cmd.Parameters.Add("@id", SqlDbType.Int).Value = Id;
            cn.Open();
            using var r = await cmd.ExecuteReaderAsync();

            if (!r.Read()) return null;

            return new TemplateDefinitionRow
            {
                TemplateId = r.GetInt32(r.GetOrdinal("TemplateId")),
                Code = r.GetString(r.GetOrdinal("Code")),
                Name = r.GetString(r.GetOrdinal("Name")),
                Version = r.GetInt32(r.GetOrdinal("Version")),
                Json = (r.GetString(r.GetOrdinal("Json")) != string.Empty) ? JsonConvert.DeserializeObject<TemplateRoot>(r.GetString(r.GetOrdinal("Json"))) : null,
                CreatedAt = r.GetDateTime(r.GetOrdinal("CreatedAt")),
                UpdatedAt = r.GetDateTime(r.GetOrdinal("UpdatedAt"))
            };
        }


        public async Task<object> SaveJob(JobDefinition job, List<IFormFile> jobFiles)
        {
            if (job.TemplateId <= 0)
                throw new ArgumentException("TemplateId is required.", nameof(job));
            JobDefinition retJob;
            TemplateDefinitionRow templateDefinitionRow = (await GetJobTemplateById(job.TemplateId).ConfigureAwait(false))!;
            List<CandidateDefinition> candidates = new List<CandidateDefinition>();


            List<StoreResult> storedFiles = new List<StoreResult>();

            string sql = @"
                            INSERT INTO dbo.Job
                            (
                                TemplateId,
                                Title,
                                Department,
                                Location,
                                HiringManager,
                                OpenDate,
                                Notes,
                                CVPath
                            )
                            OUTPUT INSERTED.*
                            VALUES
                            (
                                @TemplateId,
                                @Title,
                                @Department,
                                @Location,
                                @HiringManager,
                                @OpenDate,
                                @Notes,
                                @CVPath
                            );";
            var txOptions = new TransactionOptions();
            txOptions.IsolationLevel = System.Transactions.IsolationLevel.ReadCommitted;
            
            using (TransactionScope ts = new TransactionScope(TransactionScopeOption.Required, txOptions, TransactionScopeAsyncFlowOption.Enabled))
            {

                using (var cn = new SqlConnection(configuration.GetConnectionString("Constr")))
                using (var cmd = new SqlCommand(sql, cn))
                {
                    cmd.Parameters.Add("@TemplateId", SqlDbType.Int).Value = job.TemplateId;
                    // Strings: trim; send DBNull for null/empty
                    cmd.Parameters.Add("@Title", SqlDbType.NVarChar, 200).Value = (object)NullIfWhite(job.Title) ?? DBNull.Value;
                    cmd.Parameters.Add("@Department", SqlDbType.NVarChar, 200).Value = (object)NullIfWhite(job.Department) ?? DBNull.Value;
                    cmd.Parameters.Add("@Location", SqlDbType.NVarChar, 200).Value = (object)NullIfWhite(job.Location) ?? DBNull.Value;
                    cmd.Parameters.Add("@HiringManager", SqlDbType.NVarChar, 200).Value = (object)NullIfWhite(job.HiringManager) ?? DBNull.Value;

                    // Dates: nullable
                    cmd.Parameters.Add("@OpenDate", SqlDbType.Date).Value = job.OpenDate.HasValue
                        ? (object)job.OpenDate.Value.Date
                        : DBNull.Value;

                    // Notes/CVPath: adjust sizes to your schema; using NVARCHAR(MAX) for Notes
                    cmd.Parameters.Add("@Notes", SqlDbType.NVarChar, -1).Value = (object)NullIfWhite(job.Notes) ?? DBNull.Value;
                    cmd.Parameters.Add("@CVPath", SqlDbType.NVarChar, 400).Value = (object)NullIfWhite(job.CVPath) ?? DBNull.Value;

                    await cn.OpenAsync().ConfigureAwait(false);
                    //var result = await cmd.ExecuteScalarAsync().ConfigureAwait(false);
                    using (var reader = await cmd.ExecuteReaderAsync().ConfigureAwait(false))
                    {
                        if (await reader.ReadAsync().ConfigureAwait(false))
                        {
                            retJob = new JobDefinition
                            {
                                TemplateId = reader.GetInt32(reader.GetOrdinal("TemplateId")),
                                JobId = reader.GetGuid(reader.GetOrdinal("JobId")),
                                Title = reader.IsDBNull(reader.GetOrdinal("Title")) ? null : reader.GetString(reader.GetOrdinal("Title")),
                                Department = reader.IsDBNull(reader.GetOrdinal("Department")) ? null : reader.GetString(reader.GetOrdinal("Department")),
                                Location = reader.IsDBNull(reader.GetOrdinal("Location")) ? null : reader.GetString(reader.GetOrdinal("Location")),
                                HiringManager = reader.IsDBNull(reader.GetOrdinal("HiringManager")) ? null : reader.GetString(reader.GetOrdinal("HiringManager")),
                                OpenDate = reader.IsDBNull(reader.GetOrdinal("OpenDate")) ? (DateTime?)null : reader.GetDateTime(reader.GetOrdinal("OpenDate")),
                                Notes = reader.IsDBNull(reader.GetOrdinal("Notes")) ? null : reader.GetString(reader.GetOrdinal("Notes")),
                                CVPath = reader.IsDBNull(reader.GetOrdinal("CVPath")) ? null : reader.GetString(reader.GetOrdinal("CVPath"))
                            };

                        }
                        else
                        {
                            throw new InvalidOperationException("Insert failed: no row returned.");
                        }
                    }

                    if (jobFiles != null && jobFiles.Count > 0)
                    {
                        foreach (var jobFile in jobFiles)
                        {
                            sql = @"
                            INSERT INTO dbo.Candidate
                            (
                                JobId,
                                FullName,
                                Phone,
                                Email,
                                Source,
                                CvPath,
                                ConvertedPath,
                                Tag0Status,
                                Tag0Remarks,
                                Tag0UpdatedAt,
                                Json,
                                ExcludedOnPhase,
                                NextPhase
                            )
                                OUTPUT INSERTED.*
                                VALUES
                                (
                                    @JobId,
                                    @FullName,
                                    @Phone,
                                    @Email,
                                    @Source,
                                    @CvPath,
                                    @ConvertedPath,
                                    @Tag0Status,
                                    @Tag0Remarks,
                                    @Tag0UpdatedAt,
                                    @Json,
                                    @ExcludedOnPhase ,
                                    @NextPhase 
                                );";

                            cmd.Parameters.Clear();
                            cmd.CommandText = sql;
                            // Reuse parameters
                            cmd.Parameters.Add("@JobId", SqlDbType.UniqueIdentifier).Value = retJob.JobId;
                            cmd.Parameters.Add("@FullName", SqlDbType.NVarChar, 200).Value = helpers.GuessNameFromFile(jobFile.FileName);
                            cmd.Parameters.Add("@Phone", SqlDbType.NVarChar, 100).Value = DBNull.Value;
                            cmd.Parameters.Add("@Email", SqlDbType.NVarChar, 200).Value = DBNull.Value;
                            cmd.Parameters.Add("@Source", SqlDbType.NVarChar, 100).Value = DBNull.Value;
                            cmd.Parameters.Add("@CvPath", SqlDbType.NVarChar, 400).Value = DBNull.Value;
                            cmd.Parameters.Add("@ConvertedPath", SqlDbType.NVarChar, 400).Value = DBNull.Value;
                            cmd.Parameters.Add("@Tag0Status", SqlDbType.NVarChar, 100).Value = DBNull.Value;
                            cmd.Parameters.Add("@Tag0Remarks", SqlDbType.NVarChar, 1000).Value = DBNull.Value;
                            cmd.Parameters.Add("@Tag0UpdatedAt", SqlDbType.DateTime2).Value = DBNull.Value;
                            cmd.Parameters.Add("@Json", SqlDbType.NVarChar, -1).Value = (templateDefinitionRow?.Json != null) ? JsonConvert.SerializeObject(templateDefinitionRow?.Json) : DBNull.Value;
                            cmd.Parameters.Add("@ExcludedOnPhase", SqlDbType.NVarChar, 100).Value = DBNull.Value;
                            cmd.Parameters.Add("@NextPhase", SqlDbType.NVarChar, 100).Value = DBNull.Value;
                            
                            using (var reader = await cmd.ExecuteReaderAsync().ConfigureAwait(false))
                            {
                                if (await reader.ReadAsync().ConfigureAwait(false))
                                {
                                    candidates.Add( new CandidateDefinition
                                    {
                                        CandidateId = reader.GetGuid(reader.GetOrdinal("CandidateId")),
                                        JobId = reader.GetGuid(reader.GetOrdinal("JobId")),
                                        FullName = reader.GetString(reader.GetOrdinal("FullName")),
                                        Phone = reader.IsDBNull(reader.GetOrdinal("Phone")) ? null : reader.GetString(reader.GetOrdinal("Phone")),
                                        Email = reader.IsDBNull(reader.GetOrdinal("Email")) ? null : reader.GetString(reader.GetOrdinal("Email")),
                                        Source = reader.IsDBNull(reader.GetOrdinal("Source")) ? null : reader.GetString(reader.GetOrdinal("Source")),
                                        CvPath = reader.IsDBNull(reader.GetOrdinal("CvPath")) ? null : reader.GetString(reader.GetOrdinal("CvPath")),
                                        ConvertedPath = reader.IsDBNull(reader.GetOrdinal("ConvertedPath")) ? null : reader.GetString(reader.GetOrdinal("ConvertedPath")),
                                        Tag0Status = reader.IsDBNull(reader.GetOrdinal("Tag0Status")) ? null : reader.GetString(reader.GetOrdinal("Tag0Status")),
                                        Tag0Remarks = reader.IsDBNull(reader.GetOrdinal("Tag0Remarks")) ? null : reader.GetString(reader.GetOrdinal("Tag0Remarks")),
                                        Tag0UpdatedAt = reader.IsDBNull(reader.GetOrdinal("Tag0UpdatedAt")) ? (DateTime?)null : reader.GetDateTime(reader.GetOrdinal("Tag0UpdatedAt")),
                                        Json = reader.IsDBNull(reader.GetOrdinal("Json")) ? null : JsonConvert.DeserializeObject<TemplateRoot>(reader.GetString(reader.GetOrdinal("Json"))),
                                        ExcludedOnPhase = reader.IsDBNull(reader.GetOrdinal("ExcludedOnPhase")) ? null : reader.GetString(reader.GetOrdinal("ExcludedOnPhase")),
                                        NextPhase = reader.IsDBNull(reader.GetOrdinal("NextPhase")) ? null : reader.GetString(reader.GetOrdinal("NextPhase")),
                                    });
                                }
                            }
                        }
                    }
                }
                ts.Complete();
            }


            if (jobFiles != null && jobFiles.Count > 0)
            {
     
                storedFiles = new List<StoreResult>();
                foreach (var jobFile in jobFiles)
                {
                    var candidateId = candidates.FirstOrDefault(c => c.FullName == helpers.GuessNameFromFile(jobFile.FileName))?.CandidateId ?? Guid.NewGuid();
                    var FolderPath = $"Job-{retJob.JobId}/{candidateId}";
                    var safeName = Path.GetFileName(jobFile.FileName);
                    var relPath = $"{FolderPath}/{safeName}";
                    await using var stream = jobFile.OpenReadStream();
                    var res = await _storage.SaveAsync(
                        relativePath: relPath,
                        content: stream,
                        overwrite: false,
                        contentType: string.IsNullOrWhiteSpace(jobFile.ContentType) ? null : jobFile.ContentType,
                        () =>
                        {
                            return candidates.FirstOrDefault(c => c.FullName == helpers.GuessNameFromFile(jobFile.FileName))?.CandidateId ?? Guid.NewGuid();
                        }
                    );
                    storedFiles.Add(res);

                }

            }

            return new SaveJobResult(job: retJob, candidates, template: templateDefinitionRow!,storedFiles: storedFiles);

        }

        public async Task<object> LoadJob(string JobId)
        {
            JobDefinition retJob = (await GetJobById(JobId).ConfigureAwait(false))!;
            TemplateDefinitionRow templateDefinitionRow = (await GetJobTemplateById(retJob.TemplateId).ConfigureAwait(false))!;
            List<CandidateDefinition> candidates = await GetCandidateByJob(JobId).ConfigureAwait(false);
            List<StoreResult> storedFiles = new List<StoreResult>();
            var FolderPath = $"Job-{retJob.JobId}";
            foreach (var cand in candidates)
            {
                storedFiles.AddRange(await _storage.ListAsync($"{FolderPath}/{cand.CandidateId.ToString()}").ConfigureAwait(false));
            }
            //var storedFiles = await _storage.ListAsync(FolderPath).ConfigureAwait(false);

            return new SaveJobResult(job: retJob, candidates, template: templateDefinitionRow, storedFiles: storedFiles);




        }

        public async Task<JobDefinition?> GetJobById(string JobId)
        {
            var sql = @"
                SELECT TOP (1)
                    JobId,
                    TemplateId,
                    Title,
                    Department,
                    Location,
                    HiringManager,
                    OpenDate,
                    Notes,
                    CVPath
                FROM dbo.Job
                WHERE JobId = @JobId;";
            using var cn = new SqlConnection(configuration.GetConnectionString("Constr"));
            using var cmd = new SqlCommand(sql, cn);
            cmd.Parameters.Add("@JobId", SqlDbType.UniqueIdentifier).Value = Guid.Parse(JobId);
            cn.Open();
            using var r = await cmd.ExecuteReaderAsync();
            if (!r.Read()) return null;
            return new JobDefinition
            {
                TemplateId = r.GetInt32(r.GetOrdinal("TemplateId")),
                JobId = r.GetGuid(r.GetOrdinal("JobId")),
                Title = r.IsDBNull(r.GetOrdinal("Title")) ? null : r.GetString(r.GetOrdinal("Title")),
                Department = r.IsDBNull(r.GetOrdinal("Department")) ? null : r.GetString(r.GetOrdinal("Department")),
                Location = r.IsDBNull(r.GetOrdinal("Location")) ? null : r.GetString(r.GetOrdinal("Location")),
                HiringManager = r.IsDBNull(r.GetOrdinal("HiringManager")) ? null : r.GetString(r.GetOrdinal("HiringManager")),
                OpenDate = r.IsDBNull(r.GetOrdinal("OpenDate")) ? (DateTime?)null : r.GetDateTime(r.GetOrdinal("OpenDate")),
                Notes = r.IsDBNull(r.GetOrdinal("Notes")) ? null : r.GetString(r.GetOrdinal("Notes")),
                CVPath = r.IsDBNull(r.GetOrdinal("CVPath")) ? null : r.GetString(r.GetOrdinal("CVPath"))
            };
        }
        public async Task<List<CandidateDefinition>> GetCandidateByJob(string JobId)
        {
            var list = new List<CandidateDefinition>();
            using (var cn = new SqlConnection(configuration.GetConnectionString("Constr")))
            using (var cm = new SqlCommand("SELECT * FROM dbo.Candidate WHERE JobId = @JobId", cn))
            {
                cm.Parameters.Add("@JobId", SqlDbType.UniqueIdentifier).Value = Guid.Parse(JobId);

                await cn.OpenAsync().ConfigureAwait(false);
                using (var r = await cm.ExecuteReaderAsync().ConfigureAwait(false))
                {

                    while (r.Read())
                    {
                        var cand = new CandidateDefinition
                        {
                            CandidateId = r.GetGuid(r.GetOrdinal("CandidateId")),
                            JobId = r.GetGuid(r.GetOrdinal("JobId")),

                            FullName = r.IsDBNull(r.GetOrdinal("FullName")) ? null : r.GetString(r.GetOrdinal("FullName")),
                            Phone = r.IsDBNull(r.GetOrdinal("Phone")) ? null : r.GetString(r.GetOrdinal("Phone")),
                            Email = r.IsDBNull(r.GetOrdinal("Email")) ? null : r.GetString(r.GetOrdinal("Email")),
                            Source = r.IsDBNull(r.GetOrdinal("Source")) ? null : r.GetString(r.GetOrdinal("Source")),
                            CvPath = r.IsDBNull(r.GetOrdinal("CvPath")) ? null : r.GetString(r.GetOrdinal("CvPath")),
                            ConvertedPath = r.IsDBNull(r.GetOrdinal("ConvertedPath")) ? null : r.GetString(r.GetOrdinal("ConvertedPath")),
                            Tag0Status = r.IsDBNull(r.GetOrdinal("Tag0Status")) ? null : r.GetString(r.GetOrdinal("Tag0Status")),
                            Tag0Remarks = r.IsDBNull(r.GetOrdinal("Tag0Remarks")) ? null : r.GetString(r.GetOrdinal("Tag0Remarks")),
                            Json = (r.GetString(r.GetOrdinal("Json")) != string.Empty) ? JsonConvert.DeserializeObject<TemplateRoot>(r.GetString(r.GetOrdinal("Json"))) : null,
                            ExcludedOnPhase = r.IsDBNull(r.GetOrdinal("ExcludedOnPhase")) ? null : r.GetString(r.GetOrdinal("ExcludedOnPhase")),
                            NextPhase = r.IsDBNull(r.GetOrdinal("NextPhase")) ? null : r.GetString(r.GetOrdinal("NextPhase")),

                            Tag0UpdatedAt = r.IsDBNull(r.GetOrdinal("Tag0UpdatedAt")) ? (DateTime?)null : r.GetDateTime(r.GetOrdinal("Tag0UpdatedAt")),
                        };

                        list.Add(cand);

                    }
                }

                return list;
            }



        }
        private static string NullIfWhite(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

        public sealed record SaveJobResult(
                JobDefinition job,
                List<CandidateDefinition> candidates,
                TemplateDefinitionRow template,
                IEnumerable<StoreResult> storedFiles
        );
    }
}
