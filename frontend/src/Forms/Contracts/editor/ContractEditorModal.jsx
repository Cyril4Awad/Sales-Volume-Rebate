import { useEffect, useState } from "react";
import { ModalComp } from "../../../ReusableComponents";
import ContractModalValidationAlerts from "../components/ContractModalValidationAlerts";
import ContractFormSection from "./ContractFormSection";
import ContractClientsSection from "./ContractClientsSection";
import { validateContractDraft } from "../../../utils/contractWorkspaceValidation";
import "../styles/VRContractsWorkspace.css";

export default function ContractEditorModal({
    open,
    initialDraft,
    isNew,
    onClose,
    onApply,
    allRecords,
    authAxios,
    clientLabelById,
    setClientLabelById,
    initialValidationErrors = [],
}) {
    const [draft, setDraft] = useState(initialDraft);
    const [validationErrors, setValidationErrors] = useState([]);
    const [validationAttempted, setValidationAttempted] = useState(false);

    useEffect(() => {
        if (open && initialDraft) {
            setDraft(initialDraft);
            setValidationErrors([]);
            setValidationAttempted(false);
        }
    }, [open, initialDraft]);

    useEffect(() => {
        if (open && initialValidationErrors?.length) {
            setValidationErrors(initialValidationErrors);
        }
    }, [open, initialValidationErrors]);

    const appendValidationError = (msg) => {
        if (msg) setValidationErrors((prev) => [...prev, msg]);
    };

    const handleApply = () => {
        const { valid, errors } = validateContractDraft(
            draft,
            allRecords,
            draft.ContractID
        );
        if (!valid) {
            setValidationAttempted(true);
            setValidationErrors(errors);
            return;
        }
        setValidationErrors([]);
        setValidationAttempted(false);
        onApply(draft);
    };

    if (!draft) return null;

    return (
        <ModalComp
            modal={open}
            modalTitle={isNew ? "Add contract" : "Edit contract"}
            modalBody={(
                <>
                    <ContractModalValidationAlerts errors={validationErrors} />
                    <ContractFormSection
                        draft={draft}
                        onChange={setDraft}
                        validationAttempted={validationAttempted}
                    />
                    <ContractClientsSection
                        draft={draft}
                        onChange={setDraft}
                        authAxios={authAxios}
                        clientLabelById={clientLabelById}
                        setClientLabelById={setClientLabelById}
                        onValidationError={appendValidationError}
                        validationAttempted={validationAttempted}
                    />
                </>
            )}
            onClose={onClose}
            onAccept={handleApply}
            onAcceptText="Apply"
            onCloseText="Cancel"
            size="xl"
            className="importDataModal planEditorModal"
        />
    );
}
