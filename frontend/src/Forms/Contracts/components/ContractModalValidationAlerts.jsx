export default function ContractModalValidationAlerts({
    errors = [],
    title = "Please fix the following",
}) {
    if (!errors?.length) return null;

    return (
        <div
            className="alert alert-notification alert-danger contract-modal-validation-alert"
            role="alert"
        >
            <strong className="contract-modal-validation-alert__title">{title}</strong>
            <ul className="contract-modal-validation-alert__list mb-0">
                {errors.map((e) => (
                    <li key={e}>{e}</li>
                ))}
            </ul>
        </div>
    );
}
