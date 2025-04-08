// src/utils/localStorage.js

export const getLocalStorageItem = (key, defaultValue = null) => {
    try {
        const item = localStorage.getItem(key);
        // Handle null, undefined, or empty string cases for parsing
        if (item === null || item === undefined || item === '') {
            return defaultValue;
        }
        // Attempt to parse if it looks like JSON, otherwise return as string
        try {
            return JSON.parse(item);
        } catch (e) {
            // If parsing fails, assume it was stored as a plain string
            return item;
        }
    } catch (error) {
        console.error(`Error reading localStorage key "${key}":`, error);
        return defaultValue;
    }
};

export const setLocalStorageItem = (key, value) => {
    try {
        // Store objects/arrays as JSON strings, others directly
        const valueToStore = (typeof value === 'object' && value !== null)
            ? JSON.stringify(value)
            : value;
        localStorage.setItem(key, valueToStore);
    } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
    }
};