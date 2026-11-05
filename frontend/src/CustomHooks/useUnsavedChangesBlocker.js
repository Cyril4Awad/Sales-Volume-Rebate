import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ModalComp } from "../ReusableComponents";

/**
 * Blocks navigation when isDirty is true (HashRouter + react-router-dom 6.4.4).
 * Patches pushState/replaceState and listens for hashchange/popstate so manual
 * hash edits and browser back/forward cannot bypass the discard modal.
 * Tab close uses beforeunload.
 */
const getCurrentHash = () => window.location.hash || "#/";

const normalizeHash = (input) => {
    const raw = String(input ?? "");
    const hashIndex = raw.indexOf("#");
    if (hashIndex >= 0) {
        const hash = raw.slice(hashIndex);
        return hash || "#/";
    }
    if (raw.startsWith("/")) {
        return `#${raw}`;
    }
    return getCurrentHash();
};

const pathFromHash = (hash) => {
    const stripped = normalizeHash(hash).replace(/^#/, "");
    if (!stripped) return "/";
    return stripped.startsWith("/") ? stripped : `/${stripped}`;
};

const hashFromPath = (path) => {
    const p = String(path ?? "/");
    return p.startsWith("#") ? p : `#${p.startsWith("/") ? p : `/${p}`}`;
};

const historyUrlForHash = (hash) => {
    const normalized = normalizeHash(hash);
    return `${window.location.pathname}${window.location.search}${normalized}`;
};

export default function useUnsavedChangesBlocker(isDirty) {
    const navigate = useNavigate();

    const prevHashRef = useRef(getCurrentHash());
    const pendingPathRef = useRef(null);
    const allowNextNavigationRef = useRef(false);
    const handlingRef = useRef(false);

    const [showDiscardModal, setShowDiscardModal] = useState(false);

    // Keep prevHash in sync when not dirty
    useEffect(() => {
        if (!isDirty) {
            prevHashRef.current = getCurrentHash();
            setShowDiscardModal(false);
            pendingPathRef.current = null;
        }
    }, [isDirty]);

    useEffect(() => {
        if (!isDirty) return undefined;

        const originalPushState = window.history.pushState.bind(window.history);
        const originalReplaceState = window.history.replaceState.bind(window.history);

        const attemptBlock = (rawUrl) => {
            const newHash = normalizeHash(rawUrl);
            const oldHash = prevHashRef.current;

            if (handlingRef.current) {
                return false;
            }

            if (allowNextNavigationRef.current) {
                allowNextNavigationRef.current = false;
                prevHashRef.current = newHash;
                return false;
            }

            if (newHash === oldHash) {
                return false;
            }

            pendingPathRef.current = pathFromHash(newHash);
            setShowDiscardModal(true);
            return true;
        };

        const revertToPreviousHash = () => {
            handlingRef.current = true;
            originalReplaceState.call(
                window.history,
                window.history.state,
                "",
                historyUrlForHash(prevHashRef.current)
            );
            setTimeout(() => {
                handlingRef.current = false;
            }, 0);
        };

        const patchHistoryMethod = (original) =>
            function patchedHistoryMethod(state, title, url) {
                if (attemptBlock(url)) {
                    return;
                }
                return original.call(window.history, state, title, url);
            };

        window.history.pushState = patchHistoryMethod(originalPushState);
        window.history.replaceState = patchHistoryMethod(originalReplaceState);

        const onHashChange = () => {
            const newHash = getCurrentHash();
            if (attemptBlock(newHash)) {
                revertToPreviousHash();
            }
        };

        // Capture phase runs before React Router's popstate handler so we can
        // restore the URL before the route changes.
        const onPopStateCapture = () => {
            const newHash = getCurrentHash();
            if (attemptBlock(newHash)) {
                revertToPreviousHash();
            }
        };

        window.addEventListener("hashchange", onHashChange);
        window.addEventListener("popstate", onPopStateCapture, true);

        return () => {
            window.history.pushState = originalPushState;
            window.history.replaceState = originalReplaceState;
            window.removeEventListener("hashchange", onHashChange);
            window.removeEventListener("popstate", onPopStateCapture, true);
        };
    }, [isDirty]);

    // Tab/browser close warning
    useEffect(() => {
        if (!isDirty) return undefined;

        const onBeforeUnload = (event) => {
            event.preventDefault();
            event.returnValue = "";
        };

        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [isDirty]);

    const confirmDiscard = useCallback(() => {
        const pending = pendingPathRef.current;
        pendingPathRef.current = null;
        setShowDiscardModal(false);

        if (pending) {
            allowNextNavigationRef.current = true;
            prevHashRef.current = hashFromPath(pending);
            navigate(pending);
        }
    }, [navigate]);

    const cancelDiscard = useCallback(() => {
        pendingPathRef.current = null;
        setShowDiscardModal(false);
    }, []);

    const discardModal = (
        <ModalComp
            modal={showDiscardModal}
            modalTitle="Unsaved changes"
            modalBody={
                <p className="mb-0">You have unsaved changes. Discard and leave?</p>
            }
            onClose={cancelDiscard}
            onAccept={confirmDiscard}
            onAcceptText="OK"
            onCloseText="Cancel"
            size="sm"
        />
    );

    return { showDiscardModal, confirmDiscard, cancelDiscard, discardModal };
}
