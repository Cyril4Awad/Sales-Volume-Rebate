// import React from 'react';
// import ReactDOM from 'react-dom/client';
// import './index.css';
// import App from './App';
// import reportWebVitals from './reportWebVitals';

// const root = ReactDOM.createRoot(document.getElementById('root'));
// root.render(
//   <React.StrictMode>
//     <App />
//   </React.StrictMode>
// );

// // If you want to start measuring performance in your app, pass a function
// // or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
// reportWebVitals();

import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';


//import 'react-datepicker/dist/react-datepicker.css';
import "react-table/react-table.css";
import 'icheck/skins/all.css';
import 'react-virtualized/styles.css'
import 'react-virtualized-select/styles.css'
import 'react-datepicker/dist/react-datepicker.css';
import reportWebVitals from './reportWebVitals';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import axios from 'axios';
import { has, isArray } from 'lodash';
import { triggerSessionExpired } from './utils/sessionExpired';
import { updateTokenFromResponse } from './utils/updateTokenFromResponse';


// Add a response interceptor
axios.interceptors.response.use(function (response) {
  updateTokenFromResponse(response);

  let responseObj = {}
  if (isArray(response.data)) {
    responseObj.success = true
    responseObj.data = response.data
  }
  else {
    if (has(response.data, 'data') && has(response.data, 'success')) {
      responseObj = response.data;
    }
    else {
      responseObj.success = true
      responseObj.status = 200
      let arr = []
      arr.push(response.data)
      responseObj.data = arr
    }
  }
  return responseObj;

}, function (error) {
  const status = error?.response?.status;

  if (status === 401) {
    triggerSessionExpired();
    return Promise.reject(error);
  }

  let err1 = JSON.parse(JSON.stringify(error));

  if (err1.status === 400) {
    let errordata = error?.response?.data?.errors;
    if (errordata) {
      return Promise.resolve({
        status: 400,
        success: false,
        message: err1.message,
        data: [{ ...errordata }]
      });
    }
  }

  if (err1.status === 313) {
    let errordata = error?.response?.data;
    if (errordata) {
      return Promise.resolve({
        status: 313,
        success: false,
        message: err1.message,
        data: [errordata]
      });
    }
  }

  return Promise.reject(err1);
});

//Add request interceptors
axios.interceptors.request.use(function (config) {
  try {
    let uri = new URL(config.url);

    if (uri.pathname.toLowerCase() !== '/login'
      && !uri.pathname.toLowerCase().includes('/authentication/')
      && uri.pathname.toLowerCase() !== '/system/getmileramdsystemfile'
      && uri.pathname.toLowerCase() !== '/system/getlogomilera' && uri.pathname.toLowerCase() !== '/hisservice/auth/getmileratoken') {

      // let token = getSessionInfo('token')
      let token = localStorage.getItem('token')
      config.headers['authorization'] = `Bearer ${token}`;
    }
  }
  catch (e) {
    if (!e.message.toLowerCase().includes('invalid url')) {
      Promise.reject(e)
    }

  }



  return config

}, function (error) {
  Promise.reject(error)
})

fetch(`${process.env.PUBLIC_URL}/config.json`)
  .then(res => res.json())
  .then(config => { window.__APP_CONFIG__ = config; })
  .catch(() => { window.__APP_CONFIG__ = {}; })
  .finally(() => {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const { HashRouter } = require('react-router-dom');
    const App = require('./App').default;
    const { ErrorContextWrapper } = require('./ContextProvider/ErrorContext');
    const { SettingsContextWrapper } = require('./ContextProvider/SettingsContext');
    const { AuthContextWrapper } = require('./ContextProvider/AuthContext');
    const { LoadingContextWrapper } = require('./ContextProvider/LoadingContext');
    const { ToastProvider } = require('react-toast-notifications');
    const { LanguageContextWrapper } = require('./ContextProvider/LanguageContext');

    ReactDOM.render(
      <HashRouter basename="/volumerebate">
        <ErrorContextWrapper>
          <SettingsContextWrapper>
            <AuthContextWrapper>
              <LoadingContextWrapper>
                <ToastProvider>
                  <LanguageContextWrapper>
                    <App />
                  </LanguageContextWrapper>
                </ToastProvider>
              </LoadingContextWrapper>
            </AuthContextWrapper>
          </SettingsContextWrapper>
        </ErrorContextWrapper>
      </HashRouter>,
      document.getElementById('root')
    );
  });

// If you want to start measuring performance in your app, pass a function
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
serviceWorkerRegistration.register();
reportWebVitals();
