import React, { useContext, useEffect, useState } from 'react';
import { Route, Routes, useNavigate, Navigate } from 'react-router-dom';
import './App.css';
import { AuthenticationContainer } from './Containers/AuthenticationContainer';
import { LoadingContainer } from './Containers/LoadingContainer';
import { Full } from './Components/MainMenu/Full';
import { ErrorContainer } from './Containers/ErrorContainer';
import { Login } from './Forms/Login/Login';
import { LoadingContext } from './ContextProvider/LoadingContext';
import PageError from './Containers/PageError';
import DefinitionsPage from './Forms/Definitions/definitions.jsx';
import SalesVolumeRebateTypeDefinition from './Forms/Definitions/VR Types Definition/VRTypeDefinition.jsx';
import ComputationTypeDefinition from './Forms/Definitions/Computation Type/VRComputationTypeDefinition.jsx';
import SettlementTypeDefinition from './Forms/Definitions/Settlement Type/VRSettlementTypeDefinition.jsx';
import VRPlansWorkspace from './Forms/Plans/VRPlansWorkspace.jsx';
import VRComputationWorkspace from './Forms/Computation/VRComputationWorkspace.jsx';

function App() {
  const { setisLoading } = useContext(LoadingContext);


  const state = {
    patientData: localStorage.getItem('patientData') ? JSON.parse(localStorage.getItem('patientData')) : {}
  }

  return (

    // <PDFViewer />

    <Routes>
      <Route element={<ErrorContainer />}>
        <Route element={<LoadingContainer />}>
          <Route element={<AuthenticationContainer />}>
            <Route path='/login' element={<Login />} />
            <Route path='/error' element={<PageError />} />

            <Route path='/' element={<Full />}>
              <Route index element={<Navigate to="/definitions" replace />} />
              <Route path='/definitions' element={<DefinitionsPage />} />
              <Route path='/sales-volume-rebate-type' element={<SalesVolumeRebateTypeDefinition />} />
              <Route path='/computation-type' element={<ComputationTypeDefinition />} />
              <Route path='/settlement-type' element={<SettlementTypeDefinition />} />
              <Route path='/plans' element={<VRPlansWorkspace />} />
              <Route path='/computation' element={<VRComputationWorkspace />} />
              <Route path='*' element={<Navigate to="/definitions" replace />} />
            </Route>
          </Route>
        </Route>
      </Route >

    </Routes >

  );
}

export default App;
