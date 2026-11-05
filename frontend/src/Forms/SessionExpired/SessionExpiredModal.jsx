import { useEffect, useState } from "react";
import { ModalComp } from "../../ReusableComponents";
import '../../Containers/loadingContainer.css';

export default function SessionExpiredModal() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const handleSessionExpired = () => {
            setIsOpen(true);
            setTimeout(() => {
                localStorage.removeItem('token');
                localStorage.removeItem('userData');
                window.location.href = window.location.origin + '/#/volumerebate/login';
            }, 3000);
        };

        window.addEventListener('session-expired', handleSessionExpired);
        return () => window.removeEventListener('session-expired', handleSessionExpired);
    }, []);

    return (
        <ModalComp
            modal={isOpen}
            modalTitle="Session Expired"
            modalBody={
                <div className="d-flex align-items-center justify-content-center gap-3 py-2">
                    <div className="sk-three-bounce size-15 mb-0" style={{ margin: '0' }}>
                        <div className="sk-child sk-bounce1" />
                        <div className="sk-child sk-bounce2" />
                        <div className="sk-child sk-bounce3" />
                    </div>
                    <p className="mb-0">Your session has expired. You will be redirected to login.</p>
                </div>
            }
            hideFooterButtons={true}
            size="md"
        />
    );
}
