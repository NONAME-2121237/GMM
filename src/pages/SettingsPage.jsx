// src/pages/SettingsPage.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ScanProgressPopup from '../components/ScanProgressPopup';
import { toast } from 'react-toastify';

// Event names constants
const SCAN_PROGRESS_EVENT = "scan://progress";
const SCAN_COMPLETE_EVENT = "scan://complete";
const SCAN_ERROR_EVENT = "scan://error";
// Add pruning events if you want specific UI updates for them
// const PRUNING_START_EVENT = "prune://start";
// const PRUNING_COMPLETE_EVENT = "prune://complete";
// const PRUNING_ERROR_EVENT = "prune://error";


function SettingsPage() {
    const {
        modsFolder,
        quickLaunchPath,
        customLibraryUrl, // Get new setting from context
        updateSetting,
        isLoading,
        error: contextError,
        SETTINGS_KEY_MODS_FOLDER,
        SETTINGS_KEY_QUICK_LAUNCH,
        SETTINGS_KEY_CUSTOM_LIBRARY_URL // Get new key
    } = useSettings();

    // Local state for the custom URL input
    const [localCustomUrl, setLocalCustomUrl] = useState('');
    const [isSavingUrl, setIsSavingUrl] = useState(false);

    // State for path changing
    const [isChangingFolder, setIsChangingFolder] = useState(false);
    const [isChangingFile, setIsChangingFile] = useState(false);

    // State for the manual scan button and its popup
    const [isManualScanning, setIsManualScanning] = useState(false);
    const [showScanPopup, setShowScanPopup] = useState(false);
    const [scanProgressData, setScanProgressData] = useState(null);
    const [scanSummary, setScanSummary] = useState('');
    const [scanError, setScanError] = useState('');
    const scanListenersRef = useRef({ unlistenProgress: null, unlistenComplete: null, unlistenError: null });

    // Effect to sync local input with context value when context loads/changes
    useEffect(() => {
        if (customLibraryUrl !== null) { // Check if context value is loaded
            setLocalCustomUrl(customLibraryUrl);
        }
    }, [customLibraryUrl]);

    // --- Path Changing Logic ---
    const handleChangeModsFolder = useCallback(async () => {
        setIsChangingFolder(true);
        setScanSummary(''); setScanError(''); closeScanPopup();
        try {
            const result = await invoke('select_directory');
            if (result) {
                const success = await updateSetting(SETTINGS_KEY_MODS_FOLDER, result);
                if (!success) throw new Error("Failed to save setting via context.");
                if (success) toast.success("模组文件夹更新成功！");
            }
        } catch (err) {
            console.error("Error changing mods folder:", err);
            toast.error(`更新模组文件夹失败：${err.message || String(err)}`);
        } finally {
            setIsChangingFolder(false);
        }
    }, [updateSetting, SETTINGS_KEY_MODS_FOLDER]);

    const handleChangeQuickLaunch = useCallback(async () => {
        setIsChangingFile(true);
        setScanSummary(''); setScanError(''); closeScanPopup();
        try {
            const result = await invoke('select_file');
            if (result) {
                const success = await updateSetting(SETTINGS_KEY_QUICK_LAUNCH, result);
                 if (!success) throw new Error("Failed to save setting via context.");
                if (success) toast.success("快速启动文件更新成功！");
            }
        } catch (err) {
            console.error("Error changing quick launch file:", err);
            toast.error(`更新快速启动文件失败：${err.message || String(err)}`);
        } finally {
            setIsChangingFile(false);
        }
    }, [updateSetting, SETTINGS_KEY_QUICK_LAUNCH]);


    // --- Custom URL Save Logic ---
    const handleSaveCustomUrl = async () => {
        setIsSavingUrl(true);
        try {
            // Simple validation: check if it looks like a URL (optional)
            if (localCustomUrl && !localCustomUrl.startsWith('http://') && !localCustomUrl.startsWith('https://')) {
                // Allow file paths or other protocols? For now, just basic http/https check.
                // throw new Error("URL must start with http:// or https://");
                console.warn("Custom URL does not start with http/https");
            }
            const success = await updateSetting(SETTINGS_KEY_CUSTOM_LIBRARY_URL, localCustomUrl);
            if (!success) throw new Error("Failed to save setting via context.");
            if (success) toast.success("自定义库URL更新成功！");
        } catch (err) {
            console.error("Error saving custom URL:", err);
            toast.error(`保存自定义库URL失败：${err.message || String(err)}`);
        } finally {
            setIsSavingUrl(false);
        }
    };

    // --- Manual Scan Logic & Event Listeners ---
    const handleManualScan = useCallback(async () => {
        setIsManualScanning(true);
        setShowScanPopup(false);
        setScanProgressData(null);
        setScanSummary('');
        setScanError('');

        try {
            await invoke('scan_mods_directory');
        } catch (err) {
            console.error("Failed to invoke scan command:", err);
            const errorMessage = typeof err === 'string' ? err : (err.message || 'Failed to start scan');
            setScanError(errorMessage);
            setShowScanPopup(true);
            setIsManualScanning(false);
        }
    }, []); // Keep dependencies minimal if the function itself doesn't rely on changing props/state

    useEffect(() => {
        const setupListeners = async () => {
             scanListenersRef.current.unlistenProgress = await listen(SCAN_PROGRESS_EVENT, (event) => {
                 console.log('Manual Scan Progress:', event.payload);
                 setShowScanPopup(true);
                 setScanProgressData(event.payload);
                 setScanSummary('');
                 setScanError('');
                 setIsManualScanning(true);
             });
             scanListenersRef.current.unlistenComplete = await listen(SCAN_COMPLETE_EVENT, (event) => {
                 console.log('Manual Scan Complete:', event.payload);
                 setShowScanPopup(true);
                 setScanSummary(event.payload || '扫描完成！');
                 setScanProgressData(null);
                 setScanError('');
                 setIsManualScanning(false);
             });
             scanListenersRef.current.unlistenError = await listen(SCAN_ERROR_EVENT, (event) => {
                 console.error('Manual Scan Error Event:', event.payload);
                 setShowScanPopup(true);
                 setScanError(event.payload || '扫描过程中发生未知错误');
                 setScanProgressData(null);
                 setScanSummary('');
                 setIsManualScanning(false);
             });
            // Add prune event listeners here if needed for UI feedback
        };
        setupListeners();
        return () => {
            console.log("Cleaning up manual scan listeners for Settings page...");
            scanListenersRef.current.unlistenProgress?.();
            scanListenersRef.current.unlistenComplete?.();
            scanListenersRef.current.unlistenError?.();
        };
    }, []);

    const closeScanPopup = () => {
        setShowScanPopup(false);
        setScanProgressData(null);
        setScanSummary('');
        setScanError('');
        if (isManualScanning && !scanSummary && !scanError) {
            setIsManualScanning(false);
        }
    };


    return (
        <div className="fadeIn">
            <div className="page-header">
                <h1 className="page-title">设置</h1>
            </div>

            {isLoading && <p className="placeholder-text">正在加载设置...</p>}
            {contextError && <p className="placeholder-text" style={{ color: 'var(--danger)' }}>加载设置时出错：{contextError}</p>}

            {!isLoading && (
                <div style={{ background: 'var(--card-bg)', padding: '25px', borderRadius: '12px' }}>
                    {/* --- Paths Configuration --- */}
                    <h3 style={styles.sectionHeader}>路径配置</h3>
                    {/* Mods Folder Setting */}
                    <div style={styles.settingRow}>
                        <label style={styles.settingLabel}>模组文件夹：</label>
                        <span style={styles.settingValue} title={modsFolder || ''}>{modsFolder || '未设置'}</span>
                        <button
                            className="btn btn-outline"
                            onClick={handleChangeModsFolder}
                            disabled={isChangingFolder || isManualScanning || isSavingUrl}
                            style={{ minWidth: '110px' }}
                        >
                            {isChangingFolder ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-folder-open fa-fw"></i>}
                            {' '}更改
                        </button>
                    </div>
                    {/* Quick Launch Setting */}
                    <div style={styles.settingRow}>
                        <label style={styles.settingLabel}>快速启动：</label>
                        <span style={styles.settingValue} title={quickLaunchPath || ''}>{quickLaunchPath || '未设置'}</span>
                        <button
                            className="btn btn-outline"
                            onClick={handleChangeQuickLaunch}
                            disabled={isChangingFile || isManualScanning || isSavingUrl}
                            style={{ minWidth: '110px' }}
                        >
                             {isChangingFile ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-file-arrow-up fa-fw"></i>}
                             {' '}更改
                        </button>
                    </div>

                    {/* Custom Library URL Setting - NEW */}
                     <div style={styles.settingRow}>
                        <label style={styles.settingLabel} htmlFor="custom-url">自定义库URL：</label>
                        <input
                            id="custom-url"
                            type="url"
                            placeholder="例如：https://my-mods.example.com"
                            value={localCustomUrl}
                            onChange={(e) => setLocalCustomUrl(e.target.value)}
                            style={styles.input} // Use input style
                            disabled={isSavingUrl || isManualScanning}
                        />
                        <button
                            className="btn btn-primary" // Changed to primary for save action
                            onClick={handleSaveCustomUrl}
                            disabled={isSavingUrl || isManualScanning || isChangingFolder || isChangingFile || localCustomUrl === customLibraryUrl} // Disable if unchanged
                            style={{ minWidth: '110px' }}
                            title={localCustomUrl === customLibraryUrl ? "未检测到更改" : "保存URL"}
                        >
                             {isSavingUrl ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-save fa-fw"></i>}
                             {' '}保存URL
                        </button>
                     </div>

                    {/* --- Mod Management Section --- */}
                    <h3 style={styles.sectionHeader}>模组管理</h3>
                     <div style={styles.settingRow}>
                        <label style={styles.settingLabel}>扫描模组文件夹：</label>
                        <span style={{flexGrow: 1, fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)'}}>
                            从数据库中添加新模组并移除已删除的模组。
                        </span>
                        <button
                            className="btn btn-primary"
                            onClick={handleManualScan}
                            disabled={isManualScanning || !modsFolder || isSavingUrl || isChangingFile || isChangingFolder}
                            title={!modsFolder ? "请先设置模组文件夹路径" : "扫描新增/删除的模组"}
                            style={{ minWidth: '120px' }}
                        >
                            {isManualScanning && !scanSummary && !scanError ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-sync-alt fa-fw"></i>}
                            {isManualScanning && !scanSummary && !scanError ? ' 扫描中...' : ' 立即扫描'}
                        </button>
                     </div>
                </div>
            )}

            <ScanProgressPopup
                isOpen={showScanPopup}
                progressData={scanProgressData}
                summary={scanSummary}
                error={scanError}
                onClose={closeScanPopup}
                baseTitle="正在扫描模组..."
            />
        </div>
    );
}

// Styles for Settings page (add input style if not already present, update settingValue)
const styles = {
    sectionHeader: {
        marginTop: '30px', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: '10px', fontSize: '18px', fontWeight: 500, color: 'var(--light)',
    },
    settingRow: {
        display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '15px',
        paddingBottom: '15px', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', flexWrap: 'wrap',
    },
    settingLabel: {
        fontWeight: '500', width: '150px', flexShrink: 0, color: 'var(--light)', fontSize: '14px',
    },
    // Style for displaying paths (non-editable span)
    settingValue: {
        flexGrow: 1, backgroundColor: 'rgba(0,0,0,0.2)', padding: '8px 12px',
        borderRadius: '6px', fontSize: '13px', color: 'rgba(255, 255, 255, 0.7)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: '200px',
        height: '38px', // Match input height approx
        display: 'flex', alignItems: 'center',
    },
     // Style for the actual input field (used for custom URL)
     input: {
        flexGrow: 1,
        padding: '10px 15px',
        backgroundColor: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: 'var(--light)',
        fontSize: '14px',
        boxSizing: 'border-box',
        minWidth: '200px',
        height: '40px', // Explicit height
        lineHeight: 'normal', // Ensure text is vertically centered
    },
    errorText: {
        color: 'var(--danger)', marginTop: '5px', marginBottom: '10px',
        fontSize: '14px', width: '100%', textAlign: 'left', paddingLeft: '165px', // Indent error messages
    },
};

export default SettingsPage;