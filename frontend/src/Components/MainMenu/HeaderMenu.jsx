import React, { useCallback, useContext, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../ContextProvider/AuthContext';
import { clearSessionInfo } from '../../utils/session';
import { Nav, Navbar, NavbarToggler, Collapse, UncontrolledDropdown, DropdownMenu, DropdownToggle, DropdownItem } from 'reactstrap';
import './headerMenu.css'
import { mobileDevicesWidth } from '../../globals';
import { convertImageBase64ToURL } from '../../utils/functions';
import { LanguageContext } from '../../ContextProvider/LanguageContext';


export function HeaderMenu({ mobileMenu, showMobileMenu }) {

    const { userData } = useContext(AuthContext);

    const STATE = {
        mobileMenu: false,
        logindropdownOpen: false,
        loginname: userData?.userInfo?.user_name || '',
        showMobileMenu: false,
        genHospCodingDropD: false,
        vendorDropDown: false,
        purchasingDropDown: false,
        productsDropDown: false,
        usersDropD: false,
        privdata: userData?.userPriv || [],
        isOpen: false,

        userName: JSON.parse(localStorage.getItem('userData'))?.userName,
        userCode: JSON.parse(localStorage.getItem('userData'))?.userCode,
        userType: JSON.parse(localStorage.getItem('userData'))?.userType,
    };


    const [state, setState] = useState(STATE);
    const navigate = useNavigate();
    const location = useLocation()
    const [windowWidth, setWindowWidth] = useState(window.innerWidth)
    const data = JSON.parse(localStorage.getItem('sysFile'))
    const featuresActive = JSON.parse(localStorage.getItem('featuresActive'))

    let header = JSON.parse(localStorage.getItem('header'))
    let logoUrl = process.env.PUBLIC_URL + "/img/brandlogo.png"

    const { language, setLanguage } = useContext(LanguageContext)
    const [languageUsed, setLanguageUsed] = useState(language)
    const [isRTL, setIsRTL] = useState(language === 'ar')

    useEffect(() => {
        fetch("languageUsed.json").then(
            function (res) {
                return res.json()
            }).then(function (languageUsed) {
                setLanguageUsed(languageUsed.headerMenu[0])
            }).catch(
                function (err) {
                    console.log(err, ' error')
                }
            )
    }, []);

    const toggle = useCallback((key) => {
        setState({ ...state, isOpen: key !== "goToPage" ? !state.isOpen : false })
    }, [state]);

    const handleClickOutside = useCallback((event) => {
        const myDiv = document.getElementById('collapsableMenu');

        if (!myDiv?.contains(event.target) && state.isOpen) {
            toggle('filtrationSection')
        }

    }, [state.filtrationSection, toggle])

    useEffect(() => {
        window.addEventListener('mousedown', handleClickOutside);
        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
        };
    }, [handleClickOutside]);

    const handleItemClick = useCallback((index, route, systemKey) => {
        if (systemKey) {
            setState(prevState => ({
                ...prevState,
                selectedList: index,
                isOpen: false
            }));
            navigate(route)
        } else {
            return
        }
    }, [setState, navigate])

    const handleResize = () => {
        setWindowWidth(window.innerWidth);
    };

    useEffect(() => {
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    useEffect(() => {
        if (state?.mobileMenu !== mobileMenu || state?.showMobileMenu !== showMobileMenu) {
            setState({ ...state, mobileMenu: mobileMenu, showMobileMenu: showMobileMenu });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mobileMenu, showMobileMenu])


    useEffect(() => {
        setState((prv) => { return { ...prv, loginname: userData?.userInfo?.user_name, privdata: userData?.userPriv } })
    }, [userData])


    const logout = useCallback(() => {
        clearSessionInfo();
        localStorage.clear()
        navigate('/login', { replace: true })
    }, [navigate])

    // Language toggle handler
    const handleLanguageToggle = () => {
        const newLang = language === 'EN' ? 'AR' : 'EN';
        setLanguage(newLang);
        setIsRTL(newLang === 'AR');
        document.documentElement.setAttribute('dir', newLang === 'AR' ? 'rtl' : 'ltr');
    };

    useEffect(() => {
        // Ensure direction is set on mount and when language changes
        document.documentElement.setAttribute('dir', language === 'AR' ? 'rtl' : 'ltr');
    }, [language]);

    return (
        <>
            <Navbar color="light" light expand="md" className='app-header'>
                {/* Language Switch Button */}
                {/* <button
                    className={`lang-switch-btn${isRTL ? ' rtl' : ''}`}
                    onClick={handleLanguageToggle}
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 10000 }}
                >
                    {language === 'en' ? 'العربية' : 'English'}
                </button>*/}
                {((windowWidth < mobileDevicesWidth) && state.userCode?.toLowerCase() !== 'su') ?
                    <>
                        <NavbarToggler onClick={toggle} />
                        {logoUrl && <div>
                            <img
                                id="shortLogo"
                                src={logoUrl}
                                alt={`S.A.L Logo`}
                                width='150px'
                                height='50px'
                            />
                        </div>}
                        <Collapse isOpen={state.isOpen} navbar id='collapsableMenu'>
                            <Nav className="ml-auto routerNavigationList" navbar>
                                <UncontrolledDropdown nav inNavbar>
                                    <DropdownToggle nav caret
                                        className={`nav-item ${location.pathname === "/definitions" ? 'selected' : ''}`}
                                        onClick={() => handleItemClick(0, '/definitions', true)}>
                                        Definitions
                                    </DropdownToggle>
                                </UncontrolledDropdown>

                                <UncontrolledDropdown nav inNavbar>
                                    <DropdownToggle nav caret
                                        className={`nav-item ${location.pathname === "/plans" ? 'selected' : ''}`}
                                        onClick={() => handleItemClick(0, '/plans', true)}>
                                        Contracts
                                    </DropdownToggle>
                                </UncontrolledDropdown>

                                <UncontrolledDropdown nav inNavbar>
                                    <DropdownToggle nav caret
                                        className={`nav-item ${location.pathname === "/computation" ? 'selected' : ''}`}
                                        onClick={() => handleItemClick(0, '/computation', true)}>
                                        Computation
                                    </DropdownToggle>
                                </UncontrolledDropdown>
                            </Nav>
                        </Collapse>
                    </> :
                    logoUrl && <div>
                        <img
                            id="shortLogo"
                            src={logoUrl}
                            alt={`S.A.L Logo`}
                            width='150px'
                            height='50px'
                        />
                        <span className='ms-4'> {header?.hospName}</span>
                    </div>
                }

                <div className="userInfo-header-right">
                    <div className="header-content">
                        {/* <i className="notifIconCSS fa fa-bell-o fa-1x notifIcon"></i> */}
                        <span >
                            {state.userName}
                        </span>

                        <Nav className="ml-auto" navbar>
                            <UncontrolledDropdown nav inNavbar>
                                <DropdownToggle className="user-dropdown-toggle">
                                    <i className="fa fa-user userIcon"></i>
                                    <i className="fa fa-caret-down dropdown-icon"></i>
                                </DropdownToggle>
                                <DropdownMenu className="DropdownMenuRightclear" end>
                                    {/* {JSON.parse(localStorage.getItem('userData'))?.userType.toLowerCase() === 'p' && <DropdownItem className="pointer" onClick={() => navigate('/SwitchProfile', { replace: true })}>
                                        <span><i className="fa fa-lock"></i>Switch Profile</span>
                                    </DropdownItem>} */}
                                    <DropdownItem className="pointer" onClick={logout}>
                                        <span><i className="fa fa-lock"></i>{languageUsed.logout ? languageUsed.logout[language] : 'Logout'}</span>
                                    </DropdownItem>
                                </DropdownMenu>
                            </UncontrolledDropdown>
                        </Nav>
                    </div>
                </div>


            </Navbar >
        </>

    )
}
