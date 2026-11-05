import PhoneInput from "react-phone-input-2";
import 'react-phone-input-2/lib/style.css'

export default function PhoneNumberComponent({ handleChange, value, name, placeholder, country, className, inputClass, buttonClass, style }) {
    // const rawValue = value;
    // const displayValue = rawValue === null || rawValue === undefined ? '' : String(rawValue);
    // const isFloating = displayValue.length > 0;

    return (
        <div className={`floating-label-wrapper`}>
            <PhoneInput
                value={value}
                name={name}
                // placeholder={placeholder}
                country={country}
                onChange={handleChange}
                defaultMask={".. ... ... ..."}
                className={className}
                inputClass={inputClass}
                buttonClass={buttonClass}
            />
            <label className={`floating-label  floating-label--active`}>
                {placeholder}
            </label>
        </div>
    )
}
