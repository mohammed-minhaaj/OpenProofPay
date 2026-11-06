import React from 'react';
import ReactDOM from 'react-dom/client';
import { SidePanel } from './SidePanel.js';
import { AuthProvider } from '../context/AuthContext.js';
import '../styles/global.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <AuthProvider>
        <SidePanel />
      </AuthProvider>
    </React.StrictMode>
  );
}
