using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace DataService.Models
{
    public class TemplateRoot
    {
        [JsonProperty("phases")]
        public BindingList<PhaseDef> Phases { get; set; } = new BindingList<PhaseDef>();

        [JsonProperty("tag0Statuses")]
        public BindingList<string> Tag0Statuses { get; set; } = new BindingList<string>();
    }

    public class PhaseDef : ICloneable
    {
        [DisplayName("Key")]
        [JsonProperty("key")]
        public string Key { get; set; }

        [DisplayName("Name")]
        [JsonProperty("name")]
        public string Name { get; set; }

        [DisplayName("Order")]
        [JsonProperty("order")]
        [ReadOnly(true)]
        public int Order { get; set; }

        [Browsable(false)]
        [JsonProperty("fields")]
        public BindingList<FieldDef> Fields { get; set; } = new BindingList<FieldDef>();

        [Browsable(false)]
        [JsonProperty("outcomes")]
        public BindingList<OutcomeDef> Outcomes { get; set; } = new BindingList<OutcomeDef>();

        [DisplayName("Eligibility")]
        [JsonProperty("eligibility")]
        public EligibilityDef Eligibility { get; set; } = new EligibilityDef();

        public object Clone()
        {
            var serialized = JsonConvert.SerializeObject(this);
            return JsonConvert.DeserializeObject<PhaseDef>(serialized);
        }

        public override string ToString() => $"{Name} ({Key})";
    }

    public class FieldDef
    {
        // keys: "salary","join_date","office","working", etc.
        [DisplayName("Key")]
        [JsonProperty("key")]
        public string Key { get; set; }

        [DisplayName("Label")]
        [JsonProperty("label")]
        public string Label { get; set; }

        // "number","date","dropdown","yesno","text","memo"
        [DisplayName("Type")]
        [JsonProperty("type")]
        public string Type { get; set; } = "text";

        [DisplayName("Required")]
        [JsonProperty("required", NullValueHandling = NullValueHandling.Ignore)]
        public bool Required { get; set; }

        [Browsable(false)]
        [JsonProperty("options", NullValueHandling = NullValueHandling.Ignore)]
        public BindingList<string> Options { get; set; } = new BindingList<string>();

        // Helper for editing options in a DataGridView as a single text column
        [DisplayName("Options (comma-separated)")]
        [JsonIgnore]
        public string OptionsComma
        {
            get => Options == null || Options.Count == 0 ? "" : string.Join(", ", Options);
            set
            {
                if (Options == null) Options = new BindingList<string>();
                Options.Clear();
                if (!string.IsNullOrWhiteSpace(value))
                {
                    foreach (var part in value.Split(new[] { ',' }, StringSplitOptions.RemoveEmptyEntries))
                        Options.Add(part.Trim());
                }
            }
        }
        [Browsable(false)]

        public object fieldValue { get; set; }

        [DisplayName("AIPrompt")]
        [JsonProperty("AIPrompt")]
        public string AIPrompt { get; set; }


        public bool ShouldSerializeOptions() => Options != null && Options.Count > 0;
        public override string ToString() => $"{Label} [{Type}]";
    }

    public class OutcomeDef
    {
        [DisplayName("Label")]
        [JsonProperty("label")]
        public string Label { get; set; }

        [DisplayName("Maps To Tag0")]
        [JsonProperty("mapsToTag0")]
        public string MapsToTag0 { get; set; }

        [DisplayName("Deactivates CV")]
        public Boolean DeactivatesCV { get; set; }

        [Browsable(false)]

        public Boolean wasSelectedByUser { get; set; }


    }
    [JsonObject]
    [TypeConverter(typeof(ExpandableObjectConverter))]
    public class EligibilityDef
    {
        [DisplayName("Requires Active After (tag key)")]
        [JsonProperty("requiresActiveAfter", NullValueHandling = NullValueHandling.Include)]
        public string RequiresActiveAfter { get; set; }

        //[DisplayName("Requires Undecided Here")]
        //[JsonProperty("requiresUndecidedHere")]
        //public bool RequiresUndecidedHere { get; set; }

        //// Serialize null for empty strings to match your example's null
        //public bool ShouldSerializeRequiresActiveAfter() => !string.IsNullOrWhiteSpace(RequiresActiveAfter);
    }





}
