using Dapper.Contrib.Extensions;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Models
{
    [Table("com_userinfo")]
    public class COM_UserInfo
    {
        [ExplicitKey]
        public string User_Code { get; set; }
        public string? User_Name { get; set; }
        public string? User_Pwd { get; set; }
        public string? User_Status { get; set; }

    }
}
