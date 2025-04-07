// src/components/Sidebar.jsx
import React, { useState } from 'react'; // Added useState
import { NavLink, useLocation } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { useSettings } from '../contexts/SettingsContext'; // Import useSettings

function Sidebar() {
    const location = useLocation();
    const { quickLaunchPath, isLoading } = useSettings(); // Get path from context
    const [launchError, setLaunchError] = useState(''); // State for launch errors

    // Determines active state for sidebar links
    const isNavItemActive = (path) => {
        // Home is active for '/'
        if (path === '/') {
            return location.pathname === '/';
        }
        // Characters link is active for its category or any entity page
        if (path === '/category/characters') {
           return location.pathname.startsWith('/category/characters') || location.pathname.startsWith('/entity/');
        }
         // Other category links are active if path starts with their specific slug
        if (path.startsWith('/category/')) {
            return location.pathname.startsWith(path);
        }
        // General check for other top-level sections like Settings
        return location.pathname.startsWith(path);
    };

    const handleOpenModsFolder = async () => {
        try {
            await invoke('open_mods_folder');
        } catch (error) {
            console.error("Failed to open mods folder:", error);
            // TODO: Show user-friendly error
        }
    };

    const handleQuickLaunch = async () => {
        setLaunchError(''); // Clear previous error
        if (!quickLaunchPath) {
            setLaunchError("Quick Launch path not set in Settings.");
            return;
        }
        try {
            await invoke('launch_executable', { path: quickLaunchPath });
        } catch (error) {
            console.error("Failed to quick launch:", error);
            setLaunchError(`Launch Failed: ${error}`); // Show error
        }
    };

    return (
        <div className="sidebar">
            <div className="logo">
                 <svg width="24" height="24" viewBox="0 0 24 24">
                     <defs>
                         <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                             <stop offset="0%" stopColor="#9c88ff" />
                             <stop offset="100%" stopColor="#ff9f43" />
                         </linearGradient>
                     </defs>
                     <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="url(#logo-gradient)"></path>
                 </svg>
                 <span>Genshin Modder</span>
            </div>

            {/* Quick Launch Button (Added near top) */}
            <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '15px' }}
                onClick={handleQuickLaunch}
                disabled={!quickLaunchPath || isLoading} // Disable if no path or settings loading
                title={quickLaunchPath ? `Launch: ${quickLaunchPath}`: "Set Quick Launch path in Settings"}
            >
                 <i className="fas fa-play fa-fw"></i> Quick Launch
             </button>
             {/* Display launch error below button */}
             {launchError && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{launchError}</p>}


            {/* Nav Items */}
            <ul className="nav-items">
                <NavLink to="/" end className={() => `nav-item ${isNavItemActive('/') ? 'active' : ''}`}>
                     <i className="fas fa-home fa-fw"></i> Home
                 </NavLink>
                 <NavLink to="/category/characters" className={() => `nav-item ${isNavItemActive('/category/characters') ? 'active' : ''}`}>
                    <i className="fas fa-user fa-fw"></i> Characters
                 </NavLink>
                 <NavLink to="/category/npcs" className={() => `nav-item ${isNavItemActive('/category/npcs') ? 'active' : ''}`}>
                     <i className="fas fa-users fa-fw"></i> NPCs
                 </NavLink>
                 <NavLink to="/category/objects" className={() => `nav-item ${isNavItemActive('/category/objects') ? 'active' : ''}`}>
                     <i className="fas fa-cube fa-fw"></i> Objects
                 </NavLink>
                 <NavLink to="/category/enemies" className={() => `nav-item ${isNavItemActive('/category/enemies') ? 'active' : ''}`}>
                     <i className="fas fa-ghost fa-fw"></i> Enemies
                 </NavLink>
                 <NavLink to="/category/weapons" className={() => `nav-item ${isNavItemActive('/category/weapons') ? 'active' : ''}`}>
                     <i className="fas fa-shield-halved fa-fw"></i> Weapons
                 </NavLink>
                 <NavLink to="/settings" className={() => `nav-item ${isNavItemActive('/settings') ? 'active' : ''}`}>
                     <i className="fas fa-cog fa-fw"></i> Settings
                 </NavLink>
            </ul>

            <div className="separator"></div>

            {/* Open Mods Folder Button */}
            <button
                className="btn btn-outline"
                style={{ width: '100%', marginBottom: '15px' }}
                onClick={handleOpenModsFolder}
                title="Open the configured mods folder"
                 disabled={isLoading} // Also disable while loading settings
            >
                 <i className="fas fa-folder-open fa-fw"></i> Open Mods Folder
             </button>

            {/* Presets Section */}
            <div className="preset-section">
                {/* ... preset header and placeholder ... */}
                 <div className="preset-header">
                    <span>Presets</span>
                    <button title="Add New Preset (Not Implemented)">
                        <i className="fas fa-plus"></i>
                    </button>
                </div>
                <div style={{ padding: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center' }}>
                    Preset management coming soon.
                </div>
            </div>
        </div>
    );
}

export default Sidebar;