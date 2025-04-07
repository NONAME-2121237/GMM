import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import ConfirmationModal from '../components/ConfirmationModal';
import ScanProgressPopup from '../components/ScanProgressPopup';

// Simple inline styles for PresetPage
const styles = {
    container: { padding: '20px' },
    pageHeader: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '25px', paddingBottom: '15px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    },
    pageTitle: { fontSize: '28px', fontWeight: '600' },
    createSection: {
        display: 'flex', gap: '15px', marginBottom: '30px',
        padding: '20px', background: 'var(--card-bg)', borderRadius: '12px',
    },
    input: {
        flexGrow: 1, padding: '10px 15px', backgroundColor: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px',
        color: 'var(--light)', fontSize: '14px', boxSizing: 'border-box',
    },
    presetList: { listStyle: 'none', padding: 0, margin: 0 },
    presetItem: {
        display: 'flex', alignItems: 'center', gap: '15px',
        background: 'var(--card-bg)', padding: '15px 20px', borderRadius: '8px',
        marginBottom: '10px', transition: 'background-color 0.2s ease',
    },
    presetName: { flexGrow: 1, fontWeight: '500' },
    presetActions: { display: 'flex', gap: '10px', alignItems: 'center' },
    iconButton: {
        background: 'none', border: 'none', color: 'var(--light)',
        cursor: 'pointer', fontSize: '16px', padding: '5px', opacity: 0.7,
        transition: 'opacity 0.2s ease',
    },
    iconButtonHover: { // Can't use pseudo-class inline easily
        opacity: 1,
    },
    errorText: { color: 'var(--danger)', fontSize: '14px', marginTop: '10px', textAlign: 'center' },
    placeholderText: { color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', padding: '20px' },
};

// Event names constants (consider moving to a shared file)
const PRESET_APPLY_START_EVENT = "preset://apply_start";
const PRESET_APPLY_PROGRESS_EVENT = "preset://apply_progress";
const PRESET_APPLY_COMPLETE_EVENT = "preset://apply_complete";
const PRESET_APPLY_ERROR_EVENT = "preset://apply_error";

function PresetPage() {
    const [presets, setPresets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [newPresetName, setNewPresetName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [applyingPresetId, setApplyingPresetId] = useState(null);
    const [presetToDelete, setPresetToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    // State for the progress popup
    const [showApplyPopup, setShowApplyPopup] = useState(false);
    const [applyProgressData, setApplyProgressData] = useState(null);
    const [applySummary, setApplySummary] = useState('');
    const [applyError, setApplyError] = useState('');
    const applyListenersRef = useRef({ unlistenStart: null, unlistenProgress: null, unlistenComplete: null, unlistenError: null });

    const fetchPresets = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            const fetchedPresets = await invoke('get_presets');
            setPresets(fetchedPresets);
        } catch (err) {
            console.error("Failed to fetch presets:", err);
            setError(typeof err === 'string' ? err : 'Failed to load presets.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPresets();
    }, [fetchPresets]);

    // --- Listener Effect for Apply Progress ---
    useEffect(() => {
        const setupListeners = async () => {
            applyListenersRef.current.unlistenStart = await listen(PRESET_APPLY_START_EVENT, (event) => {
                console.log("Preset Apply Start:", event.payload);
                setApplyProgressData({ processed: 0, total: event.payload || 0, message: 'Starting...' });
                setApplySummary('');
                setApplyError('');
                setShowApplyPopup(true);
            });
            applyListenersRef.current.unlistenProgress = await listen(PRESET_APPLY_PROGRESS_EVENT, (event) => {
                console.log("Preset Apply Progress:", event.payload);
                // Ensure popup is shown if progress arrives
                setShowApplyPopup(true);
                setApplyProgressData(event.payload);
                setApplySummary('');
                setApplyError('');
            });
            applyListenersRef.current.unlistenComplete = await listen(PRESET_APPLY_COMPLETE_EVENT, (event) => {
                console.log("Preset Apply Complete:", event.payload);
                setApplySummary(event.payload || 'Preset applied successfully!');
                setApplyProgressData(null); // Clear progress data on complete
                setApplyError('');
                setShowApplyPopup(true); // Ensure popup shows completion
                setApplyingPresetId(null); // Re-enable button
            });
            applyListenersRef.current.unlistenError = await listen(PRESET_APPLY_ERROR_EVENT, (event) => {
                console.error("Preset Apply Error:", event.payload);
                setApplyError(event.payload || 'An unknown error occurred during preset application.');
                setApplyProgressData(null); // Clear progress data on error
                setApplySummary('');
                setShowApplyPopup(true); // Ensure popup shows error
                setApplyingPresetId(null); // Re-enable button
            });
        };

        setupListeners();

        return () => {
            console.log("Cleaning up preset apply listeners...");
            applyListenersRef.current.unlistenStart?.();
            applyListenersRef.current.unlistenProgress?.();
            applyListenersRef.current.unlistenComplete?.();
            applyListenersRef.current.unlistenError?.();
        };
    }, []);

    const handleCreatePreset = async (e) => {
        e.preventDefault();
        if (!newPresetName.trim()) return;
        setIsCreating(true);
        setError('');
        try {
            await invoke('create_preset', { name: newPresetName.trim() });
            setNewPresetName('');
            await fetchPresets();
        } catch (err) {
            console.error("Failed to create preset:", err);
            setError(typeof err === 'string' ? err : 'Failed to create preset.');
        } finally {
            setIsCreating(false);
        }
    };

    const handleApplyPreset = async (presetId) => {
        setApplyingPresetId(presetId);
        setError('');
        setApplyError(''); // Clear previous apply error before starting
        setShowApplyPopup(false); // Hide previous popup if any
        setApplyProgressData(null);
        setApplySummary('');

        try {
            await invoke('apply_preset', { presetId });
            // Start event will trigger popup display via listener
        } catch (err) {
            console.error("Failed to invoke apply_preset:", err);
            const errorString = typeof err === 'string' ? err : (err?.message || 'Failed to start preset application');
            setApplyError(errorString);
            setShowApplyPopup(true); // Show popup to display the invocation error
            setApplyingPresetId(null);
        }
    };

    const closeApplyPopup = () => {
        setShowApplyPopup(false);
        setApplyProgressData(null);
        setApplySummary('');
        setApplyError('');
        // Also reset button loading state if popup closed manually during apply
        if (applyingPresetId !== null && !applySummary && !applyError) {
            setApplyingPresetId(null);
        }
    };

    const handleToggleFavorite = async (preset) => {
        setError('');
        const newFavState = !preset.is_favorite;
        try {
            await invoke('toggle_preset_favorite', { presetId: preset.id, isFavorite: newFavState });
            setPresets(current => current.map(p =>
                p.id === preset.id ? { ...p, is_favorite: newFavState } : p
            ));
        } catch (err) {
             console.error("Failed to toggle favorite:", err);
             setError(typeof err === 'string' ? err : 'Failed to update favorite status.');
        }
    };

    const openDeleteModal = (preset) => {
        setPresetToDelete(preset);
        setIsDeleteModalOpen(true);
        setDeleteError('');
    };

    const closeDeleteModal = () => {
        setPresetToDelete(null);
        setIsDeleteModalOpen(false);
        setIsDeleting(false);
        setDeleteError('');
    };

    const confirmDeletePreset = async () => {
        if (!presetToDelete) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await invoke('delete_preset', { presetId: presetToDelete.id });
            await fetchPresets();
            closeDeleteModal();
        } catch (err) {
             console.error("Failed to delete preset:", err);
             setDeleteError(typeof err === 'string' ? err : 'Failed to delete preset.');
             setIsDeleting(false);
        }
    };

    // Determine if *any* preset application is running
    const isApplyingAnyPreset = showApplyPopup && !applySummary && !applyError;

    return (
        <div style={styles.container} className="fadeIn">
            <div style={styles.pageHeader}>
                <h1 style={styles.pageTitle}>Mod Presets</h1>
            </div>

            <form onSubmit={handleCreatePreset} style={styles.createSection}>
                <input
                    type="text"
                    style={styles.input}
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="Enter new preset name..."
                    aria-label="New preset name"
                    disabled={isCreating || isApplyingAnyPreset}
                />
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!newPresetName.trim() || isCreating || isApplyingAnyPreset}
                >
                    {isCreating ? (
                        <><i className="fas fa-spinner fa-spin fa-fw"></i> Saving...</>
                    ) : (
                        <><i className="fas fa-save fa-fw"></i> Create Preset</>
                    )}
                </button>
            </form>

             {error && <p style={styles.errorText}>{error}</p>}

            <div>
                {isLoading ? (
                    <p style={styles.placeholderText}>Loading presets...</p>
                ) : presets.length === 0 ? (
                    <p style={styles.placeholderText}>No presets created yet. Create one above to save your current mod setup.</p>
                ) : (
                    <ul style={styles.presetList}>
                        {presets.map(preset => (
                            <li key={preset.id} style={styles.presetItem}>
                                <span style={styles.presetName}>{preset.name}</span>
                                <div style={styles.presetActions}>
                                    <button
                                        style={styles.iconButton}
                                        onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                                        title="Apply Preset"
                                        onClick={() => handleApplyPreset(preset.id)}
                                        disabled={applyingPresetId === preset.id || isApplyingAnyPreset}
                                    >
                                        {applyingPresetId === preset.id ? (
                                             <i className="fas fa-spinner fa-spin fa-fw"></i>
                                        ) : (
                                             <i className="fas fa-play-circle fa-fw" style={{ color: 'var(--success)' }}></i>
                                         )}
                                    </button>
                                    <button
                                        style={styles.iconButton}
                                        onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                                        title={preset.is_favorite ? "Remove from Favorites" : "Add to Favorites"}
                                        onClick={() => handleToggleFavorite(preset)}
                                        disabled={isApplyingAnyPreset}
                                    >
                                         <i className={`fas fa-star fa-fw`} style={{ color: preset.is_favorite ? 'var(--accent)' : 'inherit' }}></i>
                                     </button>
                                    <button
                                        style={{...styles.iconButton, color: 'var(--danger)'}}
                                        onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                                        title="Delete Preset"
                                        onClick={() => openDeleteModal(preset)}
                                        disabled={isApplyingAnyPreset}
                                    >
                                         <i className="fas fa-trash-alt fa-fw"></i>
                                     </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

             {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && presetToDelete && (
                 <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={closeDeleteModal}
                    onConfirm={confirmDeletePreset}
                    title="Confirm Preset Deletion"
                    confirmText="Delete"
                    confirmButtonVariant="danger"
                    isLoading={isDeleting}
                    errorMessage={deleteError}
                 >
                    Are you sure you want to permanently delete the preset "{presetToDelete.name}"?
                    This action cannot be undone.
                 </ConfirmationModal>
             )}

             {/* Apply Progress Popup */}
            <ScanProgressPopup // Using the same component
                isOpen={showApplyPopup}
                progressData={applyProgressData}
                summary={applySummary}
                error={applyError}
                onClose={closeApplyPopup}
                baseTitle="Applying Preset..." // Pass specific title
            />
        </div>
    );
}

export default PresetPage;