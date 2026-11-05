import ContractFormSection from "../../../Contracts/editor/ContractFormSection";
import ContractClientsSection from "../../../Contracts/editor/ContractClientsSection";
import "./PlanContractSection.css";

export default function PlanContractSection({
    contractDraft,
    onChange,
    authAxios,
    clientLabelById,
    setClientLabelById,
    onValidationError,
    fieldErrors,
    validationAttempted,
    currencyOptions,
    selectMenuProps,
    readOnly = false,
}) {
    if (!contractDraft) return null;

    return (
        <div className="card border-0 shadow-sm mb-3 plan-contract-section">
            <div className="card-header bg-light border-0">
                <strong>Contract</strong>
            </div>
            <div className="card-body" style={{ overflow: "visible" }}>
                <ContractFormSection
                    draft={contractDraft}
                    onChange={onChange}
                    fieldErrors={fieldErrors}
                    validationAttempted={validationAttempted}
                    currencyOptions={currencyOptions}
                    selectMenuProps={selectMenuProps}
                    readOnly={readOnly}
                />
                {authAxios && (
                    <ContractClientsSection
                        draft={contractDraft}
                        onChange={onChange}
                        authAxios={authAxios}
                        clientLabelById={clientLabelById}
                        setClientLabelById={setClientLabelById}
                        onValidationError={onValidationError}
                        validationAttempted={validationAttempted}
                        readOnly={readOnly}
                    />
                )}
            </div>
        </div>
    );
}
