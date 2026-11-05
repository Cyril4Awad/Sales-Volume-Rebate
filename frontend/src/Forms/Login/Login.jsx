import React, { useCallback, useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { getAuthUrlPath } from '../../globals';
import { AuthContext } from '../../ContextProvider/AuthContext';
import { LoadingContext } from '../../ContextProvider/LoadingContext';
import ButtonComponent from '../../ReusableComponents/Button/ButtonComponent';
import './Login.css';

export function Login() {

    const { login }        = useContext(AuthContext);
    const { setisLoading } = useContext(LoadingContext);
    const navigate = useNavigate();

    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [missingUsername, setMissingUsername] = useState(false);
    const [missingPassword, setMissingPassword] = useState(false);

    const BtnRef = useRef(null);

    // ─── Login handler ────────────────────────────────────────────────────────
    const handleLogin = useCallback(async () => {
        setErrorMsg('');

        const missUser = !username.trim();
        const missPass = !password.trim();
        setMissingUsername(missUser);
        setMissingPassword(missPass);
        if (missUser || missPass) {
            setErrorMsg('Please enter your username and password.');
            return;
        }

        try {
            setisLoading(prev => prev + 1);

            const resp = await axios.post(
                `${getAuthUrlPath()}/GetTokenLogin`,
                { Usr_code: username, Usr_Pwrd: password },
                { headers: { 'Content-Type': 'application/json' } }
            );
            const payload = resp.data?.[0] ?? resp.data;
            if (!resp.success || !payload?.access_token) {
                setErrorMsg('Invalid username or password.');
                return;
            }

            login(payload);
            navigate('/definitions', { replace: true });

        } catch (err) {
            console.error('Login error:', err);
            if (err.response?.status === 401) {
                setErrorMsg('Invalid username or password.');
            } else {
                setErrorMsg('Login failed. Please check that the server is running.');
            }
        } finally {
            setisLoading(prev => prev - 1);
        }
    }, [username, password, login, setisLoading, navigate]);

    // ─── Enter key support ────────────────────────────────────────────────────
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') BtnRef.current?.click();
    }, []);

    // ─── Render ───────────────────────────────────────────────────────────────
    return (
        <div className="app">
            <div id="loginMainContainer">
                <div id="loginBody">
                    <div className="login-container-fluid">
                        <div className="row">
                            <div className="col-12">

                                {/* Header */}
                                <div className="row">
                                    <div className="col-12" style={{ textAlign: 'center' }}>
                                        <img
                                            id="loginLogo"
                                            src={process.env.PUBLIC_URL + '/img/brandlogo.png'}
                                            alt="Logo"
                                        />
                                    </div>

                                    <div id="loginNote" className="col-12 mt-2">
                                        <p className={errorMsg ? 'mb-3 alert-text-danger' : 'mb-3 text-muted'}>
                                            {errorMsg || 'Sign in to your account'}
                                        </p>
                                    </div>
                                </div>

                                {/* Username */}
                                <div className="input-group mb-2">
                                    <span className="input-group-addon">
                                        <i className="icon-user" />
                                    </span>
                                    <input
                                        type="text"
                                        className={`form-control${missingUsername ? " alert-danger" : ""}`}
                                        placeholder="Username *"
                                        value={username}
                                        onChange={(e) => {
                                            if (e.target.value.trim()) setMissingUsername(false);
                                            setUsername(e.target.value);
                                        }}
                                        onBlur={() => {
                                            if (!username.trim()) setMissingUsername(true);
                                        }}
                                        onKeyDown={handleKeyDown}
                                        autoFocus
                                    />
                                </div>

                                {/* Password */}
                                <div className="input-group mb-3">
                                    <span className="input-group-addon">
                                        <i className="icon-lock" />
                                    </span>
                                    <input
                                        type="password"
                                        className={`form-control${missingPassword ? " alert-danger" : ""}`}
                                        placeholder="Password *"
                                        value={password}
                                        onChange={(e) => {
                                            if (e.target.value.trim()) setMissingPassword(false);
                                            setPassword(e.target.value);
                                        }}
                                        onBlur={() => {
                                            if (!password.trim()) setMissingPassword(true);
                                        }}
                                        onKeyDown={handleKeyDown}
                                    />
                                </div>

                                {/* Login button */}
                                <div className="row">
                                    <div className="col-12">
                                        <ButtonComponent
                                            className="btn btn-custom btn-block px-2 pointer"
                                            onClick={handleLogin}
                                            description="Login"
                                            innerRef={BtnRef}
                                        />
                                    </div>
                                </div>

                            </div>
                        </div>
                    </div>
                </div>

                <div id="loginFooter" className="push-up">
                    <img
                        id="company-logo"
                        src={process.env.PUBLIC_URL + '/img/brandlogo.png'}
                        alt="Logo"
                    />
                </div>
            </div>
        </div>
    );
}