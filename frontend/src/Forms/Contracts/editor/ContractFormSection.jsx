import { useState, useEffect } from "react";
import moment from "moment";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";
import "./ContractFormSection.css";
import {
    CheckBoxComp,
    InputTextComponent,
    DateTimePickerComp,
    TextAreaComp,
    UploadFiles,
    SelectComp,
} from "../../../ReusableComponents";
import { documentUploadRowsFromDraft } from "../../../utils/contractWorkspaceMappers";

const quillModules = {
    toolbar: [
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ size: ["small", false, "large"] }],
        ["clean"],
    ],
};

const quillFormats = [
    "bold", "italic", "underline",
    "list", "bullet",
    "size",
];

export default function ContractFormSection({
    draft,
    onChange,
    fieldErrors,
    validationAttempted,
    currencyOptions = [],
    selectMenuProps = {},
    readOnly = false,
}) {
    const [missingContractReference, setMissingContractReference] = useState(false);
    const [missingContractName, setMissingContractName] = useState(false);
    const [missingStartDate, setMissingStartDate] = useState(false);
    const [missingEndDate, setMissingEndDate] = useState(false);
    const [documentError, setDocumentError] = useState("");
    const [termsHtml, setTermsHtml] = useState(() => draft.Terms || "");

    useEffect(() => {
        setTermsHtml(draft.Terms || "");
        // Intentionally sync only when contract identity changes, not on each Terms keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draft.ContractID]);

    const handleTermsChange = (value) => {
        if (readOnly) return;
        setTermsHtml(value);
        onChange({ ...draft, Terms: value });
    };

    // Auto-clear document error after 4 seconds
    useEffect(() => {
        if (!documentError) return;
        const timer = setTimeout(() => setDocumentError(""), 5000);
        return () => clearTimeout(timer);
    }, [documentError]);

    // Clear error when document is removed
    useEffect(() => {
        if (!draft.Document) {
            setDocumentError("");
        }
    }, [draft.Document]);

    const isPdfFile = (file) => {
        if (!file || !(file instanceof File)) return false;
        const name = String(file.name ?? "").toLowerCase();
        return file.type === "application/pdf" || name.endsWith(".pdf");
    };

    const handleInputChange = (value, name) => {
        if (name === "ContractReference" && String(value ?? "").trim()) setMissingContractReference(false);
        if (name === "ContractName" && String(value ?? "").trim()) setMissingContractName(false);
        onChange({ ...draft, [name]: value });
    };

    const handleCurrencyChange = (value) => {
        onChange({ ...draft, contractCurrency: value });
    };

    const handleDateTimeChange = (value, name) => {
        if (name === "StartDate" && value) setMissingStartDate(false);
        if (name === "EndDate" && value) setMissingEndDate(false);
        onChange({ ...draft, [name]: value || null });
    };

    const handleTextareaChange = (value, name) => {
    const maxLen = name === "Remarks" ? 500 : name === "Terms" ? 1000 : undefined;
    const trimmed = maxLen && value?.length > maxLen ? value.slice(0, maxLen) : value;
    onChange({ ...draft, [name]: trimmed });
};

    const handleCheckboxChange = (checked, name) =>
        onChange({ ...draft, [name]: checked });

    const refInvalid =
        missingContractReference
        || !!fieldErrors?.ContractReference
        || (validationAttempted && !draft.ContractReference?.trim());

    const nameInvalid =
        missingContractName || (validationAttempted && !draft.ContractName?.trim());

    const dateOrderInvalid =
        draft.StartDate
        && draft.EndDate
        && moment(draft.StartDate).isAfter(moment(draft.EndDate));

    const startInvalid =
        missingStartDate
        || !!fieldErrors?.StartDate
        || (validationAttempted && !draft.StartDate)
        || (validationAttempted && dateOrderInvalid);

    const endInvalid =
        missingEndDate
        || !!fieldErrors?.EndDate
        || (validationAttempted && !draft.EndDate)
        || (validationAttempted && dateOrderInvalid);

    const currencyInvalid =
        !!fieldErrors?.contractCurrency
        || (validationAttempted && !draft.contractCurrency);

    const documentUploadRows = documentUploadRowsFromDraft(draft.Document);

    const handleDocumentUploadData = (data) => {
        const list = data || [];
        const active = list.find((x) => !x.deleted);

        if (!active) {
            onChange({ ...draft, Document: null });
            setDocumentError("");
            return;
        }

        if (active.file instanceof File && !isPdfFile(active.file)) {
            setDocumentError("Only PDF files are allowed");
            return;
        }

        const documentName = active.name ?? active.file?.name ?? "";
        if (documentName.length > 500) {
            setDocumentError("Document name must be 500 characters or less");
            return;
        }

        setDocumentError("");

        const prevFile = draft.Document?.file;
        if (
            active.file instanceof File &&
            typeof prevFile === "string" &&
            prevFile.length > 0 &&
            active.name === draft.Document?.name
        ) {
            return;
        }

        onChange({
            ...draft,
            Document: { file: active.file, name: active.name, deleted: false },
        });
    };

    return (
        <div className="card border-0 shadow-sm mb-3 plan-modal-card">
            <div className="card-header bg-light border-0">
                <strong>Contract Details</strong>
            </div>
            <div className="card-body">

                {/* Row 1 — Reference + Name */}
                <div className="row align-items-start mb-0">
                    <div className="col-md-4 mb-3">
                        <InputTextComponent
                            name="ContractReference"
                            value={draft.ContractReference}
                            placeholder={<>Contract Reference <span className="required">*</span></>}
                            handleChange={handleInputChange}
                            handleOnblur={(value) => {
                                if (!String(value ?? "").trim()) setMissingContractReference(true);
                            }}
                            className={refInvalid ? "alert-danger" : ""}
                            maxLength={50}
                            disabled={readOnly}
                            readOnly={readOnly}
                        />
                    </div>
                    <div className="col-md-5 mb-3">
                        <InputTextComponent
                            name="ContractName"
                            value={draft.ContractName}
                            placeholder={<>Contract Name <span className="required">*</span></>}
                            handleChange={handleInputChange}
                            handleOnblur={(value) => {
                                if (!String(value ?? "").trim()) setMissingContractName(true);
                            }}
                            className={nameInvalid ? "alert-danger" : ""}
                            maxLength={100}
                            disabled={readOnly}
                            readOnly={readOnly}
                        />
                    </div>
                </div>

                {/* Row 2 — Dates */}
                <div className="row align-items-start mb-0">
                    <div className="col-md-2 mb-3">
                        <DateTimePickerComp
                            name="StartDate"
                            value={draft.StartDate}
                            selected={draft.StartDate}
                            onDateTimeChange={handleDateTimeChange}
                            placeholder={<>Start Date <span className="required">*</span></>}
                            invalid={startInvalid}
                            clearable
                            disabled={readOnly}
                            readOnly={readOnly}
                        />
                    </div>
                    <div className="col-md-2 mb-3">
                        <DateTimePickerComp
                            name="EndDate"
                            value={draft.EndDate}
                            selected={draft.EndDate}
                            onDateTimeChange={handleDateTimeChange}
                            placeholder={<>End Date <span className="required">*</span></>}
                            invalid={endInvalid}
                            clearable
                            disabled={readOnly}
                            readOnly={readOnly}
                        />
                    </div>
                    <div className="col-md-2 mb-3">
                        <div style={currencyInvalid ? { border: "1px solid #dc3545", borderRadius: 4 } : undefined}>
                            <SelectComp
                                name="contractCurrency"
                                value={draft.contractCurrency}
                                options={currencyOptions}
                                onChange={handleCurrencyChange}
                                placeholder={<>Contract Currency <span className="required">*</span></>}
                                clearable
                                {...selectMenuProps}
                            />
                        </div>
                    </div>
                </div>

                {/* Terms — Rich Text */}
                <div className="row">
                    <div className="col-md-9 mb-3 contract-terms-editor">
                        <small className="text-muted d-block mb-1">Contract Terms</small>
                        <ReactQuill
                            value={termsHtml}
                            onChange={handleTermsChange}
                            modules={readOnly ? { toolbar: false } : quillModules}
                            formats={quillFormats}
                            readOnly={readOnly}
                            style={{ background: "#fff" }}
                        />
                    </div>
                </div>

                {/* Remarks */}
                <div className="row">
                    <div className="col-md-9 mb-3">
                        <TextAreaComp
                            name="Remarks"
                            value={draft.Remarks}
                            onChange={handleTextareaChange}
                            placeholder="Remarks"
                            maxLength={500}
                            style={{ minHeight: "50px" }}
                        />
                    </div>
                </div>

                {/* Document upload + Active */}
                <div className="row">
                    <div className="col-md-3 mb-3">
                        <UploadFiles
                            name="Document"
                            multiple={false}
                            accept=".pdf,application/pdf"
                            data={documentUploadRows}
                            onUploadUpdateData={handleDocumentUploadData}
                        />
                        {documentError && (
                            <div className="text-danger small mt-1">{documentError}</div>
                        )}
                    </div>
                    <div className="col-md-3 mb-3 d-flex align-items-end">
                        <CheckBoxComp
                            name="Active"
                            checked={draft.Active}
                            description="Active"
                            onCheckChange={handleCheckboxChange}
                        />
                    </div>
                </div>

            </div>
        </div>
    );
}