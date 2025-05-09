// src/components/FirstLaunchSetup.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { invoke } from '@tauri-apps/api/tauri';
import { toast } from 'react-toastify';
import GameSwitcher from './GameSwitcher'; // Import our new component

function FirstLaunchSetup() {
    const {
        modsFolder: initialModsFolder,
        quickLaunchPath: initialQuickLaunch,
        updateSetting,
        fetchSettings,
        SETTINGS_KEY_MODS_FOLDER,
        SETTINGS_KEY_QUICK_LAUNCH
    } = useSettings();

    // Local state for the setup screen
    const [selectedModsFolder, setSelectedModsFolder] = useState(initialModsFolder || '');
    const [selectedQuickLaunch, setSelectedQuickLaunch] = useState(initialQuickLaunch || '');
    const [availableGames, setAvailableGames] = useState([]);
    const [currentGameForSetup, setCurrentGameForSetup] = useState(''); // The game currently active
    const [isSwitchingGame, setIsSwitchingGame] = useState(false);
    const [gameLoadError, setGameLoadError] = useState('');
    const [gameSwitchError, setGameSwitchError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Fetch available games and the *actual* current game on mount
    useEffect(() => {
        let isMounted = true;
        setGameLoadError('');
        Promise.all([
            invoke('get_available_games'),
            invoke('get_active_game')
        ]).then(([games, active]) => {
            if (isMounted) {
                setAvailableGames(games || []);
                setCurrentGameForSetup(active || ''); // Set the initially active game
            }
        }).catch(err => {
            if (isMounted) {
                console.error("Failed to load game data for setup:", err);
                setGameLoadError("无法加载游戏选择数据");
                setAvailableGames([]);
                setCurrentGameForSetup('');
            }
        });
        return () => { isMounted = false; };
    }, []);

    // Update local path state if context values change after initial load
    useEffect(() => {
        setSelectedModsFolder(initialModsFolder || '');
        setSelectedQuickLaunch(initialQuickLaunch || '');
    }, [initialModsFolder, initialQuickLaunch]);

    // Handle game switch
    const handleGameSwitch = async (targetGameSlug) => {
        if (targetGameSlug === currentGameForSetup || isSwitchingGame) {
            return;
        }

        setIsSwitchingGame(true);
        setGameSwitchError('');
        toast.info(`正在切换到 ${targetGameSlug.toUpperCase()} 并重启配置流程...`);

        try {
            // This command triggers the restart
            await invoke('switch_game', { targetGameSlug });
            // If successful, the app restarts, and this component re-mounts
            // with the new 'currentGameForSetup' fetched from the backend.
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown switch error');
            console.error("Failed to initiate game switch during setup:", errorString);
            setGameSwitchError(`切换失败: ${errorString}`);
            toast.error(`游戏切换失败: ${errorString}`);
            setIsSwitchingGame(false); // Re-enable interaction
        }
        // No 'finally' needed here as success = restart
    };

    const handleSelectModsFolder = async () => {
        setSaveError('');
        try {
            const result = await invoke('select_directory');
            if (result) { // Check if user selected something (didn't cancel)
                setSelectedModsFolder(result);
            }
        } catch (err) {
            console.error("Error selecting directory:", err);
            setSaveError(`文件选择失败: ${err}`);
        }
    };

    const handleSelectQuickLaunch = async () => {
        setSaveError('');
        try {
            const result = await invoke('select_file');
            if (result) { // Check if user selected something (didn't cancel)
                setSelectedQuickLaunch(result);
            }
        } catch (err) {
            console.error("Error selecting file:", err);
            setSaveError(`Failed to select file: ${err}`);
        }
    };

    const handleSave = async () => {
        if (!selectedModsFolder) {
            setSaveError("必须选择模组文件夹路径才能继续");
            return;
        }
        setIsSaving(true);
        setSaveError('');

        try {
            const saveMods = await updateSetting(SETTINGS_KEY_MODS_FOLDER, selectedModsFolder);
            // Allow saving even if quick launch is empty
            const saveLaunch = await updateSetting(SETTINGS_KEY_QUICK_LAUNCH, selectedQuickLaunch || '');

            if (saveMods && saveLaunch !== false) { // Check explicitly for false failure
                await fetchSettings(); // Reload settings in context
                // App.jsx will handle showing the main UI now
            } else {
                 throw new Error("One or more settings failed to save.");
            }
        } catch (err) {
            console.error("Save error:", err);
            setSaveError(`保存设置失败: ${err.message || err}`);
        } finally {
            setIsSaving(false);
        }
    };

    const isActionDisabled = isSaving || isSwitchingGame;
    const canSave = selectedModsFolder && !isActionDisabled;
    const logoSrc = `/images/logos/${currentGameForSetup || 'default'}.png`;
    const handleLogoError = (e) => { e.target.src = '/images/logos/default.png'; };

    return (
        <div style={styles.container}>
            <div style={styles.card}>

                {/* --- Game Logo and Title --- */}
                <div style={styles.gameHeader}>
                    <img
                        src={logoSrc}
                        alt={`${currentGameForSetup || 'Default'} Logo`}
                        style={styles.gameLogo}
                        onError={handleLogoError}
                    />
                    <h1 style={styles.title}>
                        {currentGameForSetup ? currentGameForSetup.toUpperCase() : '...'} 初始设置
                    </h1>
                </div>
                {/* --- End Game Logo --- */}

                {/* --- Game Selection - UPDATED WITH GAME SWITCHER --- */}
                <div style={styles.gameSelectionBox}>
                    <h3 style={styles.selectionLabel}>当前配置游戏：</h3>
                    
                    <GameSwitcher
                        availableGames={availableGames}
                        activeGame={currentGameForSetup}
                        onGameSwitch={handleGameSwitch}
                        isLoading={isSwitchingGame}
                        error={gameSwitchError || gameLoadError}
                        compact={true}
                        confirmMessage="切换游戏将重置当前配置流程，所有路径选择都将丢失"
                        isSetupMode={true}
                    />
                    
                    <p style={styles.infoText}>切换游戏将会重置当前配置进度</p>
                </div>
                {/* --- End Game Selection --- */}

                <p style={styles.description}>
                    请为 <b>{currentGameForSetup.toUpperCase()}</b> 选择<b>模组文件夹</b>（必填项）
                    <br />
                    可选：选择游戏或启动器可执行文件用于快速启动
                </p>

                {/* Mods Folder Selection */}
                <div style={styles.settingItem}>
                    <label style={styles.label}>模组文件夹：</label>
                    <div style={styles.pathDisplay} title={selectedModsFolder}>
                        {selectedModsFolder || '未选择'}
                    </div>
                    <button onClick={handleSelectModsFolder} disabled={isActionDisabled} className="btn btn-outline">
                        <i className="fas fa-folder-open fa-fw"></i> 选择文件夹
                    </button>
                </div>

                {/* Quick Launch Selection */}
                <div style={styles.settingItem}>
                    <label style={styles.label}>快速启动：</label>
                    <div style={styles.pathDisplay} title={selectedQuickLaunch}>
                        {selectedQuickLaunch || '未选择'}
                    </div>
                    <button onClick={handleSelectQuickLaunch} disabled={isActionDisabled} className="btn btn-outline">
                        <i className="fas fa-file-arrow-up fa-fw"></i> 选择文件
                    </button>
                </div>

                {/* Error Display */}
                {saveError && <p style={styles.errorText}>{saveError}</p>}

                {/* Save Button */}
                <button
                    onClick={handleSave}
                    disabled={!canSave}
                    className="btn btn-primary"
                    style={{ marginTop: '30px', width: '100%' }}
                >
                    {isSaving ? (
                        <><i className="fas fa-spinner fa-spin fa-fw"></i> 保存中...</>
                    ) : (
                        <><i className="fas fa-check fa-fw"></i> 保存并继续</>
                    )}
                </button>
            </div>
        </div>
    );
}

// Updated styles for the setup component
const styles = {
    container: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        width: '100vw',
        backgroundColor: 'var(--darker)', // Match body background
        padding: '20px',
        color: 'var(--light)',
    },
    card: {
        backgroundColor: 'var(--dark)',
        padding: '40px',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
        maxWidth: '600px',
        width: '100%',
        textAlign: 'center',
    },
    gameHeader: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginBottom: '20px',
    },
    gameLogo: {
        width: '80px', // Adjust size as needed
        height: '80px',
        objectFit: 'contain',
        marginBottom: '15px',
        borderRadius: '8px', // Optional rounded corners
        backgroundColor: 'rgba(255,255,255,0.05)', // Slight background for placeholder
    },
    title: {
        fontSize: '28px',
        fontWeight: '600',
        color: 'var(--primary)',
        marginBottom: '15px',
    },
    // New styles for GameSwitcher container
    gameSelectionBox: {
        marginBottom: '25px',
        backgroundColor: 'rgba(0,0,0,0.1)',
        borderRadius: '10px',
        padding: '15px',
    },
    selectionLabel: {
        textAlign: 'left',
        fontSize: '16px',
        fontWeight: '500',
        marginBottom: '15px',
        color: 'rgba(255, 255, 255, 0.9)',
    },
    infoText: { // Small info text below game switcher
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.6)',
        textAlign: 'center',
        marginTop: '10px',
    },
    description: {
        fontSize: '15px',
        color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: '1.6',
        marginBottom: '30px',
    },
    settingItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '15px',
        marginBottom: '20px',
        textAlign: 'left',
        backgroundColor: 'rgba(0,0,0,0.15)',
        padding: '15px',
        borderRadius: '8px',
    },
    label: {
        fontWeight: '500',
        width: '150px', // Fixed width for alignment
        flexShrink: 0,
        fontSize: '14px',
    },
    pathDisplay: {
        flexGrow: 1,
        backgroundColor: 'rgba(0,0,0,0.2)',
        padding: '8px 12px',
        borderRadius: '6px',
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        minWidth: '150px',
    },
    errorText: {
        color: 'var(--danger)',
        marginTop: '15px',
        fontSize: '14px',
        fontWeight: '500',
    }
};


export default FirstLaunchSetup;