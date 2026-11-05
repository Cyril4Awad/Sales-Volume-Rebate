import React, { useContext, useEffect, useState } from 'react'
import { AuthContext } from '../ContextProvider/AuthContext'
import { Outlet, useLocation, useNavigate } from 'react-router-dom';

export function AuthenticationContainer() {
    const { userData } = useContext(AuthContext);
    const navigate = useNavigate();
    const location = useLocation();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const isLoginRoute = location.pathname === '/login';
        const isErrorRoute = location.pathname === '/error';
        const isAuthenticated = !!(token && userData);

        if (isLoginRoute && isAuthenticated) {
            navigate('/definitions', { replace: true });
        } else if (!isLoginRoute && !isErrorRoute && !token) {
            navigate('/login', { replace: true });
        }

        setLoading(false);
    }, [location.pathname, userData, navigate]);

    if (loading) {
        return <></>
    }

    return <Outlet />
}
