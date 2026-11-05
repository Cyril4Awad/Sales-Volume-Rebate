export const getAuthBase = () => window.__APP_CONFIG__?.AUTH_BASE ?? "http://localhost:50001/api";
export const getApiBase = () => window.__APP_CONFIG__?.API_BASE ?? "http://localhost:50002/api";
export const getAuthUrlPath = () => `${getAuthBase()}/Authentication`;
export const mobileDevicesWidth = 767;
export const timeOutOnSave = 2500;
