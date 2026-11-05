using DataService.DataAccess;
using DataService.Models.DTOs;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Engines.Notification
{

    public class NotificationEngine
    {
        private readonly NotificationDAL _notificationDal;
        public NotificationEngine(NotificationDAL notificationDal)
        {
            _notificationDal = notificationDal ?? throw new ArgumentNullException(nameof(notificationDal));
        }
        public async Task<int> CreateNotificationAsync(NotificationDto notification)
        {
            return await _notificationDal.CreateNotificationAsync(notification);
        }

        public async Task<List<NotificationDto>> getPendingNotificationsAsync()
        {
            return await _notificationDal.getPendingNotifications();
        }
    }
}
