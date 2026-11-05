import { useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    AdvancedTable, CheckBoxComp, InputTextComponent,
    TextAreaComp, Notification, InputNumericComp,
} from "../../../ReusableComponents";
import { AuthContext } from "../../../ContextProvider/AuthContext";
import { getApiBase } from "../../../globals";
import { triggerSessionExpired } from "../../../utils/sessionExpired";
import { updateTokenFromResponse } from "../../../utils/updateTokenFromResponse";
import useUnsavedChangesBlocker from "../../../CustomHooks/useUnsavedChangesBlocker";
import "../../Plans/editor/PlanEditorModal/PlanEditorModal.css";
import "../definitions.css";
import exportTableToExcel from "../../../utils/exportTableToExcel";
import {
    mobileDualCell,
    mobileLabeledRow,
    mobileActionRow,
} from "../../../utils/mobileTableCells";

const API = `${getApiBase()}/CVRSettlementTypes`;

const PERIOD_LENGTH_MIN = 1;
const PERIOD_LENGTH_MAX = 12;
const SHOW_IS_CUSTOM = false;

const isPeriodLengthInvalid = (value) => {
    if (value === "" || value == null) return "required";
    const n = Number(value);
    if (Number.isNaN(n) || n < PERIOD_LENGTH_MIN) return "min";
    if (n > PERIOD_LENGTH_MAX) return "max";
    return null;
};

const validateRowPeriodLength = (row, nameField) => {
    const issue = isPeriodLengthInvalid(row.PeriodLength);
    if (issue === "required") {
        return `${row[nameField] || "Row"}: Period Length is required`;
    }
    if (issue === "min") {
        return `${row[nameField] || "Row"}: Period Length must be at least ${PERIOD_LENGTH_MIN} month`;
    }
    if (issue === "max") {
        return `${row[nameField] || "Row"}: Period Length cannot exceed ${PERIOD_LENGTH_MAX} months`;
    }
    return null;
};

const emptyForm = {
    SettlementTypeID: null,
    SettlementTypeName: "",
    PeriodLength: "",
    IsCustom: false,
    Remarks: null,
    Active: true,
    _isNew: false,
};

const getProp = (obj, key) => {
    const match = Object.keys(obj).find(k => k.toLowerCase() === key.toLowerCase());
    return match !== undefined ? obj[match] : undefined;
};

const mapFromServer = (x) => ({
    SettlementTypeID: getProp(x, "STT_SettlementTypeID"),
    SettlementTypeName: getProp(x, "STT_SettlementTypeName") ?? "",
    PeriodLength: getProp(x, "STT_PeriodLength") ?? 0,
    IsCustom: getProp(x, "STT_IsCustom") ?? false,
    Remarks: getProp(x, "STT_Remarks") ?? null,
    Active: getProp(x, "STT_Active") ?? false,
    _isNew: false,
});

const normRemarks = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

const rowChanged = (o, c) =>
    o.SettlementTypeName !== c.SettlementTypeName ||
    Number(o.PeriodLength) !== Number(c.PeriodLength) ||
    !!o.IsCustom !== !!c.IsCustom ||
    normRemarks(o.Remarks) !== normRemarks(c.Remarks) ||
    !!o.Active !== !!c.Active;

export default function SettlementTypeDefinition() {

    const { userData } = useContext(AuthContext);
    const authAxios = useMemo(() => {
        const instance = axios.create({
            headers: { Authorization: userData?.token ? `Bearer ${userData.token}` : "" },
        });
        instance.interceptors.request.use((config) => {
            const token = localStorage.getItem("token");
            if (token) config.headers.Authorization = `Bearer ${token}`;
            return config;
        });
        instance.interceptors.response.use(
            (response) => {
                updateTokenFromResponse(response);
                return response;
            },
            (error) => {
                if (error?.response?.status === 401) {
                    triggerSessionExpired();
                    return Promise.reject(error);
                }
                return Promise.reject(error);
            }
        );
        return instance;
    }, [userData]);

    const [items, setItems] = useState([]);
    const [original, setOriginal] = useState([]);
    const [formData, setFormData] = useState(emptyForm);
    const [isEditing, setIsEditing] = useState(false);
    const [notification, setNotification] = useState({ type: "", title: "", message: "", display: "none" });
    const [missingSettlementTypeName, setMissingSettlementTypeName] = useState(false);
    const [missingPeriodLength, setMissingPeriodLength] = useState(false);
    const notificationTimerRef = useRef(null);

    const isDirty = useMemo(() => {
        const toInsert = items.filter((r) => r._isNew);
        const toUpdate = items.filter((r) => {
            if (r._isNew) return false;
            const o = original.find((x) => x.SettlementTypeID === r.SettlementTypeID);
            return o && rowChanged(o, r);
        });
        const toDelete = original.filter((o) => !items.find((r) => r.SettlementTypeID === o.SettlementTypeID));
        return toInsert.length > 0 || toUpdate.length > 0 || toDelete.length > 0;
    }, [items, original]);

    const { discardModal } = useUnsavedChangesBlocker(isDirty);

    useEffect(() => {
        return () => {
            if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
        };
    }, []);

    const showNotification = (type, title, message = "") => {
        setNotification({ type, title, message, display: "block" });
        if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
        notificationTimerRef.current = setTimeout(() =>
            setNotification((p) => ({ ...p, display: "none" })), 3000);
    };

    const loadData = async () => {
        try {
            const res = await authAxios.get(API);
            const mapped = res.data.map(mapFromServer);
            setItems(mapped);
            setOriginal(mapped);
        } catch (err) {
            showNotification("error", " Load failed", err.message);
        }
    };

    useEffect(() => {
        loadData();
    }, [authAxios]);

    const handleInputChange = (value, name) => {
        if (name === "PeriodLength" && Number(value) < PERIOD_LENGTH_MIN) return;
        if (name === "PeriodLength" && value !== "" && value != null && !isPeriodLengthInvalid(value)) {
            setMissingPeriodLength(false);
        }
        if (name === "SettlementTypeName" && String(value ?? "").trim()) {
            setMissingSettlementTypeName(false);
        }
        setFormData(p => ({ ...p, [name]: value }));
    };

    const handleTextareaChange = (value, name) => setFormData(p => ({ ...p, [name]: value }));
    const handleCheckboxChange = (checked, name) => setFormData(p => ({ ...p, [name]: checked }));
    const resetForm = () => {
        setFormData(emptyForm);
        setIsEditing(false);
        setMissingSettlementTypeName(false);
        setMissingPeriodLength(false);
    };

    const validateForm = () => {
        const missName = !formData.SettlementTypeName.trim();
        const periodIssue = isPeriodLengthInvalid(formData.PeriodLength);
        setMissingSettlementTypeName(missName);
        setMissingPeriodLength(!!periodIssue);
        if (missName) {
            showNotification("error", "Settlement Type Name is required");
            return false;
        }
        if (periodIssue === "required") {
            showNotification("error", "Period Length is required");
            return false;
        }
        if (periodIssue === "min") {
            showNotification("error", `Period Length must be at least ${PERIOD_LENGTH_MIN} month`);
            return false;
        }
        if (periodIssue === "max") {
            showNotification("error", `Period Length cannot exceed ${PERIOD_LENGTH_MAX} months`);
            return false;
        }
        return true;
    };

    const handleAdd = () => {
        if (!validateForm()) return;
        const nameKey = formData.SettlementTypeName.trim().toLowerCase();
        const duplicate = items.some(
            (r) =>
                String(r.SettlementTypeName ?? "").trim().toLowerCase() === nameKey &&
                (!isEditing || r.SettlementTypeID !== formData.SettlementTypeID)
        );
        if (duplicate) {
            showNotification("error", "A settlement type with this name already exists");
            return;
        }
        const item = {
            ...formData,
            SettlementTypeID: isEditing ? formData.SettlementTypeID : `new_${Date.now()}`,
            PeriodLength: Number(formData.PeriodLength),
            IsCustom: false,
            _isNew: isEditing ? formData._isNew : true,
        };
        if (isEditing) {
            const baseline = items.find((o) => o.SettlementTypeID === formData.SettlementTypeID);
            if (baseline && !rowChanged(baseline, item)) {
                showNotification("error", "No Changes Detected");
                resetForm();
                return;
            }
            setItems(p => p.map(x => x.SettlementTypeID === formData.SettlementTypeID ? item : x));
            showNotification("success", "Updated Successfully");
        } else {
            setItems(p => [...p, item]);
            showNotification("success", "Added Successfully");
        }
        resetForm();
    };

    const handleEdit = (row) => { setFormData(row); setIsEditing(true); };
    const handleDelete = (id) => {
        setItems(p => p.filter(x => x.SettlementTypeID !== id));
        showNotification("success", "Deleted Successfully");
    };

    const handleSave = async () => {
        try {
            const periodError = items
                .map((r) => validateRowPeriodLength(r, "SettlementTypeName"))
                .find(Boolean);
            if (periodError) {
                showNotification("error", periodError);
                return;
            }

            const toInsert = items.filter(r => r._isNew);
            const toUpdate = items.filter(r => { if (r._isNew) return false; const o = original.find(x => x.SettlementTypeID === r.SettlementTypeID); return o && rowChanged(o, r); });
            const toDelete = original.filter(o => !items.find(r => r.SettlementTypeID === o.SettlementTypeID));

            if (!toInsert.length && !toUpdate.length && !toDelete.length) { showNotification("error", "No Changes Detected"); return; }

            const payload = r => ({ SettlementTypeName: r.SettlementTypeName, PeriodLength: r.PeriodLength, IsCustom: false, Remarks: r.Remarks?.trim() || null, Active: r.Active });

            for (const r of toInsert) {
                await authAxios.post(API, payload(r));
            }
            for (const r of toUpdate) {
                await authAxios.put(`${API}/${r.SettlementTypeID}`, payload(r));
            }
            for (const r of toDelete) {
                await authAxios.delete(`${API}/${r.SettlementTypeID}`);
            }

            const res = await authAxios.get(API);
            const fresh = res.data.map(mapFromServer);
            setItems(fresh); setOriginal(fresh);
            showNotification("success", "Saved Successfully");
        } catch (err) {
            if (err?.response) {
                const data = err.response?.data;
                const message = typeof data === "string"
                    ? data
                    : (data?.error ?? data?.title ?? err.message ?? "Save failed");
                showNotification("error", "Save Failed", message);
            }
            await loadData();
        }
    };

    const columns = useMemo(() => [
        {
            Header: "Settlement Type Name",
            accessor: "SettlementTypeName",
            Cell: (row) => (
                <div style={{ paddingLeft: 10 }}>
                    {mobileDualCell(
                        row.value,
                        mobileLabeledRow("Settlement Type Name", row.value)
                    )}
                </div>
            ),
        },
        {
            Header: "Period Length",
            accessor: "PeriodLength",
            style: { textAlign: "center" },
            Cell: (row) => mobileDualCell(
                row.value,
                mobileLabeledRow("Period Length", row.value)
            ),
        },
        ...(SHOW_IS_CUSTOM ? [{
            Header: "Custom",
            accessor: "IsCustom",
            style: { textAlign: "center" },
            Cell: (row) => {
                const icon = row.value ? "✅" : "❌";
                return mobileDualCell(icon, mobileLabeledRow("Custom", icon));
            },
        }] : []),
        {
            Header: "Remarks",
            accessor: "Remarks",
            Cell: (row) => mobileDualCell(
                row.value,
                mobileLabeledRow("Remarks", row.value ?? "-")
            ),
        },
        {
            Header: "Active",
            accessor: "Active",
            style: { textAlign: "center" },
            Cell: (row) => {
                const icon = row.value ? "✅" : "❌";
                return mobileDualCell(icon, mobileLabeledRow("Active", icon));
            },
        },
        {
            Header: "Actions",
            accessor: "SettlementTypeID",
            Cell: (row) => mobileActionRow(
                <div className="d-flex justify-content-center gap-2">
                    <span className="hyperlink-text" onClick={() => handleEdit(row.original)}>Edit</span>
                    <span style={{ color: '#0078bb' }}>|</span>
                    <span className="hyperlink-text" onClick={() => handleDelete(row.original.SettlementTypeID)}>Delete</span>
                </div>
            ),
        },
    ], [items]);

    return (
        <div className="definitions-page p-3" style={{ minHeight: "calc(100vh - 80px)", background: "#f7f9fc" }}>
            <div className="d-flex justify-content-between align-items-center mb-3">
                <div>
                    <h5 className="mb-0">Settlement Type Definition</h5>
                </div>
                <div className="d-flex align-items-center gap-3">
                    <div className="plan-editor-toolbar" style={{ marginLeft: 0 }}>
                        <button
                            type="button"
                            className="plan-editor-toolbar-btn"
                            title="Export to Excel"
                            onClick={() => exportTableToExcel(columns, items, "Settlement Types", "Settlement Types")}
                        >
                            <i className="fa fa-file-excel-o" />
                            <span>Excel</span>
                        </button>
                    </div>
                    <span className="hyperlink-text" onClick={() => handleSave()}>Save</span>
                </div>
            </div>

            <Notification type={notification.type} title={notification.title} message={notification.message} display={notification.display} />

            <div className="card border-0 shadow-sm mb-3">
                <div className="card-header bg-light border-0">
                    <strong>Settlement Type Details</strong>
                </div>
                <div className="card-body">
                    <div className="row align-items-end">
                        <div className="col-md-3 mb-3">
                            <InputTextComponent
                                name="SettlementTypeName"
                                value={formData.SettlementTypeName}
                                placeholder={<>Settlement Type Name <span className="required">*</span></>}
                                handleChange={handleInputChange}
                                handleOnblur={(value) => {
                                    if (!String(value ?? "").trim()) setMissingSettlementTypeName(true);
                                }}
                                className={missingSettlementTypeName ? "alert-danger" : ""}
                                maxLength={100}
                            />
                        </div>
                        <div className="col-md-2 mb-3">
                            <InputNumericComp
                                allowNegative={false}
                                name="PeriodLength"
                                value={formData.PeriodLength}
                                placeholder={<>Period Length (Month) <span className="required">*</span></>}
                                handleChange={handleInputChange}
                                minValue={PERIOD_LENGTH_MIN}
                                maxValue={PERIOD_LENGTH_MAX}
                                noDecimal
                                className={missingPeriodLength ? "alert-danger" : ""}
                                onBlur={(value) => {
                                    if (isPeriodLengthInvalid(value)) setMissingPeriodLength(true);
                                }}
                            />
                        </div>
                        {SHOW_IS_CUSTOM && (
                            <div className="col-md-1 mb-4">
                                <CheckBoxComp name="IsCustom" checked={formData.IsCustom} description="Custom" onCheckChange={handleCheckboxChange} />
                            </div>
                        )}
                        <div className="col-md-1 mb-4">
                            <CheckBoxComp name="Active" checked={formData.Active} description="Active" onCheckChange={handleCheckboxChange} />
                        </div>
                        <div className="col-md-12 mb-3">
                            <TextAreaComp name="Remarks" value={formData.Remarks ?? ""} onChange={(val, name) => setFormData(prev => ({ ...prev, Remarks: val || null }))} placeholder="Remarks" maxLength={500} maxRows={5} style={{ minHeight: "50px" }} />
                        </div>
                        <div className="col-md-12 mb-2">
                            <div className="d-flex justify-content-end gap-2">
                                <span className="hyperlink-text" onClick={() => handleAdd()}>{isEditing ? "Update" : "Add"}</span>
                                <span style={{ color: '#0078bb' }}>|</span>
                                <span className="hyperlink-text" onClick={() => resetForm()}>Clear</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="card border-0 shadow-sm">
                <div className="card-header bg-white border-0"><strong>Created Settlement Types</strong></div>
                <div className="card-body">
                    <div className="adv-mobile-table">
                        <AdvancedTable columns={columns} dataArray={items} enableSearch minRows={0} maxHeight={null} showPagination={false} showRowSelectedAndRowCount recordCount={items.length} pageSize={items.length || 1} currentPage={1} isFilterOptionOneRow />
                    </div>
                </div>
            </div>
            {discardModal}
        </div>
    );
}