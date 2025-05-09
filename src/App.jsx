// src/App.jsx
import React, { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { SettingsProvider, useSettings } from './contexts/SettingsContext';
import Sidebar from './components/Sidebar';
import HomePage from './pages/HomePage';
import EntityPage from './pages/EntityPage';
import SettingsPage from './pages/SettingsPage';
import PresetPage from './pages/PresetPage';
import HomeDashboard from './pages/HomeDashboard';
import FirstLaunchSetup from './components/FirstLaunchSetup';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function AppContent() {
    const { isLoading, isSetupComplete } = useSettings();

    // --- Ctrl+F Handler ---
    useEffect(() => {
        const handleGlobalKeyDown = (event) => {
            if (event.ctrlKey && event.key === 'f') {
                event.preventDefault(); // Prevent default browser search
                // Find the currently relevant search input
                // Use a specific data attribute for targeting
                const searchInput = document.querySelector('input[data-global-search="true"]');
                if (searchInput) {
                    searchInput.focus();
                    searchInput.select(); // Optional: select existing text
                }
            }
        };

        document.addEventListener('keydown', handleGlobalKeyDown);
        console.log("Global Ctrl+F listener added.");

        // Cleanup listener on component unmount
        return () => {
            document.removeEventListener('keydown', handleGlobalKeyDown);
            console.log("Global Ctrl+F listener removed.");
        };
    }, []); // Empty dependency array ensures this runs only once

    if (isLoading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw', background: 'var(--darker)', color: 'var(--light)' }}>
               <i className="fas fa-spinner fa-spin fa-2x"></i>  正在加载设置...
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
            <ToastContainer
                position="bottom-right"
                autoClose={4000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick
                rtl={false}
                pauseOnFocusLoss
                draggable
                pauseOnHover
                theme="dark"
            />
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