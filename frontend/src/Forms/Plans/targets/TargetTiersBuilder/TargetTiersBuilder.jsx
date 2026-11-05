import { useMemo } from "react";

import {
    InputNumericComp,
    SelectComp,
} from "../../../../ReusableComponents";
import ContractCurrencyInput from "../../components/ContractCurrencyInput/ContractCurrencyInput";
import { conditionTypeOptions, rebateValueTypeOptions, GROWTH_COMPARISON_CAPTION } from "../../constants/planWorkspaceConstants";
import { createEmptyTier } from "../../../../utils/conditionGroups";
import { normalizeRebateValueType } from "../../../../utils/planWorkspaceValidation";
import { moneyDecimalScale, numericPropsForType, valuePlaceholderForType } from "../../utils/numericPropsForConditionType";
import {
    formatTiersBuiltLabel,
    resolveTierConditionType,
    validateTiers,
} from "../../utils/targetTierValidation";

const tierConditionTypeOptions = conditionTypeOptions.filter((o) =>
    ["S", "Q", "G"].includes(o.value)
);

const findOpt = (options, value) =>
    options.find((o) => o.value === value) || null;

export default function TargetTiersBuilder({
    tiers = [],
    tierConditionType = null,
    salesAmountCurrency = null,
    onTierConditionTypeChange,
    onSalesAmountCurrencyChange,
    onChange,
    contractCurrencyCode = "",
    selectMenuProps,
    readOnly = false,
    fieldErrors,
    validationAttempted = false,
}) {
    const rows = tiers?.length ? tiers : [];
    const effectiveType = resolveTierConditionType(tierConditionType, rows);
    const showSalesCurrency = effectiveType === "S";
    const tierTypeInvalid =
        fieldErrors?.tierConditionType
        || (validationAttempted && !effectiveType);

    const validation = useMemo(
        () => validateTiers(rows, effectiveType, salesAmountCurrency, contractCurrencyCode),
        [rows, effectiveType, salesAmountCurrency, contractCurrencyCode]
    );

    const builtLabel = useMemo(
        () => formatTiersBuiltLabel(rows, effectiveType, salesAmountCurrency, contractCurrencyCode),
        [rows, effectiveType, salesAmountCurrency, contractCurrencyCode]
    );

    const updateTiers = (next) => onChange(next);

    const updateRow = (localId, patch) => {
        updateTiers(rows.map((r) => (r.localId === localId ? { ...r, ...patch } : r)));
    };

    const addTier = () => updateTiers([...rows, createEmptyTier()]);

    const removeTier = (localId) => {
        updateTiers(rows.filter((r) => r.localId !== localId));
    };

    const renderBuiltLabel = () => {
        if (builtLabel === "-") return "-";
        if (Array.isArray(builtLabel)) {
            return builtLabel.map((line, i) => (
                <span key={i} className="tier-built-label__line d-block">
                    {line}
                </span>
            ));
        }
        return builtLabel;
    };

    return (
        <div className="target-tiers-builder">
            <small className="text-muted fw-semibold d-block mb-2">Range</small>

            <div className="row align-items-end g-2 mb-2">
                <div className="col-md-3">
                    <div style={tierTypeInvalid ? { border: "1px solid #dc3545", borderRadius: 4 } : undefined}>
                        <SelectComp
                            name="tierConditionType"
                            value={findOpt(tierConditionTypeOptions, effectiveType)}
                            options={tierConditionTypeOptions}
                            onChange={(v) => {
                                const next =
                                    (v && typeof v === "object" ? v.value : v) || null;
                                onTierConditionTypeChange?.(next);
                            }}
                            placeholder="Type"
                            clearable
                            {...selectMenuProps}
                        />
                    </div>
                </div>
                {showSalesCurrency && (
                    <div className="col-md-2">
                        <ContractCurrencyInput
                            name="salesAmountCurrency"
                            value={contractCurrencyCode}
                            placeholder="Sales amount currency"
                        />
                    </div>
                )}
            </div>

            {effectiveType === "G" && (
                <small className="text-danger d-block mb-2">{GROWTH_COMPARISON_CAPTION}</small>
            )}

            <div className="condition-built-label tier-built-label small mb-2">
                <span className="text-muted fw-semibold">Range built: </span>
                <span className="condition-built-label__text tier-built-label__text">
                    {renderBuiltLabel()}
                </span>
            </div>

            {validation.errors.map((msg) => (
                <div
                    key={msg}
                    className="alert alert-danger py-1 px-2 mb-2 small condition-group-alert"
                >
                    {msg}
                </div>
            ))}

            {validation.warnings.map((msg) => (
                <div
                    key={msg}
                    className="alert alert-warning py-1 px-2 mb-2 small condition-group-alert"
                >
                    {msg}
                </div>
            ))}

            <span className="hyperlink-text d-block mb-2" style={{ fontSize: 12 }} onClick={addTier}>
                + Add range row
            </span>

            {!rows.length && (
                <div className="text-muted small mb-2">No range rows added.</div>
            )}

            {rows.map((row) => {
                const rebateType = normalizeRebateValueType(row.rebateValueType);
                const isFixed = rebateType === "F";

                return (
                    <div key={row.localId} className="row align-items-end g-2 mb-2 plan-tier-row">
                        <div className="col-md-2">
                            <InputNumericComp
                                name={`tierVal_${row.localId}`}
                                value={row.value}
                                placeholder={valuePlaceholderForType(effectiveType)}
                                handleChange={(v) => updateRow(row.localId, { value: v })}
                                className="form-control"
                                {...numericPropsForType(effectiveType)}
                            />
                        </div>
                        <div className="col-md-2">
                            <SelectComp
                                name={`tierRebateType_${row.localId}`}
                                value={findOpt(rebateValueTypeOptions, rebateType)}
                                options={rebateValueTypeOptions}
                                onChange={(v) => {
                                    const nextType = normalizeRebateValueType(v);
                                    updateRow(row.localId, {
                                        rebateValueType: nextType,
                                        rebateValue: "",
                                        currency: nextType === "P" ? null : row.currency,
                                    });
                                }}
                                placeholder="Rebate Type"
                                {...selectMenuProps}
                            />
                        </div>
                        {isFixed && (
                            <div className="col-md-2">
                                <ContractCurrencyInput
                                    name={`tierCurrency_${row.localId}`}
                                    value={contractCurrencyCode}
                                    placeholder="Currency"
                                />
                            </div>
                        )}
                        <div className={`col-md-${isFixed ? 2 : 2}`}>
                            <InputNumericComp
                                name={`tierRebate_${row.localId}`}
                                value={row.rebateValue}
                                placeholder={isFixed ? "Rebate amount" : "Rebate %"}
                                decimalScale={isFixed ? moneyDecimalScale(contractCurrencyCode, 3) : 2}
                                handleChange={(v) => updateRow(row.localId, { rebateValue: v })}
                                className="form-control"
                                maxValue={isFixed ? 999999999999999 : 100}
                            />
                        </div>
                        <div className="col-auto pb-2">
                            <span
                                className="hyperlink-text text-danger"
                                style={{ fontSize: 11 }}
                                onClick={() => removeTier(row.localId)}
                                aria-label="Remove range row"
                            >
                                Delete
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
