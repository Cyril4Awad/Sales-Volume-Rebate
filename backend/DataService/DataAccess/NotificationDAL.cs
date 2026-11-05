using Dapper;
using DataService.Models.DTOs;
using Microsoft.Data.SqlClient;
using Microsoft.Extensions.Configuration;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.DataAccess
{
    public class NotificationDAL
    {
        private readonly IConfiguration _configuration;
        public NotificationDAL(IConfiguration configuration)
        {
            _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        }

        /// <summary>
        /// Creates a new SSE notification in the database
        /// Used when vendor sends payment request to user
        /// </summary>
        public async Task<int> CreateNotificationAsync(NotificationDto notification)
        {
            using var connection = new SqlConnection(_configuration.GetConnectionString("Constr"));
            return await Task.Run(() =>
            {
                return 1;
            });

            //string query = @"
            //    INSERT INTO tbl_CashlessPay_sse_notifications 
            //    (sse_notif_sender_type, sse_notif_sender_id, sse_notif_receiver_type, 
            //     sse_notif_receiver_id, sse_notif_data, sse_notif_status, 
            //     sse_notif_created_at, sse_notif_expires_at, sse_notif_accepted)
            //    VALUES 
            //    (@sse_notif_sender_type, @sse_notif_sender_id, @sse_notif_receiver_type, 
            //     @sse_notif_receiver_id, @sse_notif_data, @sse_notif_status, 
            //     @sse_notif_created_at, @sse_notif_expires_at, @sse_notif_accepted);
                
            //    SELECT CAST(SCOPE_IDENTITY() as int);";

            //return await connection.QuerySingleAsync<int>(query, notification);
        }

        public async Task<List<NotificationDto>> getPendingNotifications()
        {
            return await Task.Run(() =>
            {
                return new List<NotificationDto>
                {
                    new NotificationDto{notification_recipient="1_2",notification_message=""}
                };
            });
        }

    }
}
