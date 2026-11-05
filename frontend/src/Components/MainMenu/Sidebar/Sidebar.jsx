import React, { useCallback, useContext, useEffect, useState } from 'react'
import './Sidebar.css'
import { useStateWithCallback } from '../../../CustomHooks/useStateWithCallback';
import { useLocation, useNavigate } from 'react-router-dom';
import { LanguageContext } from '../../../ContextProvider/LanguageContext';

export default function Sidebar() {
    const STATE = {
        selectedList: localStorage.getItem('selectedSidebar') ? parseInt(localStorage.getItem('selectedSidebar')) : 0
    }
    const [state, setState] = useStateWithCallback(STATE);
    const data = JSON.parse(localStorage.getItem('sysFile'))
    const featuresActive = JSON.parse(localStorage.getItem('featuresActive'))
    const navigate = useNavigate();
    const location = useLocation()

    const { language } = useContext(LanguageContext)
    const [languageUsed, setLanguageUsed] = useState(language)


    useEffect(() => {
        const { pathname } = location;
        let selectedList;

        switch (pathname) {

            /* DEFINITIONS */
            case "/definitions":
            case "/sales-volume-rebate-type":
            case "/computation-type":
            case "/settlement-type":
                selectedList = '0';
                break;

            /* Contracts */
            case "/plans":
                selectedList = '8';
                break;

            /* COMPUTATION */
            case "/computation":
                selectedList = '10';
                break;

            default:
                selectedList = '0';
        }

        if (selectedList !== undefined) {
            setState(prv => {
                return {
                    ...prv,
                    selectedList: parseInt(selectedList)
                }
            })
            localStorage.setItem('selectedSidebar', selectedList)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    useEffect(() => {
        fetch("languageUsed.json").then(
            function (res) {
                return res.json()
            }).then(function (languageUsed) {
                setLanguageUsed(languageUsed.sidebar[0])
            }).catch(
                function (err) {
                    console.log(err, ' error')
                }
            )
    }, []);

    const handleItemClick = useCallback((index, path, systemKey) => {
        if (systemKey) {
            navigate(path);
        }
    }, [navigate]);

    return (
        <div className='sidebar'>
            <div className='sidebar-nav'>
                <ul className='nav flex-column'>
                    {true && (
                        <li
                            className={`nav-item ${state.selectedList === 0 ? "selected" : ""}`}
                            onClick={() => handleItemClick(0, "/definitions", true)}
                        >
                            <div>
                                {/* Definitions / Settings icon */}
                                <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="19" cy="19" r="17.5" stroke="#FFFFFF" strokeWidth="3" />
                                    <path d="M19 13.5V10.5" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <path d="M19 27.5V24.5" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <path d="M24.5 19H27.5" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <path d="M10.5 19H13.5" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <path d="M22.9 15.1L25 13" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <path d="M13 25L15.1 22.9" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <path d="M22.9 22.9L25 25" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <path d="M13 13L15.1 15.1" stroke="#FFFFFF" strokeWidth="2.3" strokeLinecap="round" />
                                    <circle cx="19" cy="19" r="4.4" stroke="#FFFFFF" strokeWidth="2.3" />
                                </svg>
                            </div>
                            Definitions
                        </li>
                    )}

                    {true && (
                        <li
                            className={`nav-item ${state.selectedList === 8 ? "selected" : ""}`}
                            onClick={() => handleItemClick(8, "/plans", true)}
                        >
                            <div>
                                {/* Contracts / Checklist icon */}
                                <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="19" cy="19" r="17.5" stroke="#FFFFFF" strokeWidth="3" />
                                    <path d="M12.5 13.5H25.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M12.5 19H25.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M12.5 24.5H20" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M23 24.5L25 26.5L29 22.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            Contracts
                        </li>
                    )}

                    {true && (
                        <li
                            className={`nav-item ${state.selectedList === 10 ? "selected" : ""}`}
                            onClick={() => handleItemClick(10, "/computation", true)}
                        >
                            <div>
                                {/* Computation / Calculator icon */}
                                <svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <circle cx="19" cy="19" r="17.5" stroke="#FFFFFF" strokeWidth="3" />
                                    <rect x="12.5" y="11.5" width="13" height="15" rx="2" stroke="#FFFFFF" strokeWidth="2.2" />
                                    <path d="M14.5 15H23.5" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M15.5 19H16.8" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M18.6 19H19.9" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M21.7 19H23" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M15.5 22.8H16.8" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M18.6 22.8H19.9" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                    <path d="M21.7 22.8H23" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
                                </svg>
                            </div>
                            Computation
                        </li>
                    )}
                </ul>
            </div>
        </div>
    )
}
