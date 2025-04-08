import React, { useState, useCallback, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useSettings } from '../contexts/SettingsContext';
import ImportModModal from './ImportModModal';
import ScanProgressPopup from './ScanProgressPopup';

// Event names constants
const PRESET_APPLY_START_EVENT = "preset://apply_start";
const PRESET_APPLY_PROGRESS_EVENT = "preset://apply_progress";
const PRESET_APPLY_COMPLETE_EVENT = "preset://apply_complete";
const PRESET_APPLY_ERROR_EVENT = "preset://apply_error";

function Sidebar() {
    const location = useLocation();
    const navigate = useNavigate();
    const { quickLaunchPath, isLoading, modsFolder } = useSettings();
    const [launchError, setLaunchError] = useState('');
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [importAnalysisResult, setImportAnalysisResult] = useState(null);
    const [importError, setImportError] = useState('');
    const [favoritePresets, setFavoritePresets] = useState([]);
    const [isLoadingFavs, setIsLoadingFavs] = useState(true);
    const [applyErrorSidebar, setApplyErrorSidebar] = useState('');
    const [applyingPresetIdSidebar, setApplyingPresetIdSidebar] = useState(null);
    const [showApplyPopupSidebar, setShowApplyPopupSidebar] = useState(false);
    const [applyProgressDataSidebar, setApplyProgressDataSidebar] = useState(null);
    const [applySummarySidebar, setApplySummarySidebar] = useState('');
    const applyListenersSidebarRef = useRef({ unlistenStart: null, unlistenProgress: null, unlistenComplete: null, unlistenError: null });

    const isNavItemActive = useCallback((navPath) => {
        const currentPath = location.pathname;

        // Handle exact matches first for non-category pages
        if (['/', '/presets', '/settings'].includes(navPath)) {
            return currentPath === navPath;
        }

        // Handle category pages: Only active if the *current path* is *exactly* this category path.
        // This prevents highlighting a category when viewing an entity page.
        if (navPath.startsWith('/category/')) {
            return currentPath === navPath;
        }

        // Default: not active
        return false;
    }, [location.pathname]);

    const fetchFavorites = useCallback(async () => {
        if (isLoading || !modsFolder) {
            setIsLoadingFavs(false);
            setFavoritePresets([]);
            return;
        }
        setIsLoadingFavs(true);
        setApplyErrorSidebar('');
        try {
            const favs = await invoke('get_favorite_presets');
            setFavoritePresets(favs);
        } catch (err) {
            console.error("Failed to fetch favorite presets:", err);
            setFavoritePresets([]);
        } finally {
            setIsLoadingFavs(false);
        }
    }, [isLoading, modsFolder]);

    useEffect(() => {
        fetchFavorites();
        setApplyingPresetIdSidebar(null);
        closeApplyPopupSidebar();
    }, [fetchFavorites, location.pathname]);

    useEffect(() => {
        const setupSidebarListeners = async () => {
            applyListenersSidebarRef.current.unlistenStart = await listen(PRESET_APPLY_START_EVENT, (event) => {
                 if (applyingPresetIdSidebar !== null) {
                    setApplyProgressDataSidebar({ processed: 0, total: event.payload || 0, message: 'Starting...' });
                    setApplySummarySidebar('');
                    setApplyErrorSidebar('');
                    setShowApplyPopupSidebar(true);
                 }
            });
             applyListenersSidebarRef.current.unlistenProgress = await listen(PRESET_APPLY_PROGRESS_EVENT, (event) => {
                 if (applyingPresetIdSidebar !== null && showApplyPopupSidebar) {
                     setApplyProgressDataSidebar(event.payload);
                 }
             });
            applyListenersSidebarRef.current.unlistenComplete = await listen(PRESET_APPLY_COMPLETE_EVENT, (event) => {
                 if (applyingPresetIdSidebar !== null && showApplyPopupSidebar) {
                     setApplySummarySidebar(event.payload || 'Preset applied successfully!');
                     setApplyProgressDataSidebar(null);
                     setApplyingPresetIdSidebar(null);
                 } else if (applyingPresetIdSidebar !== null) {
                      setApplyingPresetIdSidebar(null);
                 }
             });
             applyListenersSidebarRef.current.unlistenError = await listen(PRESET_APPLY_ERROR_EVENT, (event) => {
                  if (applyingPresetIdSidebar !== null && showApplyPopupSidebar) {
                      setApplyErrorSidebar(event.payload || 'An unknown error occurred during preset application.');
                      setApplyProgressDataSidebar(null);
                      setApplySummarySidebar('');
                      setApplyingPresetIdSidebar(null);
                  } else if (applyingPresetIdSidebar !== null) {
                       setApplyingPresetIdSidebar(null);
                       setApplyErrorSidebar(event.payload || 'An unknown error occurred'); // Show error even if popup closed
                  }
             });
        };
        setupSidebarListeners();
        return () => {
            console.log("Cleaning up sidebar preset apply listeners...");
            applyListenersSidebarRef.current.unlistenStart?.();
            applyListenersSidebarRef.current.unlistenProgress?.();
            applyListenersSidebarRef.current.unlistenComplete?.();
            applyListenersSidebarRef.current.unlistenError?.();
        };
    }, [applyingPresetIdSidebar, showApplyPopupSidebar]);

    const handleOpenModsFolder = async () => {
         try { await invoke('open_mods_folder'); }
        catch (error) { console.error("Failed to open mods folder:", error); }
    };

    const handleQuickLaunch = async () => {
        setLaunchError('');
        if (!quickLaunchPath) { setLaunchError("Quick Launch path not set in Settings."); return; }
        try { await invoke('launch_executable', { path: quickLaunchPath }); }
        catch (error) { console.error("Failed to quick launch:", error); setLaunchError(`Launch Failed: ${error}`); }
     };

    const handleInitiateImport = async () => {
        setImportError('');
        setImportAnalysisResult(null);
        try {
            const selectedPath = await invoke('select_archive_file');
            if (!selectedPath) { console.log("Import cancelled by user."); return; }
            console.log("Selected archive:", selectedPath);
            const analysis = await invoke('analyze_archive', { filePathStr: selectedPath });
            console.log("Analysis result:", analysis);
            setImportAnalysisResult(analysis);
            setIsImportModalOpen(true);
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

    const handleImportSuccess = useCallback((importedEntitySlug, importedCategorySlug) => {
        console.log(`Import successful. Navigating to entity: ${importedEntitySlug} in category: ${importedCategorySlug}`);
        handleCloseImportModal();
        if (importedEntitySlug) {
             if (location.pathname === `/entity/${importedEntitySlug}`) {
                 window.location.reload();
             } else {
                 navigate(`/entity/${importedEntitySlug}`);
             }
        } else if (importedCategorySlug) {
             navigate(`/category/${importedCategorySlug}`);
        }
         else {
            navigate('/');
             window.location.reload();
        }
     }, [handleCloseImportModal, navigate, location.pathname]);

     const handleApplyPresetSidebar = async (presetId) => {
        setApplyingPresetIdSidebar(presetId);
        setApplyErrorSidebar('');
        setShowApplyPopupSidebar(false);
        setApplyProgressDataSidebar(null);
        setApplySummarySidebar('');
        try {
            await invoke('apply_preset', { presetId });
            window.location.reload();
            // The listeners will still handle the popup display/updates
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Failed to start preset application');
            console.error(`Failed to invoke apply_preset ${presetId} from sidebar:`, errorString);
            setApplyErrorSidebar(`Error: ${errorString}`);
            setShowApplyPopupSidebar(true); // Show error immediately
            setApplyingPresetIdSidebar(null); // Reset button state on immediate failure
        }
    };

    const closeApplyPopupSidebar = () => {
        setShowApplyPopupSidebar(false);
        setApplyProgressDataSidebar(null);
        setApplySummarySidebar('');
        setApplyErrorSidebar('');
        if(applyingPresetIdSidebar !== null && !applySummarySidebar && !applyErrorSidebar) {
             setApplyingPresetIdSidebar(null);
        }
    };

    const isApplyingAnyPresetSidebar = showApplyPopupSidebar && !applySummarySidebar && !applyErrorSidebar;

    return (
        <div className="sidebar">
            <div className="logo">
                 <svg width="24" height="24" viewBox="0 0 24 24"><defs><linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="var(--primary)" /><stop offset="100%" stopColor="var(--accent)" /></linearGradient></defs><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="url(#logo-gradient)"></path></svg>
                 <span>Genshin Modder</span>
            </div>

            <button className="btn btn-primary" style={{ width: '100%', marginBottom: '15px' }} onClick={handleQuickLaunch} disabled={!quickLaunchPath || isLoading || isApplyingAnyPresetSidebar} title={quickLaunchPath ? `Launch: ${quickLaunchPath}`: "Set Quick Launch path in Settings"} >
                 <i className="fas fa-play fa-fw"></i> Quick Launch
            </button>
             {launchError && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{launchError}</p>}

            <button className="btn btn-outline" style={{ width: '100%', marginBottom: '15px' }} onClick={handleInitiateImport} disabled={isLoading || !modsFolder || isApplyingAnyPresetSidebar} title={!modsFolder ? "Set Mods Folder path first" : "Import Mod from Archive"} >
                 <i className="fas fa-file-import fa-fw"></i> Import Mod
            </button>
             {importError && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{importError}</p>}

            {/* === Nav Items Section 1 === */}
            <ul className="nav-items">
            <NavLink to="/" end className={({ isActive }) => `nav-item ${isNavItemActive('/') ? 'active' : ''}`}> <i className="fas fa-home fa-fw"></i> Home </NavLink>
                 <NavLink to="/category/characters" className={({ isActive }) => `nav-item ${isNavItemActive('/category/characters') ? 'active' : ''}`}><i className="fas fa-user fa-fw"></i> Characters</NavLink>
                 <NavLink to="/category/npcs" className={({ isActive }) => `nav-item ${isNavItemActive('/category/npcs') ? 'active' : ''}`}><i className="fas fa-users fa-fw"></i> NPCs</NavLink>
                 <NavLink to="/category/objects" className={({ isActive }) => `nav-item ${isNavItemActive('/category/objects') ? 'active' : ''}`}><i className="fas fa-cube fa-fw"></i> Objects</NavLink>
                 <NavLink to="/category/enemies" className={({ isActive }) => `nav-item ${isNavItemActive('/category/enemies') ? 'active' : ''}`}><i className="fas fa-ghost fa-fw"></i> Enemies</NavLink>
                 <NavLink to="/category/weapons" className={({ isActive }) => `nav-item ${isNavItemActive('/category/weapons') ? 'active' : ''}`}><i className="fas fa-shield-halved fa-fw"></i> Weapons</NavLink>
                 <NavLink to="/category/ui" className={({ isActive }) => `nav-item ${isNavItemActive('/category/ui') ? 'active' : ''}`}><i className="fas fa-palette fa-fw"></i> UI</NavLink>
            </ul>

            {/* === Separator === */}
            <div className="separator" style={{margin: '5px 0 15px 0'}}></div>

            {/* === Nav Items Section 2 === */}
             <ul className="nav-items" style={{paddingTop:0}}> {/* Remove default top padding */}
                <NavLink to="/presets" className={({ isActive }) => `nav-item ${isNavItemActive('/presets') ? 'active' : ''}`}> <i className="fas fa-layer-group fa-fw"></i> Presets </NavLink>
                <NavLink to="/settings" className={({ isActive }) => `nav-item ${isNavItemActive('/settings') ? 'active' : ''}`}> <i className="fas fa-cog fa-fw"></i> Settings </NavLink>
            </ul>


            <div className="separator"></div>

            <button className="btn btn-outline" style={{ width: '100%', marginBottom: '15px' }} onClick={handleOpenModsFolder} title="Open the configured mods folder" disabled={isLoading || isApplyingAnyPresetSidebar} >
                 <i className="fas fa-folder-open fa-fw"></i> Open Mods Folder
             </button>

            {/* Favorites Section */}
            <div className="preset-section">
                 <div className="preset-header"><span>Favorites</span> <NavLink to="/presets" title="Manage Presets" style={{ color: 'var(--primary)', fontSize: '18px', textDecoration:'none', opacity:0.8, ':hover': {opacity: 1} }}><i className="fas fa-sliders-h"></i></NavLink> </div>
                 {applyErrorSidebar && !showApplyPopupSidebar && <p style={{ color: 'var(--danger)', fontSize: '11px', textAlign: 'center', marginBottom: '5px' }}>{applyErrorSidebar}</p>}
                 {isLoadingFavs ? ( <div style={{ padding: '10px', textAlign: 'center' }}> <i className="fas fa-spinner fa-spin"></i> </div> )
                 : favoritePresets.length > 0 ? (
                     favoritePresets.map(preset => (
                         <div key={preset.id} className="preset" title={`Apply preset: ${preset.name}`}>
                             <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '10px' }}> <i className="fas fa-star" style={{color:'var(--accent)', marginRight:'6px', fontSize:'12px'}}></i> {preset.name} </span>
                             <div className="preset-actions">
                                 <button onClick={() => handleApplyPresetSidebar(preset.id)} disabled={applyingPresetIdSidebar === preset.id || isApplyingAnyPresetSidebar} title="Apply Preset" style={{background:'none', border:'none', color:'var(--primary)', cursor:'pointer', padding:0, opacity:0.8, ':hover':{opacity:1}}} >
                                     {applyingPresetIdSidebar === preset.id ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-play-circle"></i>}
                                 </button>
                            </div>
                         </div>
                     ))
                 ) : ( <div style={{ padding: '10px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center' }}> No favorite presets yet. </div> )}
            </div>

             {/* Import Modal */}
            {isImportModalOpen && importAnalysisResult && ( <ImportModModal analysisResult={importAnalysisResult} onClose={handleCloseImportModal} onImportSuccess={handleImportSuccess} /> )}

             {/* Apply Progress Popup (Sidebar) */}
            <ScanProgressPopup
                isOpen={showApplyPopupSidebar}
                progressData={applyProgressDataSidebar}
                summary={applySummarySidebar}
                error={applyErrorSidebar}
                onClose={closeApplyPopupSidebar}
                baseTitle="Applying Preset..."
            />
        </div>
    );
}

export default Sidebar;