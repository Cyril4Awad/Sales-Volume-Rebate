import { useState } from "react";
import {
    InputTextComponent,
    SelectComp,
    TextAreaComp,
} from "../../../../ReusableComponents";

const hasSelectValue = (sel) => {
    if (sel == null || sel === "") return false;
    if (typeof sel === "object") {
        const v = sel.value;
        return v != null && String(v).trim() !== "";
    }
    return String(sel).trim() !== "";
};

export default function PlanFormSection({
    plan,
    onChange,
    typeOptions,
    selectMenuProps,
    validationAttempted,
    readOnly = false,
}) {
    const [missingTypeId, setMissingTypeId] = useState(false);
    const [missingPlanName, setMissingPlanName] = useState(false);

    const handleChange = (value, name) => {
        if (name === "typeId" && hasSelectValue(value)) setMissingTypeId(false);
        if (name === "planName" && String(value ?? "").trim()) setMissingPlanName(false);
        onChange({ ...plan, [name]: value });
    };

    const typeInvalid = missingTypeId || (validationAttempted && !hasSelectValue(plan.typeId));
    const nameInvalid = missingPlanName || (validationAttempted && !plan.planName?.trim());

    return (
        <div className="plan-form-section">
            <div className="row align-items-start" style={{ overflow: "visible" }}>
                <div className="col-md-4 mb-3">
                    <InputTextComponent name="planName" value={plan.planName}
                        placeholder={<>Plan Name <span className="required">*</span></>}
                        handleChange={handleChange}
                        handleOnblur={(value) => {
                            if (!String(value ?? "").trim()) setMissingPlanName(true);
                        }}
                        className={nameInvalid ? "alert-danger" : ""}
                        maxLength={100}
                        disabled={readOnly}
                        readOnly={readOnly} />
                </div>
                <div className="col-md-4 mb-3">
                    <div style={typeInvalid ? { border: "1px solid #dc3545", borderRadius: 4 } : undefined}>
                        <SelectComp name="typeId" value={plan.typeId} options={typeOptions}
                            onChange={handleChange}
                            placeholder={<>VR Type <span className="required">*</span></>}
                            clearable {...selectMenuProps} />
                    </div>
                </div>

                <div className="col-md-8 mb-3">
                    <TextAreaComp name="remarks" value={plan.remarks} onChange={handleChange}
                        placeholder="Remarks" maxLength={500} maxRows={4} style={{ minHeight: "50px" }} />
                </div>
            </div>
        </div>
    );
}
