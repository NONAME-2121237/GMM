// src/contexts/SettingsContext.jsx
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

const SettingsContext = createContext(null);

export const SETTINGS_KEY_MODS_FOLDER = "mods_folder_path";
export const SETTINGS_KEY_QUICK_LAUNCH = "quick_launch_path";

export function SettingsProvider({ children }) {
    const [modsFolder, setModsFolder] = useState(null);
    const [quickLaunchPath, setQuickLaunchPath] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [folderResult, launchResult] = await Promise.all([
                invoke('get_setting', { key: SETTINGS_KEY_MODS_FOLDER }),
                invoke('get_setting', { key: SETTINGS_KEY_QUICK_LAUNCH })
            ]);
            console.log("Fetched Settings:", { folderResult, launchResult });
            setModsFolder(folderResult || ''); // Use empty string if null/undefined
            setQuickLaunchPath(launchResult || ''); // Use empty string if null/undefined
        } catch (err) {
            console.error("Failed to fetch settings:", err);
            setError("Could not load application settings.");
            setModsFolder(''); // Set to empty on error
            setQuickLaunchPath(''); // Set to empty on error
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const updateSetting = useCallback(async (key, value) => {
        try {
            await invoke('set_setting', { key, value });
            // Update local state after successful save
            if (key === SETTINGS_KEY_MODS_FOLDER) {
                setModsFolder(value);
            } else if (key === SETTINGS_KEY_QUICK_LAUNCH) {
                setQuickLaunchPath(value);
            }
            return true; // Indicate success
        } catch (err) {
            console.error(`Failed to set setting ${key}:`, err);
            // Optionally set an error state to show in UI
            setError(`Failed to save setting: ${key}`);
            return false; // Indicate failure
        }
    }, []);

    // Determine if setup is complete (both paths non-empty)
    // Only consider setup complete *after* initial loading is done
    const isSetupComplete = !isLoading && !!modsFolder && !!quickLaunchPath;

    const value = {
        modsFolder,
        quickLaunchPath,
        isLoading,
        error,
        fetchSettings, // Expose fetch function if needed externally
        updateSetting,
        isSetupComplete,
        SETTINGS_KEY_MODS_FOLDER, // Expose keys for consistency
        SETTINGS_KEY_QUICK_LAUNCH
    };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
}

export function useSettings() {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
}