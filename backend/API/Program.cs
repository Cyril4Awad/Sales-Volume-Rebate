using FixedAssets_WS.Classes;
using DataService.DataAccess;
using DataService.Engines.Authentication;
using DataService.Others;
using DataService.Storage;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.FileProviders.Physical;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

Encoding.RegisterProvider(CodePagesEncodingProvider.Instance);

foreach (var entry in builder.Configuration.GetSection("ConnectionStrings").GetChildren())
{
    var value = entry.Value;
    if (string.IsNullOrWhiteSpace(value)) continue;

    Console.WriteLine($"Raw value from config: [{value}]");

    var decrypted = EncDec.DecryptConnectionString(value);

    Console.WriteLine($"Decrypted: [{decrypted}]");

    if (!string.IsNullOrWhiteSpace(decrypted))
        builder.Configuration[entry.Path] = decrypted;
}
// Add services to the container.

builder.Services.AddControllers();
// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddControllers(options =>
{
    options.Filters.Add(new GlobalExceptionFilter());
});
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddHttpContextAccessor();
builder.Services.Configure<Jwt>(builder.Configuration.GetSection("Jwt"));
builder.Services.AddScoped<AuthenticationEngine>();
builder.Services.AddScoped<AutDAL>();

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

var app = builder.Build();

app.UseCors(p => p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod());

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
//provider.Mappings[".txt"] = "text/plain";   // <- add this

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
        // StaticFileMiddleware sets Last-Modified; ETag isn’t automatic.
    }
});


#endregion
 

app.UseStaticFiles();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
//app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
