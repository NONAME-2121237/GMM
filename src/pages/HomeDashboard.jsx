// src/pages/HomeDashboard.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { useSettings } from '../contexts/SettingsContext';
import { Link } from 'react-router-dom';
import { open } from '@tauri-apps/api/shell';
import EnhancedLibraryStats from '../components/EnhancedLibraryStats';

// URLs for links with added type information
const GAMEBANANA_URL = "https://gamebanana.com/mods/games/8552";
const USEFUL_URLS = [
    {
        title: "Genshin Wiki", 
        type: "Reference",
        url: "https://genshin-impact.fandom.com/wiki/Genshin_Impact_Wiki", 
        icon: "fas fa-book"
    },
    {
        title: "Paimon.moe", 
        type: "Wish Calculator",
        url: "https://paimon.moe", 
        icon: "fas fa-calculator"
    },
    {
        title: "Interactive Map", 
        type: "Exploration",
        url: "https://act.hoyolab.com/ys/app/interactive-map/index.html", 
        icon: "fas fa-map-marked-alt"
    },
    {
        title: "KQM", 
        type: "Guides",
        url: "https://keqingmains.com", 
        icon: "fas fa-book"
    },
    {
        title: "Genshin Center", 
        type: "Planning",
        url: "https://genshin-center.com/planner", 
        icon: "fas fa-calendar-alt"
    },
];

function HomeDashboard() {
    const {
        isSetupComplete,
        isLoading: settingsLoading,
        customLibraryUrl
    } = useSettings();

    // State for stats
    const [dashboardStats, setDashboardStats] = useState(null);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsError, setStatsError] = useState(null);

    // State for app version
    const [appVersion, setAppVersion] = useState(null);
    const [versionLoading, setVersionLoading] = useState(false);
    const [versionError, setVersionError] = useState(null);

    // State for total count (still needed for initial prompt)
    const [totalAssetCountForPrompt, setTotalAssetCountForPrompt] = useState(null);

    // Combined fetch function
    const fetchDashboardData = useCallback(async () => {
        if (!isSetupComplete) return; // Don't fetch if setup isn't done

        setStatsLoading(true);
        setVersionLoading(true);
        setStatsError(null);
        setVersionError(null);

        try {
            const [statsResult, versionResult] = await Promise.allSettled([
                invoke('get_dashboard_stats'),
                invoke('get_app_version')
            ]);

            if (statsResult.status === 'fulfilled') {
                console.log("Dashboard Stats:", statsResult.value);
                setDashboardStats(statsResult.value);
                // Also update the prompt count if needed
                setTotalAssetCountForPrompt(statsResult.value.total_mods);
            } else {
                console.error("Error fetching dashboard stats:", statsResult.reason);
                setStatsError("Could not load library statistics.");
                setTotalAssetCountForPrompt(-1); // Indicate error for prompt
            }

            if (versionResult.status === 'fulfilled') {
                setAppVersion(versionResult.value);
            } else {
                 console.error("Error fetching app version:", versionResult.reason);
                 setVersionError("Could not load app version.");
            }

        } catch (err) { // Catch potential errors in Promise.all itself (unlikely here)
             console.error("Error fetching dashboard data:", err);
             setStatsError("An unexpected error occurred loading dashboard data.");
             setVersionError("An unexpected error occurred loading dashboard data.");
        } finally {
            setStatsLoading(false);
            setVersionLoading(false);
        }
    }, [isSetupComplete]); // Depend only on setup completion


    // Initial fetch for the prompt logic (can be removed if stats load fast enough)
     useEffect(() => {
        if (isSetupComplete && totalAssetCountForPrompt === null && !dashboardStats) {
            invoke('get_total_asset_count')
                .then(count => setTotalAssetCountForPrompt(count))
                .catch(() => setTotalAssetCountForPrompt(-1)); // Indicate error
        } else if (!isSetupComplete) {
             setTotalAssetCountForPrompt(null); // Reset if setup incomplete
        }
     }, [isSetupComplete, totalAssetCountForPrompt, dashboardStats]);

    // Fetch all dashboard data when setup is complete
    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]); // fetchDashboardData depends on isSetupComplete

    // Handlers (keep existing ones, add openExternalUrl)
    const [actionError, setActionError] = useState(''); // For button errors

    const handleOpenModsFolder = async () => {
        setActionError('');
         try { await invoke('open_mods_folder'); }
         catch (error) { console.error("Failed to open mods folder:", error); setActionError("Failed to open mods folder"); }
    };

    const openExternalUrl = async (url) => {
        setActionError('');
        if (!url) return;
        try {
            await open(url);
        } catch (error) {
             console.error(`Failed to open URL ${url}:`, error);
             setActionError(`Failed to open link: ${error}`);
        }
     };

    const showScanPrompt = isSetupComplete && totalAssetCountForPrompt === 0;

    let customLibraryButtonText = 'Custom Library';
    if (customLibraryUrl) {
        try {
            const url = new URL(customLibraryUrl);
            customLibraryButtonText = url.hostname.replace(/^www\./, '');
        } catch (_) { customLibraryButtonText = 'Custom Link'; }
    }

    return (
        <div className="fadeIn" style={{ position: 'relative', minHeight: 'calc(100vh - 50px)' /* Ensure space for version */ }}>
            <div className="page-header" style={{ borderBottom: 'none', marginBottom: '15px' }}>
                 <h1 className="page-title">Dashboard</h1>
            </div>

            {showScanPrompt && (
                <div style={styles.infoBoxAccent}>
                     <h3 style={styles.infoBoxTitle}><i className="fas fa-info-circle fa-fw"></i> Action Recommended</h3>
                     <p>Setup is complete, but no mods are in the library yet.</p>
                     <p style={{ marginTop: '5px' }}>
                         Go to <Link to="/settings" style={styles.inlineLink}>Settings</Link> and click "Scan Now".
                    </p>
                </div>
            )}

             {/* --- Action Buttons Row --- */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '20px' }}>
                 <button className="btn btn-outline" onClick={handleOpenModsFolder} disabled={settingsLoading || !isSetupComplete} title={!isSetupComplete ? "Complete setup first" : "Open your configured Mods folder"}>
                     <i className="fas fa-folder-open fa-fw"></i> Mods Folder
                 </button>
                 <button className="btn btn-outline" onClick={() => openExternalUrl(GAMEBANANA_URL)} title="Open GameBanana Genshin Mods page">
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


             {/* --- Main Content Columns --- */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>

                {/* Enhanced Stats Box */}
                <div style={styles.card}>
                    <h3 style={styles.cardTitle}>Library Stats</h3>
                    {/* Use the new EnhancedLibraryStats component */}
                    <EnhancedLibraryStats 
                        stats={dashboardStats} 
                        loading={statsLoading} 
                        error={statsError}
                    />
                </div>

                {/* Useful Links Box */}
                <div style={styles.card}>
                    <h3 style={styles.cardTitle}>Useful Links</h3>
                     <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {USEFUL_URLS.map((link, index) => (
                            <button 
                                key={index} 
                                className="btn btn-outline link-btn" 
                                onClick={() => openExternalUrl(link.url)}
                                style={styles.linkButton}
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

            </div> {/* End Grid */}


            {/* App Version Display */}
            {(appVersion || versionError) && (
                 <div style={styles.versionDisplay} title={versionError || ''}>
                     {versionLoading ? '...' : (versionError ? 'v?.?.?' : `v${appVersion}`)}
                 </div>
            )}

            {/* Add CSS animations */}
            <style>{`
                .link-btn {
                    transition: all 0.2s ease-in-out !important;
                    overflow: hidden !important;
                    position: relative !important;
                }
                
                .link-btn:hover {
                    transform: translateY(-2px) !important;
                    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1) !important;
                }
                
                .link-btn:active {
                    transform: translateY(0) !important;
                }
                
                .link-btn::after {
                    content: '';
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 100%;
                    height: 3px;
                    background: linear-gradient(90deg, var(--primary), var(--accent));
                    transform: scaleX(0);
                    transform-origin: right;
                    transition: transform 0.3s ease-out;
                }
                
                .link-btn:hover::after {
                    transform: scaleX(1);
                    transform-origin: left;
                }
            `}</style>

        </div>
    );
}

// Enhanced styles with link button styling
const styles = {
    card: { padding: '20px', background: 'var(--card-bg)', borderRadius: '12px', },
    cardTitle: { marginBottom: '15px', fontWeight: '600', fontSize: '18px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px' },
    infoBoxAccent: {
        padding: '20px', background: 'rgba(var(--accent-rgb, 255 159 67) / 0.1)',
        border: '1px solid var(--accent)', borderRadius: '12px', marginBottom: '20px',
        color: 'var(--accent)'
    },
    infoBoxTitle: { marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: '600' },
    inlineLink: { color: 'var(--primary)', fontWeight: '500', textDecoration: 'underline' },
    versionDisplay: {
        position: 'absolute', bottom: '10px', right: '15px', fontSize: '11px',
        color: 'rgba(255,255,255,0.4)', zIndex: 1, userSelect: 'none'
    },
    // New link button styles
    linkButton: {
        padding: '12px 15px',
        textAlign: 'left',
        height: 'auto',
        width: '100%'
    },
    linkContent: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%'
    },
    linkMain: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px'
    },
    linkIcon: {
        color: 'var(--primary)',
        fontSize: '16px'
    },
    linkTitle: {
        fontWeight: '500'
    },
    linkType: {
        fontSize: '12px',
        padding: '3px 8px',
        borderRadius: '12px',
        background: 'rgba(var(--primary-rgb), 0.15)',
        color: 'var(--primary)',
        fontWeight: '500',
        letterSpacing: '0.5px',
        textTransform: 'uppercase'
    }
};

export default HomeDashboard;