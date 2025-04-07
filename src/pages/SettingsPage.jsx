import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ScanProgressPopup from '../components/ScanProgressPopup'; // Import the popup

function SettingsPage() {
    const {
        modsFolder,
        quickLaunchPath,
        updateSetting,
        isLoading,
        error: contextError, // Rename to avoid conflict
        SETTINGS_KEY_MODS_FOLDER,
        SETTINGS_KEY_QUICK_LAUNCH
    } = useSettings();

    // State for path changing
    const [isChangingFolder, setIsChangingFolder] = useState(false);
    const [isChangingFile, setIsChangingFile] = useState(false);
    const [changeError, setChangeError] = useState('');

    // State specifically for the manual scan button and its popup
    const [isManualScanning, setIsManualScanning] = useState(false);
    const [showManualScanPopup, setShowManualScanPopup] = useState(false);
    const [manualScanProgressData, setManualScanProgressData] = useState(null);
    const [manualScanSummary, setManualScanSummary] = useState('');
    const [manualScanError, setManualScanError] = useState('');


    // --- Path Changing Logic ---
    const handleChangeModsFolder = async () => {
        setIsChangingFolder(true);
        setChangeError('');
        // Clear scan status if displayed from a previous manual scan
        setManualScanSummary('');
        setManualScanError('');
        try {
            const result = await invoke('select_directory');
            if (result) {
                const success = await updateSetting(SETTINGS_KEY_MODS_FOLDER, result);
                if (!success) throw new Error("Failed to save setting via context.");
                // Consider prompting user to scan after changing path
            }
        } catch (err) {
            console.error("Error changing mods folder:", err);
            setChangeError(`Failed to update Mods Folder: ${err.message || String(err)}`);
        } finally {
            setIsChangingFolder(false);
        }
    };

    const handleChangeQuickLaunch = async () => {
        setIsChangingFile(true);
        setChangeError('');
         setManualScanSummary('');
         setManualScanError('');
        try {
            const result = await invoke('select_file');
            if (result) {
                const success = await updateSetting(SETTINGS_KEY_QUICK_LAUNCH, result);
                 if (!success) throw new Error("Failed to save setting via context.");
            }
        } catch (err) {
            console.error("Error changing quick launch file:", err);
             setChangeError(`Failed to update Quick Launch File: ${err.message || String(err)}`);
        } finally {
            setIsChangingFile(false);
        }
    };

    // --- Manual Scan Logic & Event Listeners ---
    const handleManualScan = async () => {
        // Reset state for the manual scan popup
        setIsManualScanning(true);
        setShowManualScanPopup(true);
        setManualScanProgressData(null);
        setManualScanSummary('');
        setManualScanError('');
        setChangeError(''); // Clear path change errors

        try {
            // Invoke the backend command; errors invoking command itself are caught here
            await invoke('scan_mods_directory');
            // Success/failure/progress is now handled by event listeners below
        } catch (err) {
            console.error("Failed to invoke scan command:", err);
            const errorMessage = typeof err === 'string' ? err : (err.message || 'Failed to start scan');
            setManualScanError(errorMessage); // Show error in the popup
            setShowManualScanPopup(true); // Ensure popup shows the error
            setIsManualScanning(false); // Re-enable button on invocation failure
        }
    };

    // Event listeners specifically for the manual scan triggered from this page
    useEffect(() => {
        // These listeners are active whenever the Settings page is mounted.
        // They will react to *any* scan event, including the automatic initial one
        // if we don't differentiate the events or disable the initial auto-scan.
        // For now, let's assume they only matter when `showManualScanPopup` is true.

        const setupListeners = async () => {
             const unlistenProgress = await listen('scan://progress', (event) => {
                 // Only update the manual popup state if it's currently shown
                 // This prevents the popup appearing unexpectedly from background scans
                 setShowManualScanPopup(currentShowState => {
                     if(currentShowState) {
                         console.log('Manual Scan Progress:', event.payload);
                         setManualScanProgressData(event.payload);
                         setManualScanSummary('');
                         setManualScanError('');
                         setIsManualScanning(true); // Keep button disabled
                     }
                     return currentShowState; // Maintain current visibility state
                 });
             });

             const unlistenComplete = await listen('scan://complete', (event) => {
                 setShowManualScanPopup(currentShowState => {
                     if(currentShowState) {
                         console.log('Manual Scan Complete:', event.payload);
                         setManualScanSummary(event.payload || 'Scan completed successfully!');
                         setManualScanProgressData(null);
                         setManualScanError('');
                         setIsManualScanning(false); // Re-enable button
                     }
                     return currentShowState;
                 });
             });

             const unlistenError = await listen('scan://error', (event) => {
                 setShowManualScanPopup(currentShowState => {
                    if(currentShowState) {
                         console.error('Manual Scan Error Event:', event.payload);
                         setManualScanError(event.payload || 'An unknown error occurred during scan.');
                         setManualScanProgressData(null);
                         setManualScanSummary('');
                         setIsManualScanning(false); // Re-enable button
                    }
                    return currentShowState;
                 });
             });

             // Return a cleanup function that unlistens to all
             return () => {
                 console.log("Cleaning up manual scan listeners for Settings page...");
                 unlistenProgress?.();
                 unlistenComplete?.();
                 unlistenError?.();
             };
        };

        const cleanupPromise = setupListeners();

        // Actual cleanup function for useEffect
        return () => {
            cleanupPromise.then(cleanup => cleanup?.());
        };
    }, []); // Run only once when the Settings component mounts

    const closeManualScanPopup = () => {
        setShowManualScanPopup(false);
        setManualScanProgressData(null);
        setManualScanSummary('');
        setManualScanError('');
        // Keep isManualScanning false, button is already re-enabled by listeners
    };


    return (
        <div className="fadeIn">
            <div className="page-header">
                <h1 className="page-title">Settings</h1>
            </div>

            {/* Display loading/error state from Settings Context */}
            {isLoading && <p className="placeholder-text">Loading settings...</p>}
            {contextError && <p className="placeholder-text" style={{ color: 'var(--danger)' }}>Error loading settings: {contextError}</p>}

            {/* Only show settings content when not loading */}
            {!isLoading && (
                <div style={{ background: 'var(--card-bg)', padding: '25px', borderRadius: '12px' }}>
                    {/* --- Paths Configuration --- */}
                    <h3 style={styles.sectionHeader}>Paths Configuration</h3>
                    {/* Mods Folder Setting */}
                    <div style={styles.settingRow}>
                        <label style={styles.settingLabel}>Mods Folder:</label>
                        <span style={styles.settingValue} title={modsFolder || ''}>{modsFolder || 'Not Set'}</span>
                        <button
                            className="btn btn-outline"
                            onClick={handleChangeModsFolder}
                            disabled={isChangingFolder || isManualScanning} // Disable if scanning too
                        >
                            {isChangingFolder ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-folder-open fa-fw"></i>}
                            Change
                        </button>
                    </div>
                    {/* Quick Launch Setting */}
                    <div style={styles.settingRow}>
                        <label style={styles.settingLabel}>Quick Launch File:</label>
                        <span style={styles.settingValue} title={quickLaunchPath || ''}>{quickLaunchPath || 'Not Set'}</span>
                        <button
                            className="btn btn-outline"
                            onClick={handleChangeQuickLaunch}
                            disabled={isChangingFile || isManualScanning}
                        >
                             {isChangingFile ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-file-arrow-up fa-fw"></i>}
                            Change
                        </button>
                    </div>
                     {/* Display path change errors */}
                     {changeError && <p style={styles.errorText}>{changeError}</p>}

                    {/* --- Mod Management Section --- */}
                    <h3 style={styles.sectionHeader}>Mod Management</h3>
                     <div style={styles.settingRow}>
                        <label style={styles.settingLabel}>Scan Mods Folder:</label>
                        <span style={{flexGrow: 1, fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)'}}>
                            Scan the configured mods folder to add newly found mods to the database.
                        </span>
                        <button
                            className="btn btn-primary"
                            onClick={handleManualScan} // Trigger manual scan with popup
                            disabled={isManualScanning || !modsFolder} // Disable if scanning or no mods folder set
                            title={!modsFolder ? "Set Mods Folder path first" : "Scan for new mods"}
                        >
                            {isManualScanning ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-sync-alt fa-fw"></i>}
                            {isManualScanning ? 'Scanning...' : 'Scan Now'}
                        </button>
                     </div>
                     {/* Status text area removed, popup handles feedback */}

                    {/* --- Other Options --- */}
                    <h3 style={styles.sectionHeader}>Other Options</h3>
                    <p className="placeholder-text" style={{textAlign:'left', padding:0}}>More settings coming soon...</p>

                </div>
            )}

            {/* Progress Popup for Manual Scan */}
            {showManualScanPopup && (
                <ScanProgressPopup
                    progress={manualScanProgressData}
                    status={manualScanProgressData?.message} // Use message from progress data
                    summary={manualScanSummary}
                    error={manualScanError}
                    onClose={closeManualScanPopup} // Function to close the popup
                />
            )}
        </div>
    );
}

// Styles for Settings page (ensure these match your previous styles)
const styles = {
    sectionHeader: {
        marginTop: '30px',
        marginBottom: '20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: '10px',
        fontSize: '18px',
        fontWeight: 500,
        color: 'var(--light)',
    },
    settingRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        marginBottom: '15px',
        paddingBottom: '15px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
        flexWrap: 'wrap',
    },
    settingLabel: {
        fontWeight: '500',
        width: '150px',
        flexShrink: 0,
        color: 'var(--light)',
    },
    settingValue: {
        flexGrow: 1,
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: '200px',
    },
    errorText: {
        color: 'var(--danger)',
        marginTop: '5px',
        marginBottom: '10px',
        fontSize: '14px',
        width: '100%',
        textAlign: 'right',
    },
    // No statusText style needed here now
};

export default SettingsPage;