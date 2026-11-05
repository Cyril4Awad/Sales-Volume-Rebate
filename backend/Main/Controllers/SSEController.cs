using DataService.Engines.Notification;
using DataService.Others;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Timeouts;
using Microsoft.AspNetCore.Mvc;
using System.Text;
using System.Threading;

namespace Main.Controllers
{
    [Route("api/[controller]/")]
    [ApiController]
    [Authorize]
    public class SSEController : ControllerBase
    {

        private readonly NotificationEngine _notificationEngine;
        private readonly SSEService _sseService;
        private readonly ILogger<SSEController> _logger;
        public SSEController(
    NotificationEngine notificationEngine,
    SSEService sseService,
    ILogger<SSEController> logger)
        {
            _notificationEngine = notificationEngine ?? throw new ArgumentNullException(nameof(notificationEngine));
            _sseService = sseService ?? throw new ArgumentNullException(nameof(sseService));
            _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        }
        /// <summary>
        /// SSE endpoint for clients to connect and receive real-time notifications
        /// URL: GET /api/sse/connect?clientType=USER&clientId=123
        /// </summary>
        [RequestTimeout("SSE")]
        [HttpGet("connect")]
        public async Task Connect(string clientType, int clientId, CancellationToken cancellationToken)
        {
            var clientKey = $"{clientType}_{clientId}";
            _logger.LogInformation("SSE connection request from {ClientKey}", clientKey);

            // Set up SSE headers
            Response.Headers.Append("Content-Type", "text/event-stream");
            Response.Headers.Append("Cache-Control", "no-cache");
            Response.Headers.Append("Connection", "keep-alive");
            Response.Headers.Append("Access-Control-Allow-Origin", "*"); // optional

            // Create channel for this client
            var channelReader = _sseService.CreateClientChannel(clientKey);
            try
            {
                // Send initial connection confirmation
                await SendInitialConnectionMessage(clientType, clientId);

                // Start heartbeat task
                var heartbeatTask = StartHeartbeatAsync(clientKey, cancellationToken);

                // Listen for messages and send them to client
                await foreach (var message in channelReader.ReadAllAsync(cancellationToken))
                {
                    var bytes = Encoding.UTF8.GetBytes(message);
                    await Response.Body.WriteAsync(bytes, cancellationToken);
                    await Response.Body.FlushAsync(cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("SSE connection cancelled for {ClientKey}", clientKey);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "SSE connection error for {ClientKey}", clientKey);
            }
            finally
            {
                // Clean up when client disconnects
                _sseService.RemoveClient(clientKey);
                _logger.LogInformation("SSE connection closed for {ClientKey}", clientKey);
            }
        }
        private async Task StartHeartbeatAsync(string clientKey, CancellationToken cancellationToken)
        {
            try
            {
                while (!cancellationToken.IsCancellationRequested)
                {
                    await Task.Delay(30000, cancellationToken); // 30 second intervals
                    await _sseService.SendHeartbeatAsync(clientKey, cancellationToken);
                }
            }
            catch (OperationCanceledException)
            {
                // Expected when connection closes
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Heartbeat error for {ClientKey}", clientKey);
            }
        }
        private async Task SendInitialConnectionMessage(string clientType, int clientId)
        {
            var clientKey = $"{clientType}_{clientId}";
            await _sseService.SendNotificationToClientAsync(clientKey, "connected", new
            {
                message = "SSE connection established",
                clientType = clientType,
                clientId = clientId,
                timestamp = DateTime.UtcNow.ToString("O")
            });
        }
    }
}
