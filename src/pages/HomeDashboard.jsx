// src/pages/HomeDashboard.jsx
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useSettings } from '../contexts/SettingsContext';
import { Link } from 'react-router-dom';
import { open } from '@tauri-apps/api/shell';

function HomeDashboard() {
    const {
        isSetupComplete,
        isLoading: settingsLoading,
        customLibraryUrl // Get the new setting
    } = useSettings();
    const [totalAssetCount, setTotalAssetCount] = useState(null);
    const [loadingError, setLoadingError] = useState(null);

    useEffect(() => {
        if (isSetupComplete && totalAssetCount === null) {
            setLoadingError(null);
            invoke('get_total_asset_count')
                .then(count => {
                    console.log("Total asset count:", count);
                    setTotalAssetCount(count);
                })
                .catch(err => {
                    console.error("Error fetching total asset count:", err);
                    setLoadingError("Could not check total mod count.");
                    setTotalAssetCount(-1);
                });
        } else if (!isSetupComplete) {
            setTotalAssetCount(null);
        }
    }, [isSetupComplete, totalAssetCount]);

    const handleOpenModsFolder = async () => {
         try { await invoke('open_mods_folder'); }
         catch (error) { console.error("Failed to open mods folder:", error); setLoadingError("Failed to open mods folder"); }
    };

    // --- New: Function to open external URL ---
    const openExternalUrl = async (url) => {
        setLoadingError(''); // Clear previous errors
        if (!url) return;
        try {
            console.log(`Attempting to open URL: ${url}`);
            await open(url); // Use Tauri's open API
        } catch (error) {
             console.error(`Failed to open URL ${url}:`, error);
             setLoadingError(`Failed to open link: ${error}`);
        }
     };

    const showScanPrompt = isSetupComplete && totalAssetCount === 0;

    // --- Determine custom library button text ---
    let customLibraryButtonText = 'Custom Library';
    if (customLibraryUrl) {
        try {
            const url = new URL(customLibraryUrl);
            // Use hostname, remove www. if present
            customLibraryButtonText = url.hostname.replace(/^www\./, '');
        } catch (_) {
            // If URL is invalid, use a generic name but still show button if URL exists
            customLibraryButtonText = 'Custom Link';
        }
    }


    return (
        <div className="fadeIn">
            <div className="page-header" style={{ borderBottom: 'none', marginBottom: '15px' }}>
                 <h1 className="page-title">Dashboard</h1>
            </div>

            {showScanPrompt && (
                <div style={{ padding: '20px', background: 'rgba(var(--accent-rgb, 255 159 67) / 0.1)', border: '1px solid var(--accent)', borderRadius: '12px', marginBottom: '20px', color: 'var(--accent)' }}>
                     <h3 style={{ marginBottom: '10px', display:'flex', alignItems:'center', gap:'10px' }}>
                        <i className="fas fa-info-circle fa-fw"></i> Action Recommended
                    </h3>
                    <p style={{ lineHeight: '1.6', color: 'rgba(255, 255, 255, 0.85)' }}>
                        Setup is complete, but no mods have been added to the library yet.
                    </p>
                    <p style={{ lineHeight: '1.6', color: 'rgba(255, 255, 255, 0.85)', marginTop: '5px' }}>
                         Please go to the <Link to="/settings" style={{ color: 'var(--primary)', fontWeight: '500' }}>Settings</Link> page and click "Scan Now" to populate your mod library.
                    </p>
                </div>
            )}

            <div style={{ padding: '20px', background: 'var(--card-bg)', borderRadius: '12px', marginBottom: '20px' }}>
                <h2 style={{ marginBottom: '15px', fontWeight: '600' }}>Welcome to Genshin Mod Manager!</h2>

                 {/* --- Buttons Area --- */}
                 <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '20px' }}>
                     <button
                        className="btn btn-outline"
                        onClick={handleOpenModsFolder}
                        disabled={settingsLoading || !isSetupComplete}
                        title={!isSetupComplete ? "Complete setup first" : "Open your configured Mods folder"}
                     >
                         <i className="fas fa-folder-open fa-fw"></i> Open Mods Folder
                     </button>

                     {/* --- New GameBanana Button --- */}
                     <button
                         className="btn btn-outline"
                         onClick={() => openExternalUrl('https://gamebanana.com/mods/games/8552')}
                         title="Open GameBanana Genshin Mods page"
                     >
                         <i className="fas fa-external-link-alt fa-fw"></i> GameBanana
                     </button>

                     {/* --- New Custom Library Button (Conditional) --- */}
                     {customLibraryUrl && (
                         <button
                             className="btn btn-outline"
                             onClick={() => openExternalUrl(customLibraryUrl)}
                             title={`Open: ${customLibraryUrl}`}
                         >
                             <i className="fas fa-external-link-alt fa-fw"></i> {customLibraryButtonText}
                         </button>
                     )}

                     <Link to="/settings" className="btn btn-primary" style={{ marginLeft: 'auto' /* Pushes settings button right */ }}>
                         <i className="fas fa-cog fa-fw"></i> Go to Settings
                     </Link>
                </div>
                 {/* --- End Buttons Area --- */}
                 {loadingError && <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '15px' }}>{loadingError}</p>}
            </div>

            <div style={{ padding: '20px', background: 'var(--card-bg)', borderRadius: '12px' }}>
                <h3 style={{ marginBottom: '15px', fontWeight: '600' }}>Library Stats</h3>
                 {totalAssetCount === null && <p className='placeholder-text' style={{padding: 0, textAlign:'left'}}>Loading stats...</p>}
                 {loadingError && !loadingError.startsWith("Failed to open link") && /* Don't show count error if link failed */
                     <p className='placeholder-text' style={{padding: 0, textAlign:'left', color:'var(--danger)'}}>{loadingError}</p>
                 }
                 {totalAssetCount !== null && totalAssetCount >= 0 && <p className='placeholder-text' style={{padding: 0, textAlign:'left'}}>Total Mods Found: {totalAssetCount}</p>}
            </div>
        </div>
    );
}

export default HomeDashboard;