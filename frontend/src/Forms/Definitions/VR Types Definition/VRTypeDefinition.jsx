import { useContext, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import {
    AdvancedTable,
    CheckBoxComp,
    InputTextComponent,
    SelectComp,
    TextAreaComp,
    Notification,
} from "../../../ReusableComponents";
import { AuthContext } from "../../../ContextProvider/AuthContext";
import { getApiBase } from "../../../globals";
import { triggerSessionExpired } from "../../../utils/sessionExpired";
import { updateTokenFromResponse } from "../../../utils/updateTokenFromResponse";
import useUnsavedChangesBlocker from "../../../CustomHooks/useUnsavedChangesBlocker";
import styles from "./VRTypeDefinition.css";
import "../../Plans/styles/VRPlansWorkspace.css";
import "../definitions.css";
import {
    mobileDualCell,
    mobileLabeledRow,
    mobileActionRow,
} from "../../../utils/mobileTableCells";
import "../../Plans/editor/PlanEditorModal/PlanEditorModal.css";
import exportTableToExcel from "../../../utils/exportTableToExcel";

const API = `${getApiBase()}/CVRTypes`;

const emptyForm = {
    TypeID: null,
    TypeName: "",
    Behavior: null,
    Remarks: null,
    Active: true,
};

const behaviorOptions = [
    { value: "M", label: "Manual" },
    { value: "A", label: "Automatic" },
];


const getProp = (obj, key) => {
    const match = Object.keys(obj).find(
        (k) => k.toLowerCase() === key.toLowerCase()
    );
    return match !== undefined ? obj[match] : undefined;
};

const mapFromServer = (x) => ({
    TypeID: getProp(x, "VRT_TypeID"),
    TypeName: getProp(x, "VRT_TypeName") ?? "",
    Behavior: behaviorOptions.find(
        (b) => b.value === getProp(x, "VRT_Behavior")
    ) ?? null,
    Remarks: getProp(x, "VRT_Remarks") ?? null,
    Active: getProp(x, "VRT_Active") ?? false,
    _isNew: false,
});

const normRemarks = (v) => (v == null || String(v).trim() === "" ? null : String(v).trim());

const rowChanged = (original, current) =>
    original.TypeName !== current.TypeName ||
    original.Behavior?.value !== current.Behavior?.value ||
    normRemarks(original.Remarks) !== normRemarks(current.Remarks) ||
    !!original.Active !== !!current.Active;

// ──────────────────────────────────────────────────────────────────────────────
export default function SalesVolumeRebateTypeDefinition() {

    const { userData } = useContext(AuthContext);

    const authAxios = useMemo(() => {
        const token = userData?.token;
        const instance = axios.create({
            headers: {
                Authorization: token ? `Bearer ${token}` : "",
                "Content-Type": "application/json",
            },
        });
        instance.interceptors.request.use((config) => {
            const t = localStorage.getItem("token");
            if (t) config.headers.Authorization = `Bearer ${t}`;
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

    const [rebateTypes, setRebateTypes] = useState([]);
    const [originalTypes, setOriginalTypes] = useState([]);
    const [formData, setFormData] = useState(emptyForm);
    const [isEditing, setIsEditing] = useState(false);
    const [notification, setNotification] = useState({
        type: "", title: "", message: "", display: "none",
    });
    const [missingTypeName, setMissingTypeName] = useState(false);
    const [missingBehavior, setMissingBehavior] = useState(false);
    const notificationTimerRef = useRef(null);

    const isDirty = useMemo(() => {
        const toInsert = rebateTypes.filter((r) => r._isNew);
        const toUpdate = rebateTypes.filter((r) => {
            if (r._isNew) return false;
            const orig = originalTypes.find((o) => o.TypeID === r.TypeID);
            return orig && rowChanged(orig, r);
        });
        const toDelete = originalTypes.filter(
            (orig) => !rebateTypes.find((r) => r.TypeID === orig.TypeID)
        );
        return toInsert.length > 0 || toUpdate.length > 0 || toDelete.length > 0;
    }, [rebateTypes, originalTypes]);

    const { discardModal } = useUnsavedChangesBlocker(isDirty);

    useEffect(() => {
        return () => {
            if (notificationTimerRef.current) clearTimeout(notificationTimerRef.current);
        };
    }, []);

    // ── notification ──────────────────────────────────────────────────────────
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
            setRebateTypes(mapped);
            setOriginalTypes(mapped);
        } catch (err) {
            showNotification("error", " Failed to load", err.message);
        }
    };

    // ── load ──────────────────────────────────────────────────────────────────
    useEffect(() => {
        loadData();
    }, [authAxios]);

    // ── form handlers ─────────────────────────────────────────────────────────
    const handleInputChange = (value, name) => {
        if (name === "TypeName" && String(value ?? "").trim()) setMissingTypeName(false);
        setFormData((p) => ({ ...p, [name]: value }));
    };
    const handleSelectChange = (value, name) => {
        if (name === "Behavior" && value) setMissingBehavior(false);
        setFormData((p) => ({ ...p, [name]: value }));
    };
    const handleTextareaChange = (value, name) => setFormData((p) => ({ ...p, [name]: value }));
    const handleCheckboxChange = (checked, name) => setFormData((p) => ({ ...p, [name]: checked }));

    const resetForm = () => {
        setFormData(emptyForm);
        setIsEditing(false);
        setMissingTypeName(false);
        setMissingBehavior(false);
    };

    // ── validation ────────────────────────────────────────────────────────────
    const validateForm = () => {
        const missName = !formData.TypeName.trim();
        const missBehavior = !formData.Behavior;
        setMissingTypeName(missName);
        setMissingBehavior(missBehavior);
        if (missName) {
            showNotification("error", "Name is required");
            return false;
        }
        if (missBehavior) {
            showNotification("error", "Behavior is required");
            return false;
        }
        return true;
    };

    // ── add / update (local only) ─────────────────────────────────────────────
    const handleAdd = () => {
        if (!validateForm()) return;

        const nameKey = formData.TypeName.trim().toLowerCase();
        const duplicate = rebateTypes.some(
            (r) =>
                String(r.TypeName ?? "").trim().toLowerCase() === nameKey &&
                (!isEditing || r.TypeID !== formData.TypeID)
        );
        if (duplicate) {
            showNotification("error", "A rebate type with this name already exists");
            return;
        }

        const item = {
            TypeID: isEditing ? formData.TypeID : `new_${Date.now()}`,
            TypeName: formData.TypeName,
            Behavior: formData.Behavior,
            Remarks: formData.Remarks,
            Active: formData.Active,
            _isNew: isEditing ? formData._isNew : true,
        };

        if (isEditing) {
            const baseline = rebateTypes.find((o) => o.TypeID === formData.TypeID);
            if (baseline && !rowChanged(baseline, item)) {
                showNotification("error", "No Changes Detected");
                resetForm();
                return;
            }
            setRebateTypes((p) => p.map((x) => x.TypeID === formData.TypeID ? item : x));
            showNotification("success", "Updated Successfully");
        } else {
            setRebateTypes((p) => [...p, item]);
            showNotification("success", "Added Successfully");
        }
        resetForm();
    };

    const handleEdit = (row) => { setFormData(row); setIsEditing(true); };
    const handleDelete = (id) => {
        setRebateTypes((p) => p.filter((x) => x.TypeID !== id));
        showNotification("success", "Deleted Successfully");
    };

    // ── smart save ────────────────────────────────────────────────────────────
    const handleSave = async () => {
        try {
            const toInsert = rebateTypes.filter((r) => r._isNew);

            const toUpdate = rebateTypes.filter((r) => {
                if (r._isNew) return false;
                const orig = originalTypes.find((o) => o.TypeID === r.TypeID);
                return orig && rowChanged(orig, r);
            });

            const toDelete = originalTypes.filter(
                (orig) => !rebateTypes.find((r) => r.TypeID === orig.TypeID)
            );

            if (!toInsert.length && !toUpdate.length && !toDelete.length) {
                showNotification("error", "No Changes Detected");
                return;
            }

            const buildPayload = (r) => ({
                TypeName: r.TypeName,
                Behavior: r.Behavior?.value ?? r.Behavior,
                Remarks: r.Remarks?.trim() || null,
                Active: r.Active,
            });

            await Promise.all([
                ...toInsert.map((r) => authAxios.post(API, buildPayload(r))),
                ...toUpdate.map((r) => authAxios.put(`${API}/${r.TypeID}`, buildPayload(r))),
                ...toDelete.map((r) => authAxios.delete(`${API}/${r.TypeID}`)),
            ]);

            // Reload to get real DB IDs for inserted rows
            const res = await authAxios.get(API);
            const fresh = res.data.map(mapFromServer);
            setRebateTypes(fresh);
            setOriginalTypes(fresh);

            showNotification("success", "Saved Successfully");

        } catch (err) {
            if (err?.response) {
                showNotification("error", "Save Failed", err.response?.data ?? err.message);
            }
            await loadData();
        }
    };

    // ── table columns ─────────────────────────────────────────────────────────
    const columns = useMemo(() => [
        {
            Header: "Rebate Type Name",
            accessor: "TypeName",
            Cell: (row) => (
                <div style={{ paddingLeft: 10 }}>
                    {mobileDualCell(
                        row.value,
                        mobileLabeledRow("Rebate Type Name", row.value)
                    )}
                </div>
            ),
        },
        {
            Header: "Behavior",
            accessor: "Behavior",
            Cell: (row) => {
                const label = row.value?.label ?? "";
                return mobileDualCell(
                    label,
                    mobileLabeledRow("Behavior", label)
                );
            },
        },
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
                return mobileDualCell(
                    icon,
                    mobileLabeledRow("Active", icon)
                );
            },
        },
        {
            Header: "Actions",
            accessor: "TypeID",
            Cell: (row) => mobileActionRow(
                <div className="d-flex justify-content-center gap-2">
                    <span className="hyperlink-text" onClick={() => handleEdit(row.original)}>Edit</span>
                    <span style={{ color: '#0078bb' }}>|</span>
                    <span className="hyperlink-text" onClick={() => handleDelete(row.original.TypeID)}>Delete</span>
                </div>
            ),
        },
    ], [rebateTypes]);

    const selectMenuProps = {
        menuPortalTarget: document.body,
        menuPosition: "fixed",
        styles: { menuPortal: (base) => ({ ...base, zIndex: 9999 }) },
    };

    // ── render ────────────────────────────────────────────────────────────────
    return (
        <div className="definitions-page p-3" style={{ minHeight: "calc(100vh - 80px)", background: "#f7f9fc" }}>

            <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="mb-0">Sales Volume Rebate Type</h5>
                <div className="d-flex align-items-center gap-3">
                    <div className="plan-editor-toolbar" style={{ marginLeft: 0 }}>
                        <button
                            type="button"
                            className="plan-editor-toolbar-btn"
                            title="Export to Excel"
                            onClick={() => exportTableToExcel(columns, rebateTypes, "Rebate Types", "Rebate Types")}
                        >
                            <i className="fa fa-file-excel-o" />
                            <span>Excel</span>
                        </button>
                    </div>
                    <span className="hyperlink-text" onClick={() => handleSave()}>Save</span>
                </div>
            </div>

            <Notification
                type={notification.type}
                title={notification.title}
                message={notification.message}
                display={notification.display}
            />

            <div className="card border-0 shadow-sm mb-3">
                <div className="card-header bg-light border-0">
                    <strong>Rebate Type Details</strong>
                </div>

                <div className="card-body">
                    <div className="row align-items-end">

                        <div className="col-md-4 mb-3">
                            <InputTextComponent
                                name="TypeName"
                                value={formData.TypeName}
                                placeholder={<>Rebate Type Name <span className="required">*</span></>}
                                handleChange={handleInputChange}
                                handleOnblur={(value) => {
                                    if (!String(value ?? "").trim()) setMissingTypeName(true);
                                }}
                                className={missingTypeName ? "alert-danger" : ""}
                                maxLength={100}
                            />
                        </div>

                        <div className="col-md-4 mb-3">
                            <div style={missingBehavior ? { border: "1px solid #dc3545", borderRadius: 4 } : undefined}>
                                <SelectComp
                                    name="Behavior"
                                    value={formData.Behavior}
                                    options={behaviorOptions}
                                    onChange={handleSelectChange}
                                    placeholder={<>Behavior <span className="required">*</span></>}
                                    clearable
                                    {...selectMenuProps}
                                />
                            </div>
                        </div>

                        <div className="col-md-4 mb-4">
                            <CheckBoxComp
                                name="Active"
                                checked={formData.Active}
                                description="Active"
                                onCheckChange={handleCheckboxChange}
                            />
                        </div>

                        <div className="col-md-12 mb-3">
                            <TextAreaComp
                                name="Remarks"
                                value={formData.Remarks ?? ""}
                                onChange={(val, name) => setFormData((prev) => ({ ...prev, Remarks: val || null }))}
                                placeholder="Remarks"
                                maxLength={500}
                                maxRows={5}
                                style={{ minHeight: "50px" }}
                            />
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
                <div className="card-header bg-white border-0">
                    <strong>Created Rebate Types</strong>
                </div>
                <div className="card-body">
                    <div className="adv-mobile-table">
                        <AdvancedTable
                            columns={columns}
                            dataArray={rebateTypes}
                            enableSearch
                            minRows={0}
                            maxHeight={null}
                            showPagination={false}
                            showRowSelectedAndRowCount
                            recordCount={rebateTypes.length}
                            pageSize={rebateTypes.length || 1}
                            currentPage={1}
                            isFilterOptionOneRow
                        />
                    </div>
                </div>
            </div>

            {discardModal}

        </div>
    );
}