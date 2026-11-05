import { createElement } from "react";

/** CSS class names — styled in feature CSS at max-width 766px */
export const ADV_MOBILE_LABEL = "adv-mobile-label";
export const ADV_MOBILE_VALUE = "adv-mobile-value";
export const ADV_MOBILE_ROW = "adv-mobile-row";
export const ADV_MOBILE_PLAIN = "adv-mobile-plain";
export const ADV_MOBILE_ACTIONS = "adv-mobile-actions";
export const ADV_MOBILE_HIDE = "adv-mobile-hide";

/**
 * Generic "Label: value" row. Desktop: value only. Mobile: "Label: value" left-aligned.
 */
export function mobileLabeledRow(label, value) {
    const labelText = label ? `${label}: ` : "";
    return createElement(
        "div",
        { className: ADV_MOBILE_ROW },
        createElement("span", { className: ADV_MOBILE_LABEL }, labelText),
        createElement("span", { className: ADV_MOBILE_VALUE }, value)
    );
}

/** Unlabeled line (Range header, condition header, sales combined line). */
export function mobilePlainRow(text) {
    return createElement("div", { className: ADV_MOBILE_PLAIN }, text);
}

/** Actions / Remove / checkbox rows — no label, left-aligned on mobile. */
export function mobileActionRow(children) {
    return createElement("div", { className: ADV_MOBILE_ACTIONS }, children);
}

/** Column content hidden on mobile (merged into another column). Desktop unchanged. */
export function mobileHideOnMobile(children) {
    return createElement("div", { className: ADV_MOBILE_HIDE }, children);
}

/** Wrap a column Cell: desktop shows desktopContent; mobile shows mobileContent. */
export function mobileDualCell(desktopContent, mobileContent) {
    return createElement(
        "div",
        { className: "adv-mobile-dual" },
        createElement("span", { className: "adv-mobile-dual__desktop" }, desktopContent),
        createElement("span", { className: "adv-mobile-dual__mobile" }, mobileContent)
    );
}
