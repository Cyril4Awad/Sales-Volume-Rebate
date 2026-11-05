using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Models
{
    public class CVR_Type
    {
        public int VRT_TypeID { get; set; }
        public string VRT_TypeName { get; set; }
        public string VRT_Behavior { get; set; }
        public string VRT_Remarks { get; set; }
        public bool VRT_Active { get; set; }

        public DateTime? VRT_CDStamp { get; set; }
        public string VRT_CUStamp { get; set; }
        public DateTime? VRT_MDStamp { get; set; }
        public string VRT_MUStamp { get; set; }
    }
}
