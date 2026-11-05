using Microsoft.Extensions.Logging;
using Newtonsoft.Json;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Channels;
using System.Threading.Tasks;

namespace DataService.Others
{
    /// <summary>
    /// SSE Service for managing server-sent events with proper channel-based messaging
    /// Handles multiple client connections and targeted messaging
    /// </summary>
    public class SSEService
    {
        private readonly ILogger<SSEService> _logger;
        private readonly ConcurrentDictionary<string, Channel<string>> _clientChannels;
        public SSEService(ILogger<SSEService> logger)
        {
            _logger = logger;
            _clientChannels = new ConcurrentDictionary<string, Channel<string>>();
        }

        /// <summary>
        /// Creates a new channel for a client when they connect
        /// </summary>
        public ChannelReader<string> CreateClientChannel(string clientKey)
        {
            var options = new UnboundedChannelOptions
            {
                SingleReader = true,  // Only the SSE endpoint reads
                SingleWriter = false, // Multiple sources may write
                AllowSynchronousContinuations = false
            };

            var channel = Channel.CreateUnbounded<string>(options);
            _clientChannels[clientKey] = channel;

            _logger.LogInformation("SSE channel created for client: {ClientKey}", clientKey);
            return channel.Reader;
        }

        public async Task SendNotificationToClientAsync(string clientKey, string eventType, object data, CancellationToken cancellationToken = default)
        {
            if (!_clientChannels.TryGetValue(clientKey, out var channel))
            {
                _logger.LogWarning("Attempted to send notification to non-existent client: {ClientKey}", clientKey);
                return;
            }

            try
            {
                var eventData = JsonConvert.SerializeObject(data);
                var sseMessage = $"event: {eventType}\ndata: {eventData}\n\n";

                await channel.Writer.WriteAsync(sseMessage, cancellationToken);
                _logger.LogInformation("SSE notification sent to {ClientKey}: {EventType}", clientKey, eventType);
            }
            catch (ChannelClosedException)
            {
                _logger.LogWarning("Attempted to send SSE notification to closed channel: {ClientKey}", clientKey);
                RemoveClient(clientKey);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send SSE notification to {ClientKey}", clientKey);
            }
        }
        /// <summary>
        /// Removes a client channel when they disconnect
        /// </summary>
        public void RemoveClient(string clientKey)
        {
            if (_clientChannels.TryRemove(clientKey, out var channel))
            {
                channel.Writer.TryComplete();
                _logger.LogInformation("SSE client removed: {ClientKey}", clientKey);
            }
        }
        /// <summary>
        /// Sends a heartbeat to a specific client to keep connection alive
        /// </summary>
        public async Task SendHeartbeatAsync(string clientKey, CancellationToken cancellationToken = default)
        {
            await SendNotificationToClientAsync(clientKey, "heartbeat", new
            {
                timestamp = DateTime.UtcNow.ToString("O"),
                message = "Connection alive"
            }, cancellationToken);
        }

    }
}
