import { InputTextComponent } from "../../../../ReusableComponents";

export default function ContractCurrencyInput({
    value = "",
    name = "currency",
    placeholder = "Currency",
    className = "",
    invalid = false,
}) {
    return (
        <InputTextComponent
            name={name}
            value={value ?? ""}
            placeholder={placeholder}
            handleChange={() => {}}
            disabled
            readOnly
            className={invalid ? `alert-danger ${className}`.trim() : className}
        />
    );
}
