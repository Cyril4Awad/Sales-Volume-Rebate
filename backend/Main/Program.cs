using FixedAssets_WS.Classes;
using DataService.DataAccess;
using DataService.Engine;
using DataService.Engines.Authentication;
using DataService.Engines.Main;
using DataService.Engines.Notification;
using DataService.Models;
using DataService.Others;
using DataService.Storage;
using Main.Middleware;
using Main.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.AspNetCore.Mvc.Authorization;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.FileProviders.Physical;
using Microsoft.IdentityModel.Tokens;
using System.Text;

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

var builder = WebApplication.CreateBuilder(args);

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);


// Decrypt connection strings at startup
foreach (var entry in builder.Configuration.GetSection("ConnectionStrings").GetChildren())
{
    var value = entry.Value;
    if (string.IsNullOrWhiteSpace(value)) continue;
    var decrypted = EncDec.DecryptConnectionString(value);
    if (!string.IsNullOrWhiteSpace(decrypted))
        builder.Configuration[entry.Path] = decrypted;
}

// Optional: increase request timeout for SSE endpoints
builder.Services.AddRequestTimeouts(o =>
{
    o.DefaultPolicy = new RequestTimeoutPolicy { Timeout = TimeSpan.FromMinutes(2) };
    o.AddPolicy("SSE", new RequestTimeoutPolicy { Timeout = TimeSpan.FromHours(12) });
});
// CORS
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowSSE", policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod()
              .WithExposedHeaders("_auth");
    });
});

// Add services to the container.

builder.Services.AddControllers(options =>
{
    options.Filters.Add(new GlobalExceptionFilter());
    options.Filters.Add(new AuthorizeFilter());
});


builder.Services.AddScoped<AuthenticationEngine>();


// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();

builder.Services.AddHttpContextAccessor();

builder.Services.AddScoped<UserTenantContextProvider>();
builder.Services.AddScoped<JWTTokenProvider>();

builder.Services.AddScoped<COM_UserInfo>();
builder.Services.AddScoped<MainDAL>();
builder.Services.AddScoped<AutDAL>();
builder.Services.AddScoped<NotificationDAL>();

//Sales Volume Rebate
builder.Services.AddScoped<COM_CurrencyDAL>();
builder.Services.AddScoped<Com_CurrencyEngine>();

builder.Services.AddScoped<COM_DailyRateDAL>();
builder.Services.AddScoped<CVRDailyRatesEngine>();

builder.Services.AddScoped<CVRTypeDAL>();
builder.Services.AddScoped<CVRTypeEngine>();

builder.Services.AddScoped<CVRComputationTypeDAL>();
builder.Services.AddScoped<CVRComputationTypeEngine>();

builder.Services.AddScoped<CVRSettlementTypeDAL>();
builder.Services.AddScoped<CVRSettlementTypeEngine>();

builder.Services.AddScoped<CVRContractDAL>();
builder.Services.AddScoped<CVRContractEngine>();

builder.Services.AddScoped<CVRContractClientDAL>();
builder.Services.AddScoped<CVRContractClientEngine>();

builder.Services.AddScoped<ClientsDAL>();
builder.Services.AddScoped<CVRLookupsDAL>();

builder.Services.AddScoped<CVRPlanWorkspaceDAL>();
builder.Services.AddScoped<CVRPlanWorkspaceEngine>();

builder.Services.AddScoped<CVRComputationDAL>();
builder.Services.AddScoped<CVRComputationEngine>();

builder.Services.AddScoped<CVRSettlementPaymentDAL>();
builder.Services.AddScoped<CVRSettlementPaymentEngine>();
builder.Services.AddTransient<DataService.Legacy.POS.POSCreditNote>();

builder.Services.AddScoped<CVRSavedComputationDAL>();
builder.Services.AddScoped<CVRSavedComputationEngine>();

//end of sales volume rebate

builder.Services.AddScoped<MainEngine>();
builder.Services.AddScoped<NotificationEngine>();

builder.Services.AddSingleton<SSEService>();



//builder.Services.AddHostedService<NotifierService>();

builder.Services.Configure<Jwt>(builder.Configuration.GetSection("Jwt"));

#region "Static File Serving"
// Setup for static file serving from "assets" folder at /media/*
var assetsRoot = Path.Combine(builder.Environment.ContentRootPath, "assets");
if (!Directory.Exists(assetsRoot))
    Directory.CreateDirectory(assetsRoot);
builder.Services.AddSingleton(new StorageOptions
{
    AssetsRoot = assetsRoot,
    RequestPath = "/media",
});
builder.Services.AddSingleton<IStorage, LocalDiskStorage>();
#endregion

var JwtConfig = builder.Configuration.GetSection("Jwt");

var signingKey = new SymmetricSecurityKey(Encoding.ASCII.GetBytes(JwtConfig["Key"]));
var tokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuerSigningKey = true,
    IssuerSigningKey = signingKey,
    ValidateIssuer = true,
    ValidIssuer = JwtConfig["Issuer"],
    ValidateAudience = true,
    ValidAudience = JwtConfig["Audience"],
    ValidateLifetime = true,
    ClockSkew = TimeSpan.Zero,
    RequireExpirationTime = true,
};

builder.Services.AddAuthentication(o =>
{
    o.DefaultAuthenticateScheme = "TestKey";
})
.AddJwtBearer("TestKey", x =>
{
    x.RequireHttpsMetadata = false;
    x.TokenValidationParameters = tokenValidationParameters;
    x.Events = new JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            Console.WriteLine($"Authentication failed: {context.Exception}");
            return Task.CompletedTask;
        },
        OnTokenValidated = context =>
        {
            Console.WriteLine("Token successfully validated");
            Console.WriteLine($"User: {context.Principal.Identity.Name}");
            Console.WriteLine($"Claims: {string.Join(", ", context.Principal.Claims.Select(c => $"{c.Type}={c.Value}"))}");
            return Task.CompletedTask;
        },
        OnMessageReceived = context =>
        {
            Console.WriteLine($"Token received: {context.Token}");
            return Task.CompletedTask;
        },
        OnChallenge = context =>
        {
            Console.WriteLine($"Challenge issued: {context.Error} - {context.ErrorDescription}");
            return Task.CompletedTask;
        }
    };
});


var app = builder.Build();
app.UseCors("AllowSSE");
#region "Static File Serving"


// 1) Restrict served file types (deny by default)
var provider = new FileExtensionContentTypeProvider();
// Optional: clear and allow-list
//provider.Mappings.Clear();
//provider.Mappings[".png"] = "image/png";
//provider.Mappings[".jpg"] = "image/jpeg";
//provider.Mappings[".jpeg"] = "image/jpeg";
//provider.Mappings[".webp"] = "image/webp";
//provider.Mappings[".gif"] = "image/gif";
//provider.Mappings[".pdf"] = "application/pdf";

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(assetsRoot, ExclusionFilters.Sensitive), // hides .git, .env, etc.
    RequestPath = "/media",
    ContentTypeProvider = provider,                      // block unknown types
    ServeUnknownFileTypes = false,                       // extra safety
    OnPrepareResponse = ctx =>
    {
        // 2) Caching policy (tune per need)
        // Dev: no cache
        // ctx.Context.Response.Headers["Cache-Control"] = "no-cache, no-store";
        // Prod example: long cache
        ctx.Context.Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
        // StaticFileMiddleware sets Last-Modified; ETag isn�t automatic.
    }
});


#endregion

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

//app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TokenRefreshMiddleware>();
app.MapControllers();


app.Run();
