/**
 * Persist refreshed JWT from response header _auth ("Bearer <token>").
 */
export function updateTokenFromResponse(response) {
  const raw =
    response?.headers?.["_auth"]
    ?? response?.headers?.["_Auth"];

  if (!raw || typeof raw !== "string") return;

  const newToken = raw.replace(/^Bearer\s+/i, "").trim();
  if (!newToken) return;

  localStorage.setItem("token", newToken);

  try {
    const rawUser = localStorage.getItem("userData");
    if (!rawUser) return;
    const userData = JSON.parse(rawUser);
    if (userData && typeof userData === "object") {
      userData.token = newToken;
      localStorage.setItem("userData", JSON.stringify(userData));
    }
  } catch {
    // ignore malformed userData
  }
}
