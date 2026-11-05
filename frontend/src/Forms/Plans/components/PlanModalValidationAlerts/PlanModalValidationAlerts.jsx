import { useEffect, useState } from "react";

export default function PlanModalValidationAlerts({
    errors = [],
    title = "Please fix the following",
    duration = 10000,
}) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (errors?.length) {
            setVisible(true);

            const timer = setTimeout(() => {
                setVisible(false);
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [errors, duration]);

    if (!errors?.length || !visible) return null;

    return (
        <div
            className="alert alert-notification alert-danger plan-modal-validation-alert"
            role="alert"
        >
            <strong className="plan-modal-validation-alert__title">
                {title}
            </strong>

            <ul className="plan-modal-validation-alert__list mb-0">
                {errors.map((e) => (
                    <li key={e}>{e}</li>
                ))}
            </ul>
        </div>
    );
}