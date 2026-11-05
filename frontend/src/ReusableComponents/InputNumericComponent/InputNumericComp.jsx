import React, { Component } from 'react';
import { isEqual } from "lodash";
import NumberFormat from "react-number-format";
import './inputNumericComp.css'

class InputNumericComp extends Component {

    shouldComponentUpdate(nextProps) {
        if (!isEqual(this.props, nextProps)) {
            return true;
        } else {
            return false
        }
    }

    render() {
        const rawValue = this.props.value;
        const displayValue = rawValue === null || rawValue === undefined ? '' : String(rawValue);
        const isFloating = displayValue.length > 0;

        return (
            <div className={`floating-label-wrapper`}>
                <NumberFormat
                    id={this.props.id}
                    thousandSeparator={this.props.thousandSeparator ? true : false}
                    suffix={this.props.suffix ? this.props.suffix : ""}
                    name={this.props.name}
                    className={`form-control  ${this.props.className}`}
                    style={this.props.style}
                    value={this.props.value}
                    format={this.props.format ? this.props.format : null}
                    decimalScale={
                        this.props.noDecimal
                            ? 0
                            : (this.props.decimalScale ? this.props.decimalScale : undefined)
                    }
                    isAllowed={(values) => {
                        const { formattedValue, floatValue } = values;
                        if (formattedValue === "") return true;

                        const hasMax = this.props.maxValue !== undefined && this.props.maxValue !== null && this.props.maxValue !== "";
                        const hasMin = this.props.minValue !== undefined && this.props.minValue !== null && this.props.minValue !== "";

                        if (hasMax && floatValue > parseFloat(this.props.maxValue)) return false;
                        if (hasMin && floatValue < parseFloat(this.props.minValue)) return false;
                        return true;
                    }}
                    maxLength={this.props.maxLength ? this.props.maxLength : null}
                    allowNegative={this.props.allowNegative ? true : false}
                    onValueChange={(value) => {
                        value = this.props.noDecimal ? value.value.replace(".", "") : value.value;
                        this.props.handleChange(value, this.props.name, this.props.id);
                    }}
                    readOnly={this.props.readOnly ? true : false}
                    disabled={this.props.disabled ? true : false}
                    onBlur={() => this.props.onBlur ? this.props.onBlur(this.props.value, this.props.name) : undefined}
                    allowLeadingZeros={this.props.allowLeadingZeros ? true : false}
                />
                <label className={`floating-label ${isFloating ? 'floating-label--active' : ''}`}>
                    {this.props.placeholder} {this.props.placeHolderIconClass && <i onClick={this.props.onPlaceHolderIconClick} className={this.props.placeHolderIconClass} style={{ ...this.props.placeHolderIconStyle, pointerEvents: 'auto', cursor: 'pointer' }}></i>}
                </label>
            </div>
        );
    }
}

export default InputNumericComp;
