import React, { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { HeaderMenu } from './HeaderMenu';
import { mobileDevicesWidth } from '../../globals';
import Sidebar from './Sidebar/Sidebar';
import { useCallback } from 'react';
import { Footer } from './footer/Footer';
import SessionExpiredModal from '../../Forms/SessionExpired/SessionExpiredModal';

export function Full() {
    const top = useRef(null);

    const STATE = {
        showMobileMenu: false,
        spinnerShow: false,
        saveContainerVisible: false,
        saveContainerButtons: {},
        saveContainerLabels: {},
        navmenus: "",
        backtotop: false,
        notifications: [],
    };

    const [state, setState] = useState(STATE);
    const [windowWidth, setWindowWidth] = useState(window.innerWidth)

    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const main = document.querySelector('.app-body .main');
        if (main) main.scrollTop = 0;
        window.scrollTo(0, 0);
    }, [location.pathname]);

    const preventForward = useCallback(() => {
        // navigate()
    }, [navigate])

    const handleResize = () => {
        setWindowWidth(window.innerWidth);
    };

    useEffect(() => {
        window.addEventListener("popstate", preventForward);
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener("popstate", preventForward);
            window.removeEventListener('resize', handleResize);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <>
            <SessionExpiredModal />
            <div className="app" ref={top} >

                <HeaderMenu
                    mobileMenu={true}
                    showMobileMenu={state.showMobileMenu}
                />

                <div className="app-body">
                    {windowWidth > mobileDevicesWidth &&
                        (
                            <Sidebar />
                        )
                    }
                    <main className="main" >
                        <div className={`container-fluid`} style={{ padding: 0 }}>
                            <Outlet />
                        </div>
                    </main>
                </div>
                <Footer />
            </div>
        </>
    )
}
