export function triggerSessionExpired() {
    window.dispatchEvent(new CustomEvent('session-expired'));
}
