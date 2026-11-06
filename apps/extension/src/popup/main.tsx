import React from 'react';
import ReactDOM from 'react-dom/client';
import { Popup } from './Popup.js';
import { AuthProvider } from '../context/AuthContext.js';
import '../styles/global.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AuthProvider>
        <Popup />
      </AuthProvider>
    </React.StrictMode>
  );
}
