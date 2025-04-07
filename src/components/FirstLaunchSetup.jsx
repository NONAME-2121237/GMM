// src/components/FirstLaunchSetup.jsx
import React, { useState, useEffect } from 'react';
import { useSettings } from '../contexts/SettingsContext';
import { invoke } from '@tauri-apps/api/tauri';

function FirstLaunchSetup() {
    const {
        modsFolder: initialModsFolder, // Get initial values from context
        quickLaunchPath: initialQuickLaunch,
        updateSetting,
        fetchSettings, // To reload settings state in provider after save
        SETTINGS_KEY_MODS_FOLDER,
        SETTINGS_KEY_QUICK_LAUNCH
    } = useSettings();

    // Local state for the setup screen
    const [selectedModsFolder, setSelectedModsFolder] = useState(initialModsFolder || '');
    const [selectedQuickLaunch, setSelectedQuickLaunch] = useState(initialQuickLaunch || '');
    const [isSaving, setIsSaving] = useState(false);
    const [saveError, setSaveError] = useState('');

    // Update local state if context values change (e.g., fetched after initial load)
    useEffect(() => {
        setSelectedModsFolder(initialModsFolder || '');
        setSelectedQuickLaunch(initialQuickLaunch || '');
    }, [initialModsFolder, initialQuickLaunch]);

    const handleSelectModsFolder = async () => {
        setSaveError('');
        try {
            const result = await invoke('select_directory');
            if (result) { // Check if user selected something (didn't cancel)
                setSelectedModsFolder(result);
            }
        } catch (err) {
            console.error("Error selecting directory:", err);
            setSaveError(`Failed to select folder: ${err}`);
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
        if (!selectedModsFolder || !selectedQuickLaunch) {
            setSaveError("Both paths must be selected before continuing.");
            return;
        }
        setIsSaving(true);
        setSaveError('');

        try {
            // Save both settings
            const saveMods = await updateSetting(SETTINGS_KEY_MODS_FOLDER, selectedModsFolder);
            const saveLaunch = await updateSetting(SETTINGS_KEY_QUICK_LAUNCH, selectedQuickLaunch);

            if (saveMods && saveLaunch) {
                // Important: Refetch settings in the provider to update global state
                // which will trigger the conditional rendering in App.jsx
                await fetchSettings();
                // No navigation needed, App.jsx will re-render
            } else {
                 throw new Error("One or more settings failed to save.");
            }
        } catch (err) {
            console.error("Save error:", err);
            setSaveError(`Failed to save settings: ${err.message || err}`);
        } finally {
            setIsSaving(false);
        }
    };

    const canSave = selectedModsFolder && selectedQuickLaunch && !isSaving;

    return (
        <div style={styles.container}>
            <div style={styles.card}>
                <h1 style={styles.title}>Initial Setup</h1>
                <p style={styles.description}>
                    Please select your main Mods folder
                    and the game or mod launcher executable for the Quick Launch button.
                </p>

                {/* Mods Folder Selection */}
                <div style={styles.settingItem}>
                    <label style={styles.label}>Mods Folder:</label>
                    <div style={styles.pathDisplay}>
                        {selectedModsFolder ? `...${selectedModsFolder.slice(-50)}` : 'Not Selected'}
                    </div>
                    <button onClick={handleSelectModsFolder} disabled={isSaving} className="btn btn-outline">
                         <i className="fas fa-folder-open fa-fw"></i> Select Folder
                    </button>
                </div>

                {/* Quick Launch Selection */}
                <div style={styles.settingItem}>
                    <label style={styles.label}>Quick Launch File:</label>
                    <div style={styles.pathDisplay}>
                        {selectedQuickLaunch ? `...${selectedQuickLaunch.slice(-50)}` : 'Not Selected'}
                    </div>
                    <button onClick={handleSelectQuickLaunch} disabled={isSaving} className="btn btn-outline">
                         <i className="fas fa-file-arrow-up fa-fw"></i> Select File
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
                        <><i className="fas fa-spinner fa-spin fa-fw"></i> Saving...</>
                    ) : (
                        <><i className="fas fa-check fa-fw"></i> Save & Continue</>
                    )}
                </button>
            </div>
        </div>
    );
}

// Basic inline styles for the setup component
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
    title: {
        fontSize: '28px',
        fontWeight: '600',
        color: 'var(--primary)',
        marginBottom: '15px',
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