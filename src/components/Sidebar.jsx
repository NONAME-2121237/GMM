import React, { useState, useCallback, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useSettings } from '../contexts/SettingsContext';
import ImportModModal from './ImportModModal';
import ScanProgressPopup from './ScanProgressPopup';
import { appWindow } from '@tauri-apps/api/window';

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
    const [isLaunching, setIsLaunching] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [dropError, setDropError] = useState('');
    const [activeGameDisplay, setActiveGameDisplay] = useState('');

    const handleDragOver = useCallback((event) => {
        event.preventDefault(); // Necessary to allow drop
        event.stopPropagation();
        setDropError(''); // Clear error on drag over
        if (!isDraggingOver) {
            setIsDraggingOver(true);
        }
    }, [isDraggingOver]);

    const handleDragLeave = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        // Only deactivate if leaving the sidebar element itself, not its children
        // A simpler approach is to just set it false, maybe with a small delay if needed,
        // but this direct check can be tricky. Let's keep it simple for now.
        setIsDraggingOver(false);
    }, []);

    const processDroppedFiles = useCallback(async (files) => {
         setIsDraggingOver(false);
         setDropError('');
         const validFiles = Array.from(files).filter(file =>
             /\.(zip|7z|rar)$/i.test(file.name)
         );

         if (validFiles.length === 0) {
             console.log("No valid archive files dropped.");
             setDropError("Please drop .zip, .7z, or .rar files.");
             return;
         }

         // For now, process only the first valid file
         const fileToProcess = validFiles[0];
         console.log("Processing dropped file:", fileToProcess.path || fileToProcess.name); // file.path might not be available in browser drop

         console.warn("Browser onDrop event cannot reliably access file paths. Relying on Tauri window drop event.")
         setDropError("Drop files onto the window area, not just the sidebar."); // Guide user

    }, []); // Add dependencies if needed

    const handleDrop = useCallback((event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDraggingOver(false); // Ensure feedback stops
        console.log("Browser onDrop event triggered.");
        processDroppedFiles(event.dataTransfer.files);
    }, [processDroppedFiles]); // processDroppedFiles is stable

    useEffect(() => {
        invoke('get_active_game')
            .then(gameName => setActiveGameDisplay(gameName || 'GAME')) // Use fallback
            .catch(err => {
                console.error("Sidebar: Failed to get active game", err);
                setActiveGameDisplay('GAME'); // Fallback on error
            });
    }, []); // Run only once on mount

    // --- Tauri Window Drop Listener ---
    useEffect(() => {
         let unlisten = null;
         const setupWindowDropListener = async () => {
             unlisten = await appWindow.onFileDropEvent(async (event) => {
                 console.log('File drop event on window:', event.payload);
                 if (event.payload.type === 'drop') {
                     setDropError(''); // Clear previous errors
                     const validFiles = event.payload.paths.filter(path =>
                         /\.(zip|7z|rar)$/i.test(path)
                     );

                     if (validFiles.length === 0) {
                         console.log("No valid archive files dropped on window.");
                         setDropError("Only .zip, .7z, or .rar files are supported.");
                         return;
                     }

                     // Process the first valid file dropped onto the window
                     // (Can be extended later to handle multiple files, e.g., queuing imports)
                     if (validFiles.length > 0) {
                         console.log("Initiating import for dropped file:", validFiles[0]);
                         // Directly call the import initiation logic with the path
                         try {
                             setImportError(''); // Clear previous import errors
                             setImportAnalysisResult(null);
                             const analysis = await invoke('analyze_archive', { filePathStr: validFiles[0] });
                             setImportAnalysisResult(analysis);
                             setIsImportModalOpen(true);
                          } catch (err) {
                             const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown error during dropped import');
                             console.error("Failed to initiate dropped mod import:", errorString);
                             setImportError(`Dropped Import Error: ${errorString}`); // Show error near import button
                             setIsImportModalOpen(false);
                          }
                     }
                 } else if (event.payload.type === 'hover') {
                     // Optional: Visual feedback on window hover? More complex.
                 } else if (event.payload.type === 'cancel') {
                     // Optional: Handle cancelled drop outside window?
                 }
             });
         };
         setupWindowDropListener();

         // Cleanup
         return () => {
             if (unlisten) {
                 unlisten();
                 console.log("Window file drop listener removed.");
             }
         };
    }, []); // Run once on mount

    const isNavItemActive = useCallback((navPath) => {
        const currentPath = location.pathname;
        if (['/', '/presets', '/settings'].includes(navPath)) return currentPath === navPath;
        if (navPath.startsWith('/category/')) return currentPath === navPath;
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
        } catch (err) { console.error("Failed to fetch favorite presets:", err); setFavoritePresets([]); }
        finally { setIsLoadingFavs(false); }
    }, [isLoading, modsFolder]);

    useEffect(() => {
        fetchFavorites();
        setApplyingPresetIdSidebar(null);
        closeApplyPopupSidebar();
    }, [fetchFavorites, location.pathname]);

    useEffect(() => {
        const setupSidebarListeners = async () => {
            applyListenersSidebarRef.current.unlistenStart = await listen(PRESET_APPLY_START_EVENT, (event) => { if (applyingPresetIdSidebar !== null) { setApplyProgressDataSidebar({ processed: 0, total: event.payload || 0, message: 'Starting...' }); setApplySummarySidebar(''); setApplyErrorSidebar(''); setShowApplyPopupSidebar(true); }});
            applyListenersSidebarRef.current.unlistenProgress = await listen(PRESET_APPLY_PROGRESS_EVENT, (event) => { if (applyingPresetIdSidebar !== null && showApplyPopupSidebar) setApplyProgressDataSidebar(event.payload); });
            applyListenersSidebarRef.current.unlistenComplete = await listen(PRESET_APPLY_COMPLETE_EVENT, (event) => { if (applyingPresetIdSidebar !== null) { if(showApplyPopupSidebar) {setApplySummarySidebar(event.payload || 'Preset applied successfully!'); setApplyProgressDataSidebar(null);} setApplyingPresetIdSidebar(null); } });
            applyListenersSidebarRef.current.unlistenError = await listen(PRESET_APPLY_ERROR_EVENT, (event) => { if (applyingPresetIdSidebar !== null) { if(showApplyPopupSidebar) { setApplyErrorSidebar(event.payload || 'An unknown error occurred.'); setApplyProgressDataSidebar(null); setApplySummarySidebar('');} else { setApplyErrorSidebar(event.payload || 'An unknown error occurred.'); } setApplyingPresetIdSidebar(null); } });
        };
        setupSidebarListeners();
        return () => {
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

    // --- Updated Quick Launch Logic ---
    const handleQuickLaunch = async () => {
        setLaunchError('');
        if (!quickLaunchPath) { setLaunchError("Quick Launch path not set in Settings."); return; }
        if (isLaunching) return; // Prevent double-clicks

        setIsLaunching(true); // Set launching state

        console.log("Quick Launch: Attempting normal launch...");
        try {
            await invoke('launch_executable', { path: quickLaunchPath });
            console.log("Quick Launch: Normal launch successful or detached.");
            // Success, no need to do anything else
        } catch (normalError) {
            const errorString = typeof normalError === 'string' ? normalError : String(normalError);
            console.warn("Quick Launch: Normal launch failed:", errorString);

            // --- Check for Elevation Error ---
            // Check for the OS error code or the specific message from backend
            if (errorString.includes("os error 740") || errorString.includes("requires administrator privileges")) {
                console.log("Quick Launch: Normal launch failed due to elevation requirement. Attempting elevated launch...");

                try {
                    await invoke('launch_executable_elevated', { path: quickLaunchPath });
                    console.log("Quick Launch: Elevated launch initiated.");
                    setLaunchError(''); // Clear message on successful initiation
                } catch (elevatedError) {
                    const elevatedErrorString = typeof elevatedError === 'string' ? elevatedError : String(elevatedError);
                    console.error("Quick Launch: Elevated launch failed:", elevatedErrorString);
                    if (elevatedErrorString.includes("cancelled by user")) {
                         setLaunchError("Admin launch cancelled by user.");
                     } else {
                         setLaunchError(`Admin Launch Failed: ${elevatedErrorString}`);
                    }
                }
            } else {
                // It's a different error (file not found, etc.)
                console.error("Quick Launch: Normal launch failed for other reason:", errorString);
                setLaunchError(`Launch Failed: ${errorString}`);
            }
        } finally {
             setIsLaunching(false); // Reset launching state regardless of outcome
        }
     };
     // --- End Updated Quick Launch Logic ---

     const handleInitiateImport = useCallback(async (filePath = null) => {
        setImportError('');
        setImportAnalysisResult(null);
        setDropError(''); // Clear drop error
        try {
            const selectedPath = filePath ? filePath : await invoke('select_archive_file'); // Use provided path or open dialog
            if (!selectedPath) { console.log("Import cancelled."); return; }
            console.log("Selected/Provided archive:", selectedPath);
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
     }, []); // Removed dependency on handleInitiateImport itself

     const handleCloseImportModal = useCallback(() => {
        setIsImportModalOpen(false);
        setImportAnalysisResult(null);
        setImportError('');
     }, []);

    const handleImportSuccess = useCallback((importedEntitySlug, importedCategorySlug) => {
        handleCloseImportModal();
        if (importedEntitySlug && location.pathname === `/entity/${importedEntitySlug}`) {
            window.location.reload();
        } else if (importedEntitySlug) {
            navigate(`/entity/${importedEntitySlug}`);
        } else if (importedCategorySlug) {
             navigate(`/category/${importedCategorySlug}`);
        } else {
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
            window.location.reload();   // Reload the page after applying the preset
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Failed to start preset application');
            console.error(`Failed to invoke apply_preset ${presetId} from sidebar:`, errorString);
            setApplyErrorSidebar(`Error: ${errorString}`);
            setShowApplyPopupSidebar(true);
            setApplyingPresetIdSidebar(null);
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
    const isActionDisabled = isLoading || isApplyingAnyPresetSidebar || isDraggingOver || isLaunching;

    return (
        <div
            className={`sidebar ${isDraggingOver ? 'dragging-over' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop} // This handles drops *directly* on the sidebar
        >
            <div className="logo">
                 <svg width="24" height="24" viewBox="0 0 24 24"><defs><linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="var(--primary)" /><stop offset="100%" stopColor="var(--accent)" /></linearGradient></defs><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" fill="url(#logo-gradient)"></path></svg>
                 {/* Use state for the game name, provide fallback */}
                 <span>{activeGameDisplay ? activeGameDisplay.toUpperCase() : 'GAME'} Modder</span>
            </div>

            {/* Update disabled states */}
            <button className="btn btn-primary" style={{ width: '100%', marginBottom: '15px' }} onClick={handleQuickLaunch} disabled={!quickLaunchPath || isActionDisabled} title={quickLaunchPath ? `Launch: ${quickLaunchPath}`: "Set Quick Launch path in Settings"} >
                 {isLaunching ? <><i className="fas fa-spinner fa-spin fa-fw"></i> Launching...</> : <><i className="fas fa-play fa-fw"></i> Quick Launch</>}
             </button>
             {launchError && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{launchError}</p>}

            <button className="btn btn-outline" style={{ width: '100%', marginBottom: '15px' }} onClick={() => handleInitiateImport()} disabled={!modsFolder || isActionDisabled} title={!modsFolder ? "Set Mods Folder path first" : "Import Mod from Archive"} >
                 <i className="fas fa-file-import fa-fw"></i> Import Mod
            </button>
             {/* Show Import or Drop errors */}
             {(importError || dropError) && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{importError || dropError}</p>}
             {launchError && <p style={{color: 'var(--danger)', fontSize:'12px', textAlign:'center', marginBottom:'10px'}}>{launchError}</p>}

            {/* Nav Items */}
            <ul className="nav-items">
                <NavLink to="/" end className={({ isActive }) => `nav-item ${isNavItemActive('/') ? 'active' : ''}`}> <i className="fas fa-home fa-fw"></i> Home </NavLink>
                <NavLink to="/category/characters" className={({ isActive }) => `nav-item ${isNavItemActive('/category/characters') ? 'active' : ''}`}><i className="fas fa-user fa-fw"></i> Characters</NavLink>
                <NavLink to="/category/npcs" className={({ isActive }) => `nav-item ${isNavItemActive('/category/npcs') ? 'active' : ''}`}><i className="fas fa-users fa-fw"></i> NPCs</NavLink>
                <NavLink to="/category/objects" className={({ isActive }) => `nav-item ${isNavItemActive('/category/objects') ? 'active' : ''}`}><i className="fas fa-cube fa-fw"></i> Objects</NavLink>
                <NavLink to="/category/enemies" className={({ isActive }) => `nav-item ${isNavItemActive('/category/enemies') ? 'active' : ''}`}><i className="fas fa-ghost fa-fw"></i> Enemies</NavLink>
                <NavLink to="/category/weapons" className={({ isActive }) => `nav-item ${isNavItemActive('/category/weapons') ? 'active' : ''}`}><i className="fas fa-shield-halved fa-fw"></i> Weapons</NavLink>
                <NavLink to="/category/ui" className={({ isActive }) => `nav-item ${isNavItemActive('/category/ui') ? 'active' : ''}`}><i className="fas fa-palette fa-fw"></i> UI</NavLink>
            </ul>

            <div className="separator" style={{margin: '5px 0 15px 0'}}></div>

             <ul className="nav-items" style={{paddingTop:0}}>
                <NavLink to="/presets" className={({ isActive }) => `nav-item ${isNavItemActive('/presets') ? 'active' : ''}`}> <i className="fas fa-layer-group fa-fw"></i> Presets </NavLink>
                <NavLink to="/settings" className={({ isActive }) => `nav-item ${isNavItemActive('/settings') ? 'active' : ''}`}> <i className="fas fa-cog fa-fw"></i> Settings </NavLink>
            </ul>

            <div className="separator"></div>

            <button className="btn btn-outline" style={{ width: '100%', marginBottom: '15px' }} onClick={handleOpenModsFolder} title="Open the configured mods folder" disabled={isActionDisabled} >
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
                                 <button onClick={() => handleApplyPresetSidebar(preset.id)} disabled={applyingPresetIdSidebar === preset.id || isApplyingAnyPresetSidebar || isLaunching} title="Apply Preset" style={{background:'none', border:'none', color:'var(--primary)', cursor:'pointer', padding:0, opacity:0.8, ':hover':{opacity:1}}} >
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