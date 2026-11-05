import axios from "axios";
import { getApiBase } from "../globals";

export const getComCurrencyApi = () => `${getApiBase()}/Com_Currency`;

function getProp(obj, key) {
    if (!obj || typeof obj !== "object") return undefined;
    const match = Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
    return match !== undefined ? obj[match] : undefined;
}

/** Maps one API currency row to SelectComp shape { value, label } (code as value/label). */
export function mapCurrencyApiRowToSelectOption(row) {
    const raw = getProp(row, "Cur_Code");
    const code = String(raw ?? "").trim().toUpperCase();
    if (!code) return null;
    return { value: code, label: code };
}

export function mapCurrencyListToSelectOptions(list) {
    if (!Array.isArray(list)) return [];
    return list.map(mapCurrencyApiRowToSelectOption).filter(Boolean);
}

/**
 * GET /api/Com_Currency — default axios instance (request interceptor adds Bearer from localStorage).
 */
export async function fetchCurrencySelectOptions() {
    const res = await axios.get(getComCurrencyApi());
    const body = res?.data;
    const list = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : [];
    return mapCurrencyListToSelectOptions(list);
}
