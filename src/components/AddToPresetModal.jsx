import React, { useState, useEffect, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { invoke } from '@tauri-apps/api/tauri';
import Select from 'react-select'; // Assuming react-select is installed
import { toast } from 'react-toastify';

// Re-use react-select styles from ImportModModal or define specific ones
const reactSelectStyles = {
    control: (base, state) => ({ /* ... control styles ... */
        ...base,
        backgroundColor: 'rgba(0,0,0,0.2)',
        borderColor: state.isFocused ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
        boxShadow: state.isFocused ? '0 0 0 1px var(--primary)' : 'none',
        color: 'var(--light)',
        minHeight: '40px',
        '&:hover': { borderColor: 'var(--primary)' },
    }),
    valueContainer: base => ({ ...base, padding: '2px 8px' }),
    multiValue: base => ({
        ...base,
        backgroundColor: 'rgba(156, 136, 255, 0.2)', // primary color bg for tags
        borderRadius: '4px',
    }),
    multiValueLabel: base => ({ ...base, color: 'var(--light)', padding: '3px 6px' }),
    multiValueRemove: base => ({
        ...base, color: 'var(--light)', borderRadius: '0 4px 4px 0',
        '&:hover': { backgroundColor: 'var(--danger)', color: 'white' },
    }),
    singleValue: base => ({ ...base, color: 'var(--light)' }),
    placeholder: base => ({ ...base, color: 'rgba(255, 255, 255, 0.5)'}),
    input: base => ({ ...base, color: 'var(--light)', margin: '0px', padding: '0px' }),
    indicatorSeparator: base => ({ ...base, backgroundColor: 'rgba(255, 255, 255, 0.1)' }),
    dropdownIndicator: (base, state) => ({ /* ... */
        ...base,
        color: state.isFocused ? 'var(--primary)' : 'rgba(255, 255, 255, 0.5)',
        padding: '8px',
        '&:hover': { color: 'var(--primary)' },
    }),
    clearIndicator: base => ({ /* ... */
        ...base,
        color: 'rgba(255, 255, 255, 0.5)',
        padding: '8px',
        '&:hover': { color: 'var(--danger)' },
    }),
    menu: base => ({ /* ... menu styles ... */
        ...base,
        backgroundColor: 'var(--dark)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        zIndex: 1100, // Ensure dropdown is above modal overlay
    }),
    menuList: base => ({ ...base, padding: '4px 0', maxHeight: '200px' }),
    option: (base, state) => ({ /* ... option styles ... */
        ...base,
        backgroundColor: state.isSelected ? 'var(--primary)' : state.isFocused ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
        color: state.isSelected ? 'white' : 'var(--light)',
        padding: '10px 15px',
        cursor: 'pointer',
        '&:active': { backgroundColor: state.isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.2)' },
    }),
    noOptionsMessage: base => ({ /* ... */
        ...base,
        color: 'rgba(255, 255, 255, 0.6)',
        padding: '10px 15px',
    }),
};


// Basic inline styles
const styles = {
    overlay: { /* ... same as ConfirmationModal overlay ... */
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 1050,
        backdropFilter: 'blur(5px)',
    },
    modal: { /* ... similar modal style ... */
        background: 'var(--dark)', padding: '30px 40px', borderRadius: '12px',
        boxShadow: '0 5px 25px rgba(0, 0, 0, 0.4)', color: 'var(--light)',
        minWidth: '400px', maxWidth: '550px', textAlign: 'center',
    },
    title: {
        fontSize: '20px', fontWeight: '600', marginBottom: '10px',
        color: 'var(--primary)',
    },
    subtitle: {
        fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: '10px',
    },
    label: {
        display: 'block', marginBottom: '8px', fontSize: '14px',
        fontWeight: '500', color: 'rgba(255, 255, 255, 0.8)', textAlign: 'left',
    },
    selectContainer: { marginBottom: '25px' },
    buttonGroup: {
        display: 'flex', justifyContent: 'flex-end', gap: '15px',
        marginTop: '25px', paddingTop: '15px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },
    errorText: { color: 'var(--danger)', marginTop: '15px', fontSize: '14px' },
};


function AddToPresetModal({ assetId, assetName, isOpen, onClose }) {
    const [allPresets, setAllPresets] = useState([]);
    const [selectedPresets, setSelectedPresets] = useState([]); // Array of { value, label } options
    const [isLoadingPresets, setIsLoadingPresets] = useState(true);
    const [isAdding, setIsAdding] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal closes
            setSelectedPresets([]);
            setError('');
            return;
        }

        setIsLoadingPresets(true);
        setError('');
        invoke('get_presets')
            .then(fetchedPresets => {
                setAllPresets(fetchedPresets || []);
            })
            .catch(err => {
                console.error("Failed to fetch presets:", err);
                setError("Could not load presets list.");
                setAllPresets([]);
            })
            .finally(() => {
                setIsLoadingPresets(false);
            });
    }, [isOpen]);

    const presetOptions = useMemo(() => {
        return allPresets.map(p => ({ value: p.id, label: p.name }));
    }, [allPresets]);

    const handleConfirmAdd = async () => {
        if (selectedPresets.length === 0) {
            setError("Please select at least one preset.");
            return;
        }
        setIsAdding(true);
        setError('');
        const presetIds = selectedPresets.map(option => option.value);

        try {
            await invoke('add_asset_to_presets', { assetId, presetIds });
            toast.success(`Added "${assetName}" to ${presetIds.length} preset(s).`);
            onClose(); // Close modal on success
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown error');
            console.error("Failed to add asset to presets:", errorString);
            setError(`Failed to add: ${errorString}`);
            toast.error(`Failed to add "${assetName}" to presets.`);
        } finally {
            setIsAdding(false);
        }
    };

    if (!isOpen) {
        return null;
    }

    return ReactDOM.createPortal(
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h2 style={styles.title}>Add to Presets</h2>
                <p style={styles.subtitle}>Mod: {assetName}</p>

                <div style={styles.selectContainer}>
                    <label htmlFor="preset-select" style={styles.label}>Select Presets:</label>
                    <Select
                        id="preset-select"
                        isMulti
                        options={presetOptions}
                        value={selectedPresets}
                        onChange={setSelectedPresets}
                        isLoading={isLoadingPresets}
                        isDisabled={isAdding || isLoadingPresets}
                        placeholder={isLoadingPresets ? "Loading..." : "Type or select presets..."}
                        styles={reactSelectStyles}
                        closeMenuOnSelect={false} // Keep menu open for multi-select
                        menuPosition={'fixed'} // Prevent menu being clipped by modal
                    />
                </div>

                {error && <p style={styles.errorText}>{error}</p>}

                <div style={styles.buttonGroup}>
                    <button className="btn btn-outline" onClick={onClose} disabled={isAdding}>
                        Cancel
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleConfirmAdd}
                        disabled={isAdding || isLoadingPresets || selectedPresets.length === 0}
                    >
                        {isAdding ? (
                            <><i className="fas fa-spinner fa-spin fa-fw"></i> Adding...</>
                        ) : (
                            <><i className="fas fa-plus fa-fw"></i> Add to Selected</>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default AddToPresetModal;