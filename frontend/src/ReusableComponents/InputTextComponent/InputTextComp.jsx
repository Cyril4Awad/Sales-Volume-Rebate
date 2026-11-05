import React, { Component } from 'react';
import './inputTextComp.css'

class InputTextComp extends Component {

    shouldComponentUpdate(nextProps) {
        return (
            this.props.value !== nextProps.value ||
            this.props.disabled !== nextProps.disabled ||
            this.props.readOnly !== nextProps.readOnly ||
            this.props.className !== nextProps.className ||
            this.props.placeholder !== nextProps.placeholder
        );
    }


    _setinputRef = (ref) => {
        this._inputRef = ref;
    }
    focus = () => {
        if (this._inputRef) {
            return this._inputRef.focus();
        }
    }
    handleSearchClick = () => {
        if (this.props.onSearchClick) {
            this.props.onSearchClick(this.props.value || '', this.props.name);
        }
    }

    render() {
        // Normalize to string so numbers (e.g., 29) render and float label correctly
        const rawValue = this.props.value;
        const displayValue = rawValue === null || rawValue === undefined ? '' : String(rawValue);
        const isFloating = displayValue.length > 0;
        const hasSearchIcon = this.props.showSearchIcon;


        return (
            <div className={`floating-label-wrapper ${hasSearchIcon ? 'input-with-search-wrapper' : ''}`}>
                <input
                    dir={this.props.dir}
                    ref={this._setinputRef}
                    id={this.props.id}
                    type={this.props.type || "text"}
                    name={this.props.name}
                    style={this.props.style}
                    className={`floating-label-input ${this.props.className || ''} ${hasSearchIcon ? 'input-with-search-icon' : ''}`}
                    value={displayValue}
                    onChange={(e) => {
                        const { value, id } = e.target;
                        const processedValue = this.props.removeSpaces ? value.replace(" ", "") : value;
                        this.props.handleChange(processedValue, this.props.name, id ? id : "");
                        if (this.props.PagingChanges) {
                            this.props.PagingChanges(value);
                        }
                    }}
                    onBlur={(e) => {
                        const trimmedValue = e.target.value.trim();
                        this.props.handleOnblur && this.props.handleOnblur(trimmedValue, this.props.name);
                    }}
                    placeholder=""
                    readOnly={this.props.readOnly}
                    disabled={this.props.disabled}
                    onFocus={this.props.onFocus}
                    onKeyDown={this.props.onKeyDown}
                    maxLength={this.props.maxLength}
                />
                <label className={`floating-label ${isFloating ? 'floating-label--active' : ''}`}>
                    {this.props.placeholder} {this.props.placeHolderIconClass && <i onClick={this.props.onPlaceHolderIconClick} className={this.props.placeHolderIconClass} style={{ ...this.props.placeHolderIconStyle, pointerEvents: 'auto', cursor: 'pointer' }}></i>}
                </label>
                {hasSearchIcon && (
                    <i
                        className="fa fa-search input-search-icon"
                        onClick={() => {
                            if (this.props.onSearchClick) {
                                this.props.onSearchClick(this.props.value || '', this.props.name);
                            }
                        }}
                        style={{ cursor: this.props.onSearchClick ? 'pointer' : 'default' }}
                    />
                )}
            </div>
        );
    }
}

export default InputTextComp;
