// src/App.jsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import EntityPage from './pages/EntityPage';
import SettingsPage from './pages/SettingsPage';
import PresetPage from './pages/PresetPage';
import HomeDashboard from './pages/HomeDashboard';
import FirstLaunchSetup from './components/FirstLaunchSetup';


function AppContent() {
    const { isLoading, isSetupComplete } = useSettings();

    if (isLoading) {
         return (
             <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', background: 'var(--darker)', color: 'var(--light)' }}>
                <i className="fas fa-spinner fa-spin fa-2x"></i>  Loading Settings...
             </div>
        );
    }

    if (!isSetupComplete) {
        return <FirstLaunchSetup />;
    }

    // Setup is complete, show the main application UI
    return (
        <div className="app-container">
            <Sidebar />
            <main className="main-content">
                <Routes>
                    <Route path="/" element={<HomeDashboard />} />
                    <Route path="/category/:categorySlug" element={<HomePage />} />
                    <Route path="/entity/:entitySlug" element={<EntityPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/presets" element={<PresetPage />} />
                    {/* Fallback route */}
                    <Route path="*" element={<HomeDashboard />} />
                </Routes>
            </main>
        </div>
    );
}


function App() {
  return (
    <SettingsProvider>
        <AppContent />
    </SettingsProvider>
  );
}

export default App;