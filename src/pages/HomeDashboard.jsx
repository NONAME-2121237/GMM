// src/pages/HomeDashboard.jsx
import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useSettings } from '../contexts/SettingsContext';
import { Link } from 'react-router-dom';

function HomeDashboard() {
    const { isSetupComplete, isLoading: settingsLoading } = useSettings();
    // State to track total mods, null = loading, 0 = empty, >0 = has content
    const [totalAssetCount, setTotalAssetCount] = useState(null);
    const [loadingError, setLoadingError] = useState(null);

    // Fetch total asset count only if setup is complete
    useEffect(() => {
        // Only run if setup is complete and we haven't determined the count yet
        if (isSetupComplete && totalAssetCount === null) {
            setLoadingError(null); // Clear previous error
            invoke('get_total_asset_count') // *** Call the new command ***
                .then(count => {
                    console.log("Total asset count:", count);
                    setTotalAssetCount(count);
                })
                .catch(err => {
                    console.error("Error fetching total asset count:", err);
                    setLoadingError("Could not check total mod count.");
                    setTotalAssetCount(-1); // Indicate error state
                });
        } else if (!isSetupComplete) {
            // Reset count if setup isn't complete (e.g., user resets settings)
            setTotalAssetCount(null);
        }
        // Intentionally only run when isSetupComplete changes or count needs reset
        // Avoid re-running just because totalAssetCount changes from null to a value
    }, [isSetupComplete, totalAssetCount === null]); // Rerun if setup completes or we reset to null

    const handleOpenModsFolder = async () => { /* ... function remains the same ... */
         try { await invoke('open_mods_folder'); } catch (error) { console.error("Failed to open mods folder:", error); /* TODO: Show user error */ }
    };

    // Determine if the prompt should be shown: Setup complete AND total asset count is 0
    const showScanPrompt = isSetupComplete && totalAssetCount === 0;

    return (
        <div className="fadeIn">
            <div className="page-header" style={{ borderBottom: 'none', marginBottom: '15px' }}>
                 <h1 className="page-title">Dashboard</h1>
            </div>

            {/* Prompt for initial scan if needed */}
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


            {/* Existing Welcome/Info Box */}
            <div style={{ padding: '20px', background: 'var(--card-bg)', borderRadius: '12px', marginBottom: '20px' }}>
                <h2 style={{ marginBottom: '15px', fontWeight: '600' }}>Welcome to Genshin Mod Manager!</h2>
                 <button
                    className="btn btn-outline"
                    style={{ marginTop: '20px', marginRight:'10px' }}
                    onClick={handleOpenModsFolder}
                    disabled={settingsLoading || !isSetupComplete} // Disable if loading settings or not setup
                 >
                     <i className="fas fa-folder-open fa-fw"></i> Open Mods Folder
                 </button>
                 <Link to="/settings" className="btn btn-primary" style={{marginTop:'20px'}}>
                     <i className="fas fa-cog fa-fw"></i> Go to Settings
                 </Link>
            </div>

            {/* Placeholder Stats Box */}
             <div style={{ padding: '20px', background: 'var(--card-bg)', borderRadius: '12px' }}>
                <h3 style={{ marginBottom: '15px', fontWeight: '600' }}>Library Stats</h3>
                 {/* Add loading/error state for stats */}
                 {totalAssetCount === null && <p className='placeholder-text' style={{padding: 0, textAlign:'left'}}>Loading stats...</p>}
                 {loadingError && <p className='placeholder-text' style={{padding: 0, textAlign:'left', color:'var(--danger)'}}>{loadingError}</p>}
                 {totalAssetCount !== null && totalAssetCount >= 0 && <p className='placeholder-text' style={{padding: 0, textAlign:'left'}}>Total Mods Found: {totalAssetCount}</p>}
                 {/* Add more stats later (enabled count etc) */}
             </div>

        </div>
    );
}

export default HomeDashboard;