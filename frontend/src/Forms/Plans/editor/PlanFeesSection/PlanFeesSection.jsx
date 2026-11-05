import {
    InputNumericComp,
    InputTextComponent,
    SelectComp,
} from "../../../../ReusableComponents";
import { newLocalId } from "../../../../utils/conditionGroups";
import ContractCurrencyInput from "../../components/ContractCurrencyInput/ContractCurrencyInput";
import { moneyDecimalScale } from "../../utils/numericPropsForConditionType";

const createEmptyFee = () => ({
    localId: newLocalId("fee"),
    typeLabel: null,
    currency: null,
    amount: "",
    settlementTypeId: null,
});

export default function PlanFeesSection({
    fees = [],
    onChange,
    contractCurrencyCode = "",
    settlementTypeOptions,
    selectMenuProps,
    validationAttempted = false,
    fieldErrorsByFee = {},
    readOnly = false,
}) {
    const rows = fees?.length ? fees : [];

    const updateFees = (next) => onChange(next);

    const updateRow = (localId, patch) => {
        updateFees(rows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
    };

    const addFee = () => updateFees([...rows, createEmptyFee()]);

    const removeFee = (localId) => {
        updateFees(rows.filter((r) => r.localId !== localId));
    };

    const handleRowChange = (localId) => (value, name) => {
        updateRow(localId, { [name]: value });
    };

    return (
        <div className="plan-fees-section">
            {!readOnly && (
                <span className="hyperlink-text d-block mb-2" style={{ fontSize: 12 }} onClick={addFee}>
                    + Add Fee
                </span>
            )}
            {!rows.length && (
                <div className="text-muted small mb-2">No fees added.</div>
            )}
            {rows.map((row) => {
                const rowErrors = fieldErrorsByFee[row.localId] ?? {};
                const invalid = (field) => validationAttempted && rowErrors[field];

                return (
                    <div key={row.localId} className="row align-items-end g-2 mb-3 plan-fee-row">
                        <div className="col-md-2">
                            <InputTextComponent
                                name="typeLabel"
                                value={row.typeLabel ?? ""}
                                placeholder={<>Type <span className="required">*</span></>}
                                handleChange={handleRowChange(row.localId)}
                                maxLength={100}
                                className={invalid("typeLabel") ? "alert-danger" : ""}
                                disabled={readOnly}
                                readOnly={readOnly}
                            />
                        </div>
                        <div className="col-md-2">
                            <ContractCurrencyInput
                                name="currency"
                                value={contractCurrencyCode}
                                placeholder={<>Currency <span className="required">*</span></>}
                                invalid={invalid("currency")}
                            />
                        </div>
                        <div className="col-md-2">
                            <InputNumericComp
                                name="amount"
                                value={row.amount}
                                placeholder={<>Amount <span className="required">*</span></>}
                                decimalScale={moneyDecimalScale(contractCurrencyCode, 3)}
                                maxValue={999999999999999}
                                handleChange={handleRowChange(row.localId)}
                                className={`form-control${invalid("amount") ? " alert-danger" : ""}`}
                                disabled={readOnly}
                                readOnly={readOnly}
                            />
                        </div>
                        <div className="col-md-2">
                            <div style={invalid("settlementTypeId") ? { border: "1px solid #dc3545", borderRadius: 4 } : undefined}>
                                <SelectComp
                                    name="settlementTypeId"
                                    value={row.settlementTypeId}
                                    options={settlementTypeOptions}
                                    onChange={handleRowChange(row.localId)}
                                    placeholder={<>Settlement Type <span className="required">*</span></>}
                                    clearable
                                    {...selectMenuProps}
                                />
                            </div>
                        </div>
                        <div className="col-auto pb-2">
                            {!readOnly && (
                                <span
                                    className="hyperlink-text text-danger"
                                    style={{ fontSize: 11 }}
                                    onClick={() => removeFee(row.localId)}
                                    aria-label="Remove fee"
                                >
                                    Delete
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
