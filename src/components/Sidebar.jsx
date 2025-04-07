// src/components/Sidebar.jsx
import React, { useState, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom'; // Import useNavigate
import { invoke } from '@tauri-apps/api/tauri';
import { useSettings } from '../contexts/SettingsContext';
import ImportModModal from './ImportModModal'; // Import the modal

function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate(); // Get navigate function
    const { quickLaunchPath, isLoading, modsFolder } = useSettings(); // Get needed context
    const [launchError, setLaunchError] = useState('');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importAnalysisResult, setImportAnalysisResult] = useState(null);
    const [importError, setImportError] = useState('');

    // Determines active state for sidebar links
    const isNavItemActive = (path) => {
        if (path === '/') return location.pathname === '/';
        // Check if current path starts with the nav link path
        // This handles /category/xxx and /settings etc.
        // For entities, make sure the corresponding category is active
        if (location.pathname.startsWith('/entity/')) {
             // A simple heuristic: activate 'characters' if on any entity page
             // TODO: Could be improved by knowing the entity's category
             if (path === '/category/characters') return true;
        }
        return location.pathname.startsWith(path);
    };

    const handleOpenModsFolder = async () => {
        try { await invoke('open_mods_folder'); }
        catch (error) { console.error("Failed to open mods folder:", error); /* TODO: Show user error */ }
    };

    const handleQuickLaunch = async () => {
        setLaunchError('');
        if (!quickLaunchPath) { setLaunchError("Quick Launch path not set in Settings."); return; }
        try { await invoke('launch_executable', { path: quickLaunchPath }); }
        catch (error) { console.error("Failed to quick launch:", error); setLaunchError(`Launch Failed: ${error}`); }
    };

    // --- Import Mod Logic ---
    const handleInitiateImport = async () => {
        setImportError('');
        setImportAnalysisResult(null); // Clear previous analysis
        try {
            const selectedPath = await invoke('select_archive_file');
            if (!selectedPath) { console.log("Import cancelled by user."); return; }
            console.log("Selected archive:", selectedPath);
            // Show loading indicator?
            const analysis = await invoke('analyze_archive', { filePathStr: selectedPath });
            console.log("Analysis result:", analysis);
            setImportAnalysisResult(analysis);
            setIsImportModalOpen(true); // Open modal with analysis results
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown error during import initiation');
            console.error("Failed to initiate mod import:", errorString);
            setImportError(`Error: ${errorString}`);
            setIsImportModalOpen(false);
        }
    };

    const handleCloseImportModal = useCallback(() => {
        setIsImportModalOpen(false);
        setImportAnalysisResult(null);
        setImportError('');
    }, []);

    // Modified Success Handler for Navigation
    const handleImportSuccess = useCallback((importedEntitySlug, importedCategorySlug) => {
        console.log(`Import successful. Navigating to entity: ${importedEntitySlug} in category: ${importedCategorySlug}`);
        handleCloseImportModal(); // Close modal first

        // Navigate to the entity page to force a refresh
        if (importedEntitySlug) {
            // Check if already on the page - might need reload instead?
             if (location.pathname === `/entity/${importedEntitySlug}`) {
                 window.location.reload(); // Force reload if already there
             } else {
                 navigate(`/entity/${importedEntitySlug}`);
             }
        } else if (importedCategorySlug) {
            // Fallback to category page if entity slug somehow missing
             navigate(`/category/${importedCategorySlug}`);
        }
         else {
            // Further fallback
            navigate('/');
             window.location.reload();
        }
    }, [handleCloseImportModal, navigate, location.pathname]);


    return (
        <div className="sidebar">
            <div className="logo">
                 <svg width="24" height="24" viewBox="0 0 24 24">
                     <defs>
                         <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                             <stop offset="0%" stopColor="var(--primary)" />
                             <stop offset="100%" stopColor="var(--accent)" />
                         </linearGradient>
                     </defs>
                     <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="url(#logo-gradient)"></path>
                 </svg>
                 <span>Genshin Modder</span>
            </div>

            {/* Quick Launch Button */}
            <button
                className="btn btn-primary"
                style={{ width: '100%', marginBottom: '15px' }}
                onClick={handleQuickLaunch}
                disabled={!quickLaunchPath || isLoading}
                title={quickLaunchPath ? `Launch: ${quickLaunchPath}`: "Set Quick Launch path in Settings"}
            >
                 <i className="fas fa-play fa-fw"></i> Quick Launch
             </button>
             {launchError && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{launchError}</p>}

            {/* Import Mod Button */}
            <button
                className="btn btn-outline"
                style={{ width: '100%', marginBottom: '15px' }}
                onClick={handleInitiateImport}
                disabled={isLoading || !modsFolder} // Disable if settings loading or no mods folder set
                title={!modsFolder ? "Set Mods Folder path first" : "Import Mod from Archive"}
            >
                 <i className="fas fa-file-import fa-fw"></i> Import Mod
            </button>
             {importError && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{importError}</p>}


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
                 disabled={isLoading}
            >
                 <i className="fas fa-folder-open fa-fw"></i> Open Mods Folder
             </button>

            {/* Presets Section */}
            <div className="preset-section">
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

             {/* Import Modal */}
            {isImportModalOpen && importAnalysisResult && (
                 <ImportModModal
                    analysisResult={importAnalysisResult}
                    onClose={handleCloseImportModal}
                    onImportSuccess={handleImportSuccess} // Pass the updated handler
                 />
            )}
        </div>
    );
}

export default Sidebar;