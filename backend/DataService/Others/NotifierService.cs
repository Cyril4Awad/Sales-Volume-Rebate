using DataService.Engines.Notification;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Win32;
using System;
using System.Collections.Generic;
using System.Diagnostics.Metrics;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Others
{

    /// <summary>
    /// Background service that periodically checks for messages 
    /// and pushes them to connected SSE clients.
    /// 
    /// This service runs as long as the application is running. 
    /// It is conceptually similar to a scheduler or cron job, 
    /// but instead of executing once and exiting, it loops continuously.
    /// NB: We use a scope factory because we cannot use scoped services inside a hosted service
    /// </summary>
    public class NotifierService: BackgroundService
    {
        //private readonly SSEService _service;
        private readonly NotificationEngine _engine;
        private readonly IServiceScopeFactory _scopeFactory;

        /// <summary>
        /// Initializes a new instance of the <see cref="NotifierService"/> class.
        /// </summary>
        /// <param name="registry">A shared registry that stores active SSE client connections.</param>
        public NotifierService(IServiceScopeFactory scopeFactory)
        {
            _scopeFactory = scopeFactory;
            //_service = service;
            //_engine = engine;
        }

        /// <summary>
        /// This method is executed when the background service starts.
        /// It runs an infinite loop (until the app stops) that sends messages to clients.
        /// </summary>
        /// <param name="stoppingToken">
        /// A cancellation token that is triggered when the host is shutting down.
        /// This should be checked regularly to stop gracefully.
        /// </param>
        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                // Create a scope to use scoped services safely
                using var scope = _scopeFactory.CreateScope();
                var serv = scope.ServiceProvider.GetRequiredService<SSEService>();
                var notifEngine = scope.ServiceProvider.GetRequiredService<NotificationEngine>();  


                var notifications = await notifEngine.getPendingNotificationsAsync();
                notifications.ForEach(async notif =>
                {
                   await serv.SendNotificationToClientAsync(notif.notification_recipient, "notification", notif);
                });

                
           

                // Wait 5 seconds before repeating
                await Task.Delay(5000, stoppingToken);
            }
        }
    }
}
