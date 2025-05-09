// src/contexts/SettingsContext.jsx
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

const SettingsContext = createContext(null);

export const SETTINGS_KEY_MODS_FOLDER = "mods_folder_path";
export const SETTINGS_KEY_QUICK_LAUNCH = "quick_launch_path";
export const SETTINGS_KEY_CUSTOM_LIBRARY_URL = "custom_library_url";

export function SettingsProvider({ children }) {
    const [modsFolder, setModsFolder] = useState(null);
    const [quickLaunchPath, setQuickLaunchPath] = useState(null);
    const [customLibraryUrl, setCustomLibraryUrl] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchSettings = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            // Fetch all settings together
            const [folderResult, launchResult, libraryResult] = await Promise.all([
                invoke('get_setting', { key: SETTINGS_KEY_MODS_FOLDER }),
                invoke('get_setting', { key: SETTINGS_KEY_QUICK_LAUNCH }),
                invoke('get_setting', { key: SETTINGS_KEY_CUSTOM_LIBRARY_URL })
            ]);
            console.log("Fetched Settings:", { folderResult, launchResult, libraryResult });
            setModsFolder(folderResult || '');
            setQuickLaunchPath(launchResult || '');
            setCustomLibraryUrl(libraryResult || '');
        } catch (err) {
            console.error("Failed to fetch settings:", err);
            setError("无法加载应用程序设置");
            setModsFolder('');
            setQuickLaunchPath('');
            setCustomLibraryUrl(''); // Reset on error
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
            } else if (key === SETTINGS_KEY_CUSTOM_LIBRARY_URL) {
                setCustomLibraryUrl(value);
            }
            return true; // Indicate success
        } catch (err) {
            console.error(`Failed to set setting ${key}:`, err);
            setError(`保存设置失败: ${key}`);
            return false; // Indicate failure
        }
    }, []);

    // Setup completion check remains the same (custom URL is optional)
    const isSetupComplete = !isLoading && !!modsFolder;

    const value = {
        modsFolder,
        quickLaunchPath,
        customLibraryUrl,
        isLoading,
        error,
        fetchSettings,
        updateSetting,
        isSetupComplete,
        SETTINGS_KEY_MODS_FOLDER,
        SETTINGS_KEY_QUICK_LAUNCH,
        SETTINGS_KEY_CUSTOM_LIBRARY_URL
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
        throw new Error('useSettings必须在SettingsProvider内使用');
    }
    return context;
}