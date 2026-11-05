import moment from "moment";
import { isEqual } from "lodash";
import { getApiBase } from "../globals";

export const getContractsApi = () => `${getApiBase()}/CVRContracts`;
export const getContractClientsApi = () => `${getApiBase()}/CVRContractClients`;
export const getClientsApi = () => `${getApiBase()}/Clients`;
export const getClientsLookupApi = () => `${getClientsApi()}/lookup`;
export const CLIENT_PICKER_PAGE_SIZE = 50;
export const PICKER_SEARCH_DEBOUNCE_MS = 400;
export const CONTRACT_DOCUMENT_MIME = "application/pdf";

export const emptyContractForm = () => ({
    ContractID: null,
    ClientID: null,
    ContractReference: "",
    ContractName: "",
    StartDate: null,
    EndDate: null,
    Terms: null,
    Remarks: null,
    Active: true,
    Document: null,
    SubClients: [],
    contractCurrency: null,
    _isNew: false,
});

export const getProp = (obj, key) => {
    const match = Object.keys(obj || {}).find(
        (k) => k.toLowerCase() === key.toLowerCase()
    );
    return match !== undefined ? obj[match] : undefined;
};

const MAX_SAFE_FILENAME_LEN = 220;

const isHttpUrl = (s) => typeof s === "string" && /^https?:\/\//i.test(s.trim());
const nameFromDataUrl = (s) => {
    const m = String(s).trim().match(/^data:[^;]+;name=([^;,]+)[;,]/i);
    if (!m) return null;
    try { return decodeURIComponent(m[1]); } catch { return m[1]; }
};
const isDataUrl = (s) => typeof s === "string" && /^data:/i.test(s.trim());

export const dataUrlToFile = (dataUrl, filename) => {
    const [, b64] = dataUrl.split(",");
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], filename, { type: CONTRACT_DOCUMENT_MIME });
};

const looksLikeSafeFilename = (name) => {
    if (name == null || typeof name !== "string") return false;
    const t = name.trim();
    if (t.length < 2 || t.length > MAX_SAFE_FILENAME_LEN) return false;
    if (t.includes(";base64,") || /^data:/i.test(t)) return false;
    const dot = t.lastIndexOf(".");
    if (dot <= 0 || dot === t.length - 1) return false;
    const ext = t.slice(dot + 1);
    if (ext.length > 12 || !/^[a-z0-9]+$/i.test(ext)) return false;
    return true;
};

const looksLikeSafeServerDocumentName = (name) => {
    if (name == null || typeof name !== "string") return false;
    const t = name.trim();
    if (t.length < 1 || t.length > MAX_SAFE_FILENAME_LEN) return false;
    if (t.includes(";base64,") || /^data:/i.test(t)) return false;
    if (/[/\\]/.test(t) || t.includes("..")) return false;
    if (/[\x00-\x1f]/.test(t)) return false;
    if (t === "." || t === "..") return false;
    return true;
};

const compactBase64Payload = (s) => String(s).trim().replace(/\s/g, "");

const isLikelyRawBase64 = (s) => {
    const c = compactBase64Payload(s);
    if (c.length < 48) return false;
    return /^[A-Za-z0-9+/]+=*$/.test(c);
};

const normalizeDocumentFileValue = (fileVal) => {
    if (fileVal == null || typeof fileVal !== "string") return fileVal;
    const trimmed = fileVal.trim();
    if (trimmed === "") return trimmed;
    if (isDataUrl(trimmed) || isHttpUrl(trimmed)) return trimmed;
    if (!isLikelyRawBase64(trimmed)) return trimmed;
    return `data:${CONTRACT_DOCUMENT_MIME};base64,${compactBase64Payload(trimmed)}`;
};

const defaultContractDocumentName = (apiName) => {
    if (looksLikeSafeFilename(apiName)) return apiName.trim();
    if (looksLikeSafeServerDocumentName(apiName)) {
        const t = apiName.trim();
        if (/\.pdf$/i.test(t)) return t;
        return `${t}.pdf`;
    }
    return "Contract-Document.pdf";
};

const displayNameForContractDocument = (apiName, normalizedFileVal) => {
    if (looksLikeSafeFilename(apiName)) return apiName.trim();
    if (looksLikeSafeServerDocumentName(apiName)) return defaultContractDocumentName(apiName);
    if (typeof normalizedFileVal !== "string") return "Contract-Document.pdf";
    const t = normalizedFileVal.trim();
    if (isDataUrl(t)) {
        const embedded = nameFromDataUrl(t);
        if (embedded && (looksLikeSafeFilename(embedded) || looksLikeSafeServerDocumentName(embedded)))
            return defaultContractDocumentName(embedded);
        return "Contract-Document.pdf";
    }
    if (isHttpUrl(t)) {
        const seg = t.split(/[/\\]/).pop();
        if (looksLikeSafeFilename(seg) || looksLikeSafeServerDocumentName(seg))
            return defaultContractDocumentName(seg);
    }
    if (isLikelyRawBase64(t)) return "Contract-Document.pdf";
    const seg = t.split(/[/\\]/).pop() ?? "";
    if (looksLikeSafeFilename(seg) || looksLikeSafeServerDocumentName(seg))
        return defaultContractDocumentName(seg);
    return "Contract-Document.pdf";
};

export const normalizeDocumentForUpload = (doc) => {
    if (!doc) return null;
    if (doc.file !== undefined) {
        const f = doc.file;
        const nm = looksLikeSafeFilename(doc.name) || looksLikeSafeServerDocumentName(doc.name)
            ? doc.name.trim()
            : (f instanceof File
                ? (f.name || "Document")
                : displayNameForContractDocument(doc.name, f));
        return { file: f, name: nm || "Document", deleted: !!doc.deleted };
    }
    if (doc instanceof File) {
        return { file: doc, name: doc.name, deleted: false };
    }
    return null;
};

const mapDocumentFromContract = (contract) => {
    const url =
        getProp(contract, "CTR_DocumentUrl") ??
        getProp(contract, "CTR_DocumentPath") ??
        getProp(contract, "DocumentUrl") ??
        getProp(contract, "DocumentPath") ??
        getProp(contract, "CTR_Document") ??
        getProp(contract, "Document");
    const name =
        getProp(contract, "CTR_DocumentName") ??
        getProp(contract, "CTR_DocumentFileName") ??
        getProp(contract, "DocumentName") ??
        getProp(contract, "CTR_FileName") ??
        getProp(contract, "FileName");
    if (!url && !name) return null;
    if (!url) return null;
    const fileVal = typeof url === "string" ? url : String(url);
    const normalizedFile = normalizeDocumentFileValue(fileVal);
    const disp = displayNameForContractDocument(name, normalizedFile);
    return { file: normalizedFile, name: disp, deleted: false };
};

export const normalizeContractRef = (v) => (v ?? "").trim().toLowerCase();

const documentDescriptorForCompare = (doc) => {
    if (!doc) return { kind: "none" };
    if (doc.deleted) return { kind: "cleared" };
    const f = doc.file;
    if (f instanceof File) return { kind: "new", name: f.name ?? "" };
    if (typeof f === "string" && String(f).trim().length > 0) {
        return { kind: "existing", ref: String(f) };
    }
    return { kind: "none" };
};

const subClientIdsForCompare = (subClients) =>
    (subClients ?? [])
        .map((sc) => {
            const cid = sc?.ClientID;
            if (cid && typeof cid === "object" && "value" in cid) return cid.value;
            return cid;
        })
        .filter((v) => v != null && v !== "");

export const snapshotContractForCompare = (row) => ({
    clientId: row.ClientID?.value ?? null,
    contractReference: normalizeContractRef(row.ContractReference),
    contractName: (row.ContractName ?? "").trim(),
    startDate: row.StartDate ? moment(row.StartDate).format("YYYY-MM-DD") : "",
    endDate: row.EndDate ? moment(row.EndDate).format("YYYY-MM-DD") : "",
    terms: row.Terms ?? null,
    remarks: row.Remarks ?? null,
    active: !!row.Active,
    contractCurrency: String(row.contractCurrency?.value ?? row.contractCurrency ?? "").trim().toUpperCase(),
    document: documentDescriptorForCompare(row.Document),
    subClientIds: subClientIdsForCompare(row.SubClients),
});

export const contractsHaveUnsavedWork = (items, original, deletedItems) => {
    if (deletedItems.length > 0) return true;
    if (items.some((r) => r._isNew)) return true;
    const origById = new Map((original ?? []).map((o) => [o.ContractID, o]));
    for (const row of items) {
        if (row._isNew) continue;
        const baseline = origById.get(row.ContractID);
        if (!baseline) return true;
        if (!isEqual(snapshotContractForCompare(row), snapshotContractForCompare(baseline))) {
            return true;
        }
    }
    return false;
};

export const isPersistedContractClientId = (id) => {
    if (id == null) return false;
    if (typeof id === "number" && Number.isFinite(id)) return true;
    if (typeof id === "string" && !String(id).startsWith("new_")) {
        const n = Number(id);
        return Number.isFinite(n) && n > 0;
    }
    return false;
};

export const normalizeContractClientId = (id) => {
    if (typeof id === "number") return id;
    const n = Number(id);
    return Number.isFinite(n) ? n : id;
};

export const subClientClientIdValue = (sc) => {
    const cid = sc?.ClientID;
    if (cid && typeof cid === "object" && "value" in cid) return cid.value;
    return cid;
};

export const normalizeClientIdValue = (v) => {
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
};

export const isSameClientId = (a, b) => {
    const na = normalizeClientIdValue(a);
    const nb = normalizeClientIdValue(b);
    if (na == null || nb == null) return false;
    return na === nb;
};

export const mergeSubClientsSelection = (prev, selectedClients) => {
    const mainVal = normalizeClientIdValue(prev.ClientID?.value);
    const existing = new Set(
        prev.SubClients.map((x) => normalizeClientIdValue(x.ClientID?.value)).filter(
            (v) => v != null
        )
    );
    const next = [...prev.SubClients];
    let addedCount = 0;

    for (const opt of selectedClients) {
        const clientId = normalizeClientIdValue(opt?.value);
        if (clientId == null) continue;
        if (isSameClientId(clientId, mainVal)) continue;
        if (existing.has(clientId)) continue;

        existing.add(clientId);
        next.push({
            ContractClientID: `new_${Date.now()}_${clientId}_${Math.random()
                .toString(36)
                .slice(2, 7)}`,
            ClientID: { ...opt, value: clientId },
            _isNew: true,
        });
        addedCount += 1;
    }

    return { next, addedCount };
};

const buildContractClientPayload = (contractId, sc) => ({
    ContractID: Number(contractId),
    ClientID: subClientClientIdValue(sc),
});

const subClientsSnapshotForSync = (subClients) =>
    (subClients ?? [])
        .map((sc) => ({
            id: isPersistedContractClientId(sc.ContractClientID)
                ? normalizeContractClientId(sc.ContractClientID)
                : `new:${subClientClientIdValue(sc)}`,
            clientId: subClientClientIdValue(sc),
        }))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)));

export const contractRowChangedFromBaseline = (row, baseline) => {
    if (!baseline) return true;
    return !isEqual(snapshotContractForCompare(row), snapshotContractForCompare(baseline));
};

export const subClientsChangedFromBaseline = (row, baseline) => {
    if (row._isNew || !baseline) return true;
    return !isEqual(
        subClientsSnapshotForSync(row.SubClients),
        subClientsSnapshotForSync(baseline.SubClients)
    );
};

export const syncSubClientsForContract = async (authAxios, contractId, row, baseline) => {
    const current = row.SubClients ?? [];
    const baseSubClients = baseline?.SubClients ?? [];

    const currentPersistedIds = new Set(
        current
            .filter((sc) => isPersistedContractClientId(sc.ContractClientID))
            .map((sc) => normalizeContractClientId(sc.ContractClientID))
    );

    const baselinePersisted = baseSubClients.filter((sc) =>
        isPersistedContractClientId(sc.ContractClientID)
    );

    const toDelete = baselinePersisted.filter(
        (sc) => !currentPersistedIds.has(normalizeContractClientId(sc.ContractClientID))
    );

    const toInsert = current.filter(
        (sc) => !isPersistedContractClientId(sc.ContractClientID)
    );

    const toUpdate = current.filter((sc) => {
        if (!isPersistedContractClientId(sc.ContractClientID)) return false;
        const id = normalizeContractClientId(sc.ContractClientID);
        const base = baselinePersisted.find(
            (b) => normalizeContractClientId(b.ContractClientID) === id
        );
        if (!base) return false;
        return subClientClientIdValue(sc) !== subClientClientIdValue(base);
    });

    await Promise.all([
        ...toDelete.map((sc) =>
            authAxios.delete(
                `${getContractClientsApi()}/${normalizeContractClientId(sc.ContractClientID)}`
            )
        ),
        ...toInsert.map((sc) =>
            authAxios.post(getContractClientsApi(), buildContractClientPayload(contractId, sc))
        ),
        ...toUpdate.map((sc) =>
            authAxios.put(
                `${getContractClientsApi()}/${normalizeContractClientId(sc.ContractClientID)}`,
                buildContractClientPayload(contractId, sc)
            )
        ),
    ]);
};

export const normalizePagedClientsResponse = (data) => {
    if (Array.isArray(data)) {
        return { items: data, totalCount: data.length };
    }
    const items = data?.items ?? data?.Items ?? [];
    const totalCount = Number(data?.totalCount ?? data?.TotalCount ?? 0);
    return {
        items,
        totalCount: Number.isFinite(totalCount) ? totalCount : 0,
    };
};

export const buildClientCodeNo = (codeRaw, noRaw, fallbackId) => {
    const code =
        codeRaw != null && String(codeRaw).trim().length
            ? String(codeRaw).trim()
            : String(fallbackId);
    const no = noRaw != null ? String(noRaw).trim() : "";
    return no.length ? `${code}/${no}` : code;
};

export const mapLookupRowToOption = (row) => {
    const id = Number(getProp(row, "ClientID"));
    const codeRaw = getProp(row, "ClientCode");
    const noRaw = getProp(row, "ClientNo") ?? getProp(row, "cl_no");
    const code = buildClientCodeNo(codeRaw, noRaw, id);
    return {
        value: id,
        label: getProp(row, "ClientName") ?? "",
        code,
    };
};

export const mapApiClientDtoToPickerRow = (c) => {
    const id = Number(
        getProp(c, "ClientID") ?? getProp(c, "ClRecId") ?? getProp(c, "CL_RecID")
    );
    const codeRaw = getProp(c, "ClientCode") ?? getProp(c, "Code") ?? "";
    const noRaw = getProp(c, "ClientNo") ?? getProp(c, "cl_no") ?? "";
    const codeNo = buildClientCodeNo(codeRaw, noRaw, id);

    return {
        clRecId:    id,
        value:      id,
        label:      getProp(c, "ClientName") ?? "",
        code:       codeNo,           
        clientCode: codeNo,
        clientName: getProp(c, "ClientName") ?? "",
        ae:         getProp(c, "AE")         ?? "",
        mof:        getProp(c, "MOF")        ?? "",
        address:    getProp(c, "Address")    ?? "",
        phone1:     getProp(c, "Phone1")     ?? "",
        phone2:     getProp(c, "Phone2")     ?? "",
        categ:      getProp(c, "Categ")      ?? "",
        clientType: getProp(c, "ClientType") ?? "",
    };
};
const placeholderClientOption = (clientId) => ({
    value: clientId,
    label: "",
    code: String(clientId),
});

export function upsertContractInRecords(records, contractDraft) {
    if (!contractDraft) return records ?? [];
    const ref = (contractDraft.ContractReference ?? "").trim();
    const name = (contractDraft.ContractName ?? "").trim();
    if (!ref && !name) return records ?? [];

    const copy = JSON.parse(JSON.stringify(contractDraft));
    const list = [...(records ?? [])];
    const id = copy.ContractID;
    if (id == null) return list;
    if (String(id).startsWith("new_")) return list;

    const idx = list.findIndex((c) => String(c.ContractID) === String(id));
    if (idx >= 0) {
        list[idx] = copy;
    } else {
        list.push(copy);
    }
    return list;
}

export function mergeContractRecordsForValidation(contractRecords = [], planRecords = []) {
    const byKey = new Map();

    (contractRecords ?? []).forEach((row) => {
        if (row?.ContractID == null) return;
        byKey.set(String(row.ContractID), row);
    });

    (planRecords ?? []).forEach((plan) => {
        const cd = plan?.contractDraft;
        if (!cd) return;
        const ref = (cd.ContractReference ?? "").trim();
        if (!ref) return;

        const id = cd.ContractID;
        if (id == null) return;

        const key = String(id);
        if (byKey.has(key)) return;

        const copy = JSON.parse(JSON.stringify(cd));
        byKey.set(key, copy);
    });

    return [...byKey.values()];
}

export const fetchAndMapContracts = async (authAxios) => {
    const [contractsRes, contractClientsRes] = await Promise.all([
        authAxios.get(getContractsApi()),
        authAxios.get(getContractClientsApi()),
    ]);

    const idSet = new Set();
    (contractsRes.data || []).forEach((contract) => {
        const mid = Number(getProp(contract, "CTR_ClientID"));
        if (Number.isFinite(mid) && mid > 0) idSet.add(mid);
    });
    (contractClientsRes.data || []).forEach((row) => {
        const cid = Number(getProp(row, "CTC_ClientID"));
        if (Number.isFinite(cid) && cid > 0) idSet.add(cid);
    });
    const uniqueIds = [...idSet];

    let labelMap = {};
    if (uniqueIds.length > 0) {
        const lr = await authAxios.post(getClientsLookupApi(), { ids: uniqueIds });
        const rows = Array.isArray(lr.data) ? lr.data : [];
        rows.forEach((row) => {
            const o = mapLookupRowToOption(row);
            if (Number.isFinite(o.value) && o.value > 0) {
                labelMap[o.value] = o;
            }
        });
    }

    const optionForId = (clientId) =>
        labelMap[clientId] ?? placeholderClientOption(clientId);

    const groupedSubClients = {};

    (contractClientsRes.data || []).forEach((row) => {
        const contractId = Number(getProp(row, "CTC_ContractID"));
        const clientId = Number(getProp(row, "CTC_ClientID"));
        const option = optionForId(clientId);

        if (!groupedSubClients[contractId]) {
            groupedSubClients[contractId] = [];
        }

        groupedSubClients[contractId].push({
            ContractClientID: getProp(row, "CTC_ContractClientID"),
            ClientID: option,
            _isNew: false,
        });
    });

    const mappedContracts = (contractsRes.data || []).map((contract) => {
        const contractId = Number(getProp(contract, "CTR_ContractID"));
        const mainClientId = Number(getProp(contract, "CTR_ClientID"));

        return {
            ContractID: contractId,
            ClientID: optionForId(mainClientId),
            ContractReference: getProp(contract, "CTR_ContractReference") ?? "",
            ContractName: getProp(contract, "CTR_ContractName") ?? "",
            StartDate: getProp(contract, "CTR_StartDate") ?? null,
            EndDate: getProp(contract, "CTR_EndDate") ?? null,
            Terms: getProp(contract, "CTR_Terms") ?? null,
            Remarks: getProp(contract, "CTR_Remarks") ?? null,
            Active: getProp(contract, "CTR_Active") ?? false,
            contractCurrency: getProp(contract, "CTR_ContractCurrency") ?? null,
            Document: mapDocumentFromContract(contract),
            SubClients: groupedSubClients[contractId] ?? [],
            _isNew: false,
        };
    });

    return { mappedContracts, labelMap };
};

export const buildContractPayload = (row) => {
    const fd = new FormData();
    fd.append("ClientID", row.ClientID?.value ?? "");
    fd.append("ContractReference", row.ContractReference ?? "");
    fd.append("ContractName", row.ContractName ?? "");
    if (row.StartDate) fd.append("StartDate", moment(row.StartDate).format("YYYY-MM-DD"));
    if (row.EndDate) fd.append("EndDate", moment(row.EndDate).format("YYYY-MM-DD"));
    const terms = row.Terms?.trim() || null;
    const remarks = row.Remarks?.trim() || null;
    if (terms != null) fd.append("Terms", terms);
    if (remarks != null) fd.append("Remarks", remarks);
    fd.append("Active", row.Active);
    const currencyCode = row.contractCurrency?.value ?? row.contractCurrency ?? "";
    if (currencyCode) {
        fd.append("ContractCurrency", String(currencyCode).trim().toUpperCase());
    }

    const doc = row.Document;
    if (doc?.file instanceof File) {
        fd.append("Document", doc.file);
    } else if (!row._isNew && (doc === null || doc?.deleted)) {
        fd.append("DeleteDocument", "true");
    }
    return fd;
};

export const documentUploadRowsFromDraft = (document) => {
    const d = normalizeDocumentForUpload(document);
    if (!d) return [];
    if (typeof d.file === "string" && isDataUrl(d.file)) {
        try {
            return [{ ...d, file: dataUrlToFile(d.file, d.name) }];
        } catch {
            return [d];
        }
    }
    return [d];
};
