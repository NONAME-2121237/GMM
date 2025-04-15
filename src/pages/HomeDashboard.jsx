// src/pages/HomeDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useSettings } from '../contexts/SettingsContext';
import { Link } from 'react-router-dom';
import { open } from '@tauri-apps/api/shell';
import { ask } from '@tauri-apps/api/dialog'; // Import ask dialog
import EnhancedLibraryStats from '../components/EnhancedLibraryStats';
import GameSwitcher from '../components/GameSwitcher'; // Import our new component
import { toast } from 'react-toastify';

// URLs (keep as before)
const GAME_LINKS = {
    "genshin": {
        "GAMEBANANA": "https://gamebanana.com/mods/games/8552",
        "USEFUL_URLS": [
            { title: "Genshin Wiki", type: "Reference", url: "https://genshin-impact.fandom.com/wiki/Genshin_Impact_Wiki", icon: "fas fa-book" },
            { title: "Paimon.moe", type: "Wish Calculator", url: "https://paimon.moe", icon: "fas fa-calculator" },
            { title: "Interactive Map", type: "Exploration", url: "https://act.hoyolab.com/ys/app/interactive-map/index.html", icon: "fas fa-map-marked-alt" },
            { title: "KQM", type: "Guides", url: "https://keqingmains.com", icon: "fas fa-book" },
            { title: "Genshin Center", type: "Planning", url: "https://genshin-center.com/planner", icon: "fas fa-calendar-alt" },
        ]
    },
    "zzz": {
        "GAMEBANANA": "https://gamebanana.com/mods/games/19567",
        "USEFUL_URLS": [
            { title: "ZZZ Wiki", type: "Reference", url: "https://zenless-zone-zero.fandom.com/wiki/Zenless_Zone_Zero_Wiki", icon: "fas fa-book" },
            { title: "ZZZ Database", type: "Database", url: "https://zzz.gg/", icon: "fas fa-database" },
        ]
    },
    "hsr": {
        "GAMEBANANA": "https://gamebanana.com/mods/games/18366",
        "USEFUL_URLS": [
            { title: "HSR Wiki", type: "Reference", url: "https://honkai-star-rail.fandom.com/wiki/Honkai:_Star_Rail_Wiki", icon: "fas fa-book" },
            { title: "KQM", type: "Guides", url: "https://hsr.keqingmains.com", icon: "fas fa-book" },
            { title: "HSR Database", type: "Database", url: "https://www.prydwen.gg/star-rail/", icon: "fas fa-database" },
        ]
    },
    "wuwa": {
        "GAMEBANANA": "https://gamebanana.com/mods/games/20357",
        "USEFUL_URLS": [
            { title: "WuWa Wiki", type: "Reference", url: "https://wutheringwaves.fandom.com/wiki/Wuthering_Waves_Wiki", icon: "fas fa-book" },
            { title: "DotGG", type: "Guides", url: "https://wutheringwaves.gg", icon: "fas fa-book" },
            { title: "WuWa Database", type: "Database", url: "https://www.prydwen.gg/wuthering-waves/", icon: "fas fa-database" },
        ]
    }
};

function HomeDashboard() {
    const { isSetupComplete, isLoading: settingsLoading, customLibraryUrl } = useSettings();

    // Stats State
    const [dashboardStats, setDashboardStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(true); // Start true initially
    const [statsError, setStatsError] = useState(null);

    // Version State
    const [appVersion, setAppVersion] = useState(null);
    const [versionLoading, setVersionLoading] = useState(true);
    const [versionError, setVersionError] = useState(null);

    // Action Button State
    const [actionError, setActionError] = useState('');

    // --- Game Switching State ---
    const [availableGames, setAvailableGames] = useState([]);
    const [activeGame, setActiveGame] = useState('');
    const [isSwitchingGame, setIsSwitchingGame] = useState(false);
    const [gameSwitchError, setGameSwitchError] = useState('');
    const [needsRestart, setNeedsRestart] = useState(false);
    // --------------------------

    // --- Fetch Stats, Version, and Game Data ---
    const fetchDashboardData = useCallback(async () => {
        if (!isSetupComplete) {
            // If setup isn't complete, reset loading states
            setStatsLoading(false);
            setVersionLoading(false);
            return;
        }

        setStatsLoading(true);
        setVersionLoading(true);
        setStatsError(null);
        setVersionError(null);
        setGameSwitchError(''); // Clear game switch error on data refresh

        try {
            const [statsResult, versionResult, gamesResult, activeGameResult] = await Promise.allSettled([
                invoke('get_dashboard_stats'),
                invoke('get_app_version'),
                invoke('get_available_games'),
                invoke('get_active_game')
            ]);

            // Handle Stats
            if (statsResult.status === 'fulfilled') {
                setDashboardStats(statsResult.value);
            } else {
                console.error("Error fetching dashboard stats:", statsResult.reason);
                setStatsError("Could not load library statistics.");
                setDashboardStats(null); // Ensure stats are cleared on error
            }

            // Handle Version
            if (versionResult.status === 'fulfilled') {
                setAppVersion(versionResult.value);
            } else {
                 console.error("Error fetching app version:", versionResult.reason);
                 setVersionError("Could not load app version.");
            }

            // Handle Available Games
            if (gamesResult.status === 'fulfilled') {
                setAvailableGames(gamesResult.value || []);
            } else {
                console.error("Error fetching available games:", gamesResult.reason);
                setGameSwitchError("Could not load game list.");
                setAvailableGames([]);
            }

             // Handle Active Game
             if (activeGameResult.status === 'fulfilled') {
                 setActiveGame(activeGameResult.value || '');
             } else {
                 console.error("Error fetching active game:", activeGameResult.reason);
                 setGameSwitchError("Could not load active game.");
                 setActiveGame('');
             }

        } catch (err) {
             console.error("Error fetching dashboard data:", err);
             setStatsError("An unexpected error occurred loading dashboard data.");
             setVersionError("An unexpected error occurred loading dashboard data.");
        } finally {
            setStatsLoading(false);
            setVersionLoading(false);
        }
    }, [isSetupComplete]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]); // Refetch when setup status changes
    // --- End Fetch Data ---

    // Handlers
    const handleOpenModsFolder = async () => {
        setActionError('');
         try { await invoke('open_mods_folder'); }
         catch (error) { console.error("Failed to open mods folder:", error); setActionError("Failed to open mods folder"); }
    };

    const openExternalUrl = async (url) => {
        setActionError('');
        if (!url) return;
        try { await open(url); }
        catch (error) { console.error(`Failed to open URL ${url}:`, error); setActionError(`Failed to open link: ${error}`); }
     };

    // --- Handle Game Switch ---
    const handleGameSwitch = async (targetGameSlug) => {
        if (targetGameSlug === activeGame || isSwitchingGame) return;

        setIsSwitchingGame(true);
        setGameSwitchError('');
        setNeedsRestart(false);

        try {
            const resultMessage = await invoke('switch_game', { targetGameSlug });
            setActiveGame(targetGameSlug);
            setNeedsRestart(true);
            toast.success(resultMessage);
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown switch error');
            console.error("Failed to switch game:", errorString);
            setGameSwitchError(`Failed to switch: ${errorString}`);
            setNeedsRestart(false);
        } finally {
            setIsSwitchingGame(false);
        }
    };
    // --------------------------

    const showScanPrompt = isSetupComplete && !statsLoading && dashboardStats?.total_mods === 0;

    let customLibraryButtonText = 'Custom Library';
    if (customLibraryUrl) {
        try {
            const url = new URL(customLibraryUrl);
            customLibraryButtonText = url.hostname.replace(/^www\./, '');
        } catch (_) { customLibraryButtonText = 'Custom Link'; }
    }

    return (
        <div className="fadeIn" style={{ position: 'relative', minHeight: 'calc(100vh - 50px)' }}>
            <div className="page-header" style={{ borderBottom: 'none', marginBottom: '15px' }}>
                 <h1 className="page-title">Dashboard</h1>
            </div>

            {/* Action Buttons Row */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                 <button className="btn btn-outline" onClick={handleOpenModsFolder} disabled={settingsLoading || !isSetupComplete} title={!isSetupComplete ? "Complete setup first" : "Open your configured Mods folder"}>
                     <i className="fas fa-folder-open fa-fw"></i> Mods Folder
                 </button>
                 <button className="btn btn-outline" onClick={() => openExternalUrl(GAME_LINKS[activeGame].GAMEBANANA)} title="Open GameBanana Genshin Mods page">
                     <i className="fas fa-external-link-alt fa-fw"></i> GameBanana
                 </button>
                 {customLibraryUrl && (
                     <button className="btn btn-outline" onClick={() => openExternalUrl(customLibraryUrl)} title={`Open: ${customLibraryUrl}`}>
                         <i className="fas fa-external-link-alt fa-fw"></i> {customLibraryButtonText}
                     </button>
                 )}
                 <Link to="/settings" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
                     <i className="fas fa-cog fa-fw"></i> Settings
                 </Link>
            </div>
            {actionError && <p style={{ color: 'var(--danger)', fontSize: '12px', marginBottom: '15px' }}>{actionError}</p>}

            {/* RESTART NOTICE */}
            {needsRestart && (
                <div style={styles.restartNotice}>
                    <i className="fas fa-exclamation-triangle fa-fw"></i>
                    Game switched successfully. **Please restart the application** for changes to take full effect.
                </div>
            )}

            {/* Scan Prompt */}
            {showScanPrompt && !needsRestart && ( // Don't show scan prompt if restart is needed
                <div style={styles.infoBoxAccent}>
                     <h3 style={styles.infoBoxTitle}><i className="fas fa-info-circle fa-fw"></i> Action Recommended</h3>
                     <p>Setup is complete, but no mods are in the library for <b>{activeGame.toUpperCase()}</b>.</p>
                     <p style={{ marginTop: '5px' }}>
                         Go to <Link to="/settings" style={styles.inlineLink}>Settings</Link> and click "Scan Now".
                    </p>
                </div>
            )}


             {/* --- Main Content Columns --- */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '25px' }}> {/* Adjusted column ratio */}

                {/* --- Left Column: Stats --- */}
                <div style={styles.card}>
                    <h3 style={styles.cardTitle}>Library Stats ({activeGame})</h3>
                    <EnhancedLibraryStats
                        stats={dashboardStats}
                        loading={statsLoading}
                        error={statsError}
                    />
                </div>

                {/* --- Right Column: Game Switch & Links --- */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
                    {/* Game Switch Box */}
                    <div style={styles.card}>
                        <h3 style={styles.cardTitle}>Switch Game</h3>
                        {/* Replace the dropdown with our new GameSwitcher component */}
                        <GameSwitcher
                            availableGames={availableGames}
                            activeGame={activeGame}
                            onGameSwitch={handleGameSwitch}
                            isLoading={isSwitchingGame}
                            error={gameSwitchError}
                        />
                        {!gameSwitchError && <p style={styles.infoTextSmall}>Restart required after switching.</p>}
                    </div>

                    {/* Useful Links Box */}
                    <div style={styles.card}>
                        <h3 style={styles.cardTitle}>Useful Links</h3>
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {GAME_LINKS[activeGame]?.USEFUL_URLS.map((link, index) => (
                                <button
                                    key={index}
                                    className="btn btn-outline link-btn"
                                    onClick={() => openExternalUrl(link.url)}
                                    style={styles.linkButton}
                                    title={`Open ${link.title}`}
                                >
                                    <div style={styles.linkContent}>
                                        <div style={styles.linkMain}>
                                            <i className={`${link.icon} fa-fw`} style={styles.linkIcon}></i>
                                            <span style={styles.linkTitle}>{link.title}</span>
                                        </div>
                                        <span style={styles.linkType}>{link.type}</span>
                                    </div>
                                </button>
                            ))}
                         </div>
                    </div>
                </div>

            </div> {/* End Main Grid */}


            {/* App Version Display */}
            {(appVersion || versionError) && (
                 <div style={styles.versionDisplay} title={versionError || ''}>
                     {versionLoading ? '...' : (versionError ? 'v?.?.?' : `v${appVersion}`)}
                 </div>
            )}

            {/* Keep Link Button Animations */}
            <style>{`
                .link-btn{transition:all .2s ease-in-out!important;overflow:hidden!important;position:relative!important}.link-btn:hover{transform:translateY(-2px)!important;box-shadow:0 4px 8px rgba(0,0,0,.1)!important}.link-btn:active{transform:translateY(0)!important}.link-btn::after{content:'';position:absolute;bottom:0;left:0;width:100%;height:3px;background:linear-gradient(90deg,var(--primary),var(--accent));transform:scaleX(0);transform-origin:right;transition:transform .3s ease-out}.link-btn:hover::after{transform:scaleX(1);transform-origin:left}
                
                /* Fade In Animation */
                @keyframes fadeIn {
                  from { opacity: 0; transform: translateY(10px); }
                  to { opacity: 1; transform: translateY(0); }
                }
                .fadeIn {
                  animation: fadeIn 0.5s ease-out forwards;
                }
            `}</style>

        </div>
    );
}

// Styles (add/adjust as needed)
const styles = {
    card: { padding: '20px', background: 'var(--card-bg)', borderRadius: '12px', },
    cardTitle: { marginBottom: '15px', fontWeight: '600', fontSize: '18px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' },
    infoBoxAccent: { padding: '20px', background: 'rgba(var(--accent-rgb, 255 159 67) / 0.1)', border: '1px solid var(--accent)', borderRadius: '12px', marginBottom: '20px', color: 'var(--accent)' },
    infoBoxTitle: { marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600' },
    inlineLink: { color: 'var(--primary)', fontWeight: '500', textDecoration: 'underline' },
    versionDisplay: { position: 'absolute', bottom: '10px', right: '15px', fontSize: '11px', color: 'rgba(255,255,255,0.4)', zIndex: 1, userSelect: 'none' },
    errorTextSmall: { color: 'var(--danger)', fontSize: '12px', marginTop: '8px', textAlign: 'left' },
    infoTextSmall: { color: 'rgba(255,255,255,0.6)', fontSize: '12px', marginTop: '8px', textAlign: 'left' },
    restartNotice: { backgroundColor: 'rgba(var(--accent-rgb), 0.15)', color: 'var(--accent)', border: '1px solid rgba(var(--accent-rgb), 0.5)', borderRadius: '8px', padding: '15px 20px', marginBottom: '20px', fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '10px', },
    // Link button styles from previous iteration
    linkButton: { padding: '12px 15px', textAlign: 'left', height: 'auto', width: '100%' },
    linkContent: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' },
    linkMain: { display: 'flex', alignItems: 'center', gap: '10px' },
    linkIcon: { color: 'var(--primary)', fontSize: '16px' },
    linkTitle: { fontWeight: '500' },
    linkType: { fontSize: '12px', padding: '3px 8px', borderRadius: '12px', background: 'rgba(var(--primary-rgb), 0.15)', color: 'var(--primary)', fontWeight: '500', letterSpacing: '0.5px', textTransform: 'uppercase' }
};

export default HomeDashboard;