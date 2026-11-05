import React, { createContext, useCallback, useEffect, useState } from 'react';
import { getApiBase } from '../globals';

export const AuthContext = createContext();

function persistUserDataFields(session) {
    localStorage.setItem('userData', JSON.stringify({
        userCode: session.userCode,
        userName: session.userName,
        userType: session.userType,
        locationValid: session.locationValid ?? null,
        cashRegValid: session.cashRegValid ?? null,
    }));
}

async function fetchLocationCashRegStatus(token) {
    const res = await fetch(`${getApiBase()}/CVRLookups/location-cashreg-status`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
        throw new Error(`location-cashreg-status failed: ${res.status}`);
    }
    return res.json();
}

// ─── Read persisted session from localStorage (survives page refresh) ──────────
function loadInitialSession() {
    try {
        const token    = localStorage.getItem('token');
        const raw      = localStorage.getItem('userData');
        const userInfo = raw ? JSON.parse(raw) : null;

        if (token && userInfo) {
            return {
                token,
                userCode: userInfo.userCode,
                userName: userInfo.userName,
                userType: userInfo.userType,
                locationValid: typeof userInfo.locationValid === 'boolean' ? userInfo.locationValid : null,
                cashRegValid: typeof userInfo.cashRegValid === 'boolean' ? userInfo.cashRegValid : null,
            };
        }
    } catch {
        // corrupted localStorage — ignore and start fresh
    }
    return null;
}

export function AuthContextWrapper({ children }) {
    const [userData, setUserData] = useState(loadInitialSession);

    const getToken = useCallback(() => {
        return userData?.token ?? localStorage.getItem('token') ?? null;
    }, [userData]);

    const getUserInfo = useCallback(() => {
        return userData;
    }, [userData]);

    const applyLocationCashRegStatus = useCallback((locationValid, cashRegValid) => {
        setUserData((prev) => {
            if (!prev) return prev;
            const next = {
                ...prev,
                locationValid,
                cashRegValid,
            };
            persistUserDataFields(next);
            return next;
        });
    }, []);

    // Refresh Location/CashReg status whenever a session token is present (login + page restore)
    useEffect(() => {
        const token = userData?.token;
        if (!token) return;

        let cancelled = false;

        (async () => {
            try {
                const status = await fetchLocationCashRegStatus(token);
                if (cancelled) return;
                applyLocationCashRegStatus(
                    status?.locationValid === true,
                    status?.cashRegValid === true,
                );
            } catch {
                if (cancelled) return;
                // Treat fetch failure as unverified so Process stays blocked until a successful check
                applyLocationCashRegStatus(null, null);
            }
        })();

        return () => { cancelled = true; };
    }, [userData?.token, applyLocationCashRegStatus]);

    const login = useCallback((data) => {
        // data = { access_token, userCode, userName, userType }
        const session = {
            token:    data.access_token,
            userCode: data.userCode,
            userName: data.userName,
            userType: data.userType,
            locationValid: null,
            cashRegValid: null,
        };
        localStorage.setItem('token', session.token);
        persistUserDataFields(session);
        setUserData(session);
        // Status fetch runs via useEffect when token is set
    }, []);

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        setUserData(null);
    }, []);

    return (
        <AuthContext.Provider value={{ userData, setUserData, login, logout, getToken, getUserInfo }}>
            {children}
        </AuthContext.Provider>
    );
}
