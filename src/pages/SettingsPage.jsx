import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ScanProgressPopup from '../components/ScanProgressPopup';

// Event names constants
const SCAN_PROGRESS_EVENT = "scan://progress";
const SCAN_COMPLETE_EVENT = "scan://complete";
const SCAN_ERROR_EVENT = "scan://error";


function SettingsPage() {
    const {
        modsFolder,
        quickLaunchPath,
        updateSetting,
        isLoading,
        error: contextError,
        SETTINGS_KEY_MODS_FOLDER,
        SETTINGS_KEY_QUICK_LAUNCH
    } = useSettings();

    // State for path changing
    const [isChangingFolder, setIsChangingFolder] = useState(false);
    const [isChangingFile, setIsChangingFile] = useState(false);
    const [changeError, setChangeError] = useState('');

    // State for the manual scan button and its popup
    const [isManualScanning, setIsManualScanning] = useState(false); // Only tracks button disable state
    const [showScanPopup, setShowScanPopup] = useState(false); // Controls popup visibility
    const [scanProgressData, setScanProgressData] = useState(null); // Data for the popup
    const [scanSummary, setScanSummary] = useState(''); // Completion message
    const [scanError, setScanError] = useState(''); // Error message
    const scanListenersRef = useRef({ unlistenProgress: null, unlistenComplete: null, unlistenError: null }); // Ref for listeners


    // --- Path Changing Logic ---
    const handleChangeModsFolder = async () => {
        setIsChangingFolder(true);
        setChangeError('');
        // Clear scan status if displayed from a previous manual scan
        setScanSummary('');
        setScanError('');
        closeScanPopup(); // Close popup if open
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
         setScanSummary('');
         setScanError('');
         closeScanPopup(); // Close popup if open
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
        setIsManualScanning(true); // Disable button
        setShowScanPopup(false); // Hide previous results before starting
        setScanProgressData(null);
        setScanSummary('');
        setScanError('');
        setChangeError(''); // Clear path change errors

        try {
            await invoke('scan_mods_directory');
            // If invoke succeeds, listeners will handle showing the popup and progress
            // We show popup immediately on start event now
        } catch (err) {
            console.error("Failed to invoke scan command:", err);
            const errorMessage = typeof err === 'string' ? err : (err.message || 'Failed to start scan');
            setScanError(errorMessage);
            setShowScanPopup(true); // Ensure popup shows the invocation error
            setIsManualScanning(false); // Re-enable button on invocation failure
        }
    };

    // Event listeners specifically for the manual scan triggered from this page
    useEffect(() => {
        const setupListeners = async () => {
             scanListenersRef.current.unlistenProgress = await listen(SCAN_PROGRESS_EVENT, (event) => {
                 console.log('Manual Scan Progress:', event.payload);
                 setShowScanPopup(true); // Ensure popup is visible on progress
                 setScanProgressData(event.payload);
                 setScanSummary('');
                 setScanError('');
                 setIsManualScanning(true); // Keep button disabled during progress
             });

             scanListenersRef.current.unlistenComplete = await listen(SCAN_COMPLETE_EVENT, (event) => {
                 console.log('Manual Scan Complete:', event.payload);
                 setShowScanPopup(true); // Ensure popup visible for summary
                 setScanSummary(event.payload || 'Scan completed successfully!');
                 setScanProgressData(null); // Clear progress data
                 setScanError('');
                 setIsManualScanning(false); // Re-enable button
             });

             scanListenersRef.current.unlistenError = await listen(SCAN_ERROR_EVENT, (event) => {
                 console.error('Manual Scan Error Event:', event.payload);
                 setShowScanPopup(true); // Ensure popup visible for error
                 setScanError(event.payload || 'An unknown error occurred during scan.');
                 setScanProgressData(null); // Clear progress data
                 setScanSummary('');
                 setIsManualScanning(false); // Re-enable button
             });
        };

        setupListeners();

        // Actual cleanup function for useEffect
        return () => {
            console.log("Cleaning up manual scan listeners for Settings page...");
            scanListenersRef.current.unlistenProgress?.();
            scanListenersRef.current.unlistenComplete?.();
            scanListenersRef.current.unlistenError?.();
        };
    }, []); // Run only once when the Settings component mounts

    const closeScanPopup = () => {
        setShowScanPopup(false);
        setScanProgressData(null);
        setScanSummary('');
        setScanError('');
        // Re-enable button if popup closed manually during scan
        if (isManualScanning && !scanSummary && !scanError) {
            setIsManualScanning(false);
        }
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
                            disabled={isChangingFolder || isManualScanning} // Also disable if scanning
                            style={{ minWidth: '110px' }} // Prevent layout shift
                        >
                            {isChangingFolder ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-folder-open fa-fw"></i>}
                            {' '}Change
                        </button>
                    </div>
                    {/* Quick Launch Setting */}
                    <div style={styles.settingRow}>
                        <label style={styles.settingLabel}>Quick Launch File:</label>
                        <span style={styles.settingValue} title={quickLaunchPath || ''}>{quickLaunchPath || 'Not Set'}</span>
                        <button
                            className="btn btn-outline"
                            onClick={handleChangeQuickLaunch}
                            disabled={isChangingFile || isManualScanning} // Also disable if scanning
                            style={{ minWidth: '110px' }} // Prevent layout shift
                        >
                             {isChangingFile ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-file-arrow-up fa-fw"></i>}
                             {' '}Change
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
                            style={{ minWidth: '120px' }} // Prevent layout shift
                        >
                            {isManualScanning && !scanSummary && !scanError ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-sync-alt fa-fw"></i>}
                            {isManualScanning && !scanSummary && !scanError ? ' Scanning...' : ' Scan Now'}
                        </button>
                     </div>

                    {/* --- Other Options --- */}
                    <h3 style={styles.sectionHeader}>Other Options</h3>
                    <p className="placeholder-text" style={{textAlign:'left', padding:0}}>More settings coming soon...</p>

                </div>
            )}

            {/* Progress Popup for Manual Scan */}
            <ScanProgressPopup
                isOpen={showScanPopup}
                progressData={scanProgressData}
                summary={scanSummary}
                error={scanError}
                onClose={closeScanPopup}
                baseTitle="Scanning Mods..." // Pass specific title
            />
        </div>
    );
}

// Styles for Settings page
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
        textAlign: 'left', // Align with labels
        paddingLeft: '165px', // Indent error messages
    },
};

export default SettingsPage;