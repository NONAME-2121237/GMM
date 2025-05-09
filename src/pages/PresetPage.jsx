import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import { listen } from '@tauri-apps/api/event';
import { useNavigate } from 'react-router-dom';
import ConfirmationModal from '../components/ConfirmationModal';
import ScanProgressPopup from '../components/ScanProgressPopup';
import { toast } from 'react-toastify';

// Event names constants
const PRESET_APPLY_START_EVENT = "preset://apply_start";
const PRESET_APPLY_PROGRESS_EVENT = "preset://apply_progress";
const PRESET_APPLY_COMPLETE_EVENT = "preset://apply_complete";
const PRESET_APPLY_ERROR_EVENT = "preset://apply_error";

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
    presetName: { flexGrow: 1, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    presetActions: { display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }, // Adjusted gap
    iconButton: {
        background: 'none', border: 'none', color: 'var(--light)',
        cursor: 'pointer', fontSize: '16px', padding: '5px', opacity: 0.7,
        transition: 'opacity 0.2s ease, color 0.2s ease', // Added color transition
        display: 'flex', // Added for better icon centering
        alignItems: 'center', // Added for better icon centering
        justifyContent: 'center', // Added for better icon centering
        width: '30px', // Give buttons a fixed width
        height: '30px', // Give buttons a fixed height
    },
    // Removed iconButtonHover as pseudo-classes work better in CSS
    errorText: { color: 'var(--danger)', fontSize: '14px', marginTop: '10px', textAlign: 'center' },
    placeholderText: { color: 'rgba(255, 255, 255, 0.6)', textAlign: 'center', padding: '20px' },
};


function PresetPage() {
    const navigate = useNavigate();
    const [presets, setPresets] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [newPresetName, setNewPresetName] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [applyingPresetId, setApplyingPresetId] = useState(null);
    // Delete State
    const [presetToDelete, setPresetToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    // Overwrite State
    const [presetToOverwrite, setPresetToOverwrite] = useState(null);
    const [isOverwriteModalOpen, setIsOverwriteModalOpen] = useState(false);
    const [isOverwriting, setIsOverwriting] = useState(false);
    // Apply Popup state
    const [showApplyPopup, setShowApplyPopup] = useState(false);
    const [applyProgressData, setApplyProgressData] = useState(null);
    const [applySummary, setApplySummary] = useState('');
    const [applyError, setApplyError] = useState('');
    const applyListenersRef = useRef({ unlistenStart: null, unlistenProgress: null, unlistenComplete: null, unlistenError: null });

    // Fetch Presets
    const fetchPresets = useCallback(async () => {
        setIsLoading(true);
        try {
            const fetchedPresets = await invoke('get_presets');
            setPresets(fetchedPresets);
        } catch (err) {
            console.error("Failed to fetch presets:", err);
            toast.error('加载预设失败');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPresets();
    }, [fetchPresets]);

    // Listener Effect for Apply Progress
    useEffect(() => {
        const setupListeners = async () => {
            applyListenersRef.current.unlistenStart = await listen(PRESET_APPLY_START_EVENT, (event) => {
                if (applyingPresetId !== null) { // Check if an apply was actually initiated
                    console.log("Preset Apply Start:", event.payload);
                    setApplyProgressData({ processed: 0, total: event.payload || 0, message: '正在启动...' });
                    setApplySummary('');
                    setShowApplyPopup(true);
                }
            });
            applyListenersRef.current.unlistenProgress = await listen(PRESET_APPLY_PROGRESS_EVENT, (event) => {
                 // Only update if the popup is meant to be shown (i.e., an apply is in progress)
                if (applyingPresetId !== null && showApplyPopup) {
                    console.log("Preset Apply Progress:", event.payload);
                    setApplyProgressData(event.payload);
                }
            });
            applyListenersRef.current.unlistenComplete = await listen(PRESET_APPLY_COMPLETE_EVENT, (event) => {
                 if (applyingPresetId !== null) { // Only process if related to an ongoing apply
                    console.log("Preset Apply Complete:", event.payload);
                    setApplySummary(event.payload || '预设应用成功！');
                    setApplyProgressData(null);
                    setShowApplyPopup(true); // Ensure popup shows completion
                    setApplyingPresetId(null); // Re-enable button
                 }
            });
            applyListenersRef.current.unlistenError = await listen(PRESET_APPLY_ERROR_EVENT, (event) => {
                if (applyingPresetId !== null) { // Only process if related to an ongoing apply
                    console.error("Preset Apply Error:", event.payload);
                    toast.error(event.payload || '应用预设时发生未知错误');
                    setApplyProgressData(null);
                    setApplySummary('');
                    setShowApplyPopup(true); // Ensure popup shows error
                    setApplyingPresetId(null); // Re-enable button
                }
            });
        };

        setupListeners();

        return () => {
            console.log("正在清理预设应用监听器...");
            applyListenersRef.current.unlistenStart?.();
            applyListenersRef.current.unlistenProgress?.();
            applyListenersRef.current.unlistenComplete?.();
            applyListenersRef.current.unlistenError?.();
        };
    }, [applyingPresetId, showApplyPopup]); // Rerun setup if applyingPresetId changes (to ensure correct handling) or showApplyPopup


    // Handle Create Preset
    const handleCreatePreset = async (e) => {
        e.preventDefault();
        if (!newPresetName.trim()) return;
        setIsCreating(true);
        try {
            await invoke('create_preset', { name: newPresetName.trim() });
            console.log(`Preset '${newPresetName.trim()}' created successfully.`);
            setNewPresetName('');
            window.location.reload(); // Reload to fetch new preset list
        } catch (err) {
            console.error("Failed to create preset:", err);
            toast.error('创建预设失败');
        } finally {
            setIsCreating(false);
        }
    };

    // Apply Preset Logic
    const handleApplyPreset = async (presetId) => {
        setApplyingPresetId(presetId);
        setApplyError(''); // Clear specific apply error
        setShowApplyPopup(false); // Hide previous popup if any
        setApplyProgressData(null);
        setApplySummary('');

        try {
            await invoke('apply_preset', { presetId });
            // Start event will trigger popup display via listener
        } catch (err) {
            console.error("Failed to invoke apply_preset:", err);
            const errorString = typeof err === 'string' ? err : (err?.message || '启动预设应用失败');
            setApplyError(errorString);
            toast.error(errorString);
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

    // Toggle Favorite Logic
    const handleToggleFavorite = async (preset) => {
        const newFavState = !preset.is_favorite;
        try {
            await invoke('toggle_preset_favorite', { presetId: preset.id, isFavorite: newFavState });
            // Update local state immediately for responsiveness
            setPresets(current => current.map(p =>
                p.id === preset.id ? { ...p, is_favorite: newFavState } : p
            ));
        } catch (err) {
             console.error("Failed to toggle favorite:", err);
                toast.error('更新收藏状态失败');
             // Optionally revert local state change on error
             setPresets(current => current.map(p =>
                 p.id === preset.id ? { ...p, is_favorite: preset.is_favorite } : p // Revert to original
             ));
        }
    };

    // Delete Logic
    const openDeleteModal = (preset) => {
        setPresetToDelete(preset);
        setIsDeleteModalOpen(true);
    };

    const closeDeleteModal = () => {
        setPresetToDelete(null);
        setIsDeleteModalOpen(false);
        setIsDeleting(false);
    };

    const confirmDeletePreset = async () => {
        if (!presetToDelete) return;
        setIsDeleting(true);
        try {
            await invoke('delete_preset', { presetId: presetToDelete.id });
            await fetchPresets(); // Refetch list after deleting
            closeDeleteModal();
            toast.success(`预设「${presetToDelete.name}」已成功删除`);
        } catch (err) {
             console.error("Failed to delete preset:", err);
                toast.error('删除预设失败');
             setIsDeleting(false); // Keep modal open
        }
    };

    // Overwrite Logic
    const openOverwriteModal = (preset) => {
        setPresetToOverwrite(preset);
        setIsOverwriteModalOpen(true);
    };

    const closeOverwriteModal = () => {
        setPresetToOverwrite(null);
        setIsOverwriteModalOpen(false);
        setIsOverwriting(false);
    };

    const confirmOverwritePreset = async () => {
        if (!presetToOverwrite) return;
        setIsOverwriting(true);
        try {
            await invoke('overwrite_preset', { presetId: presetToOverwrite.id });
            console.log(`Preset ${presetToOverwrite.id} overwritten successfully.`);
            closeOverwriteModal();
            toast.success(`预设「${presetToOverwrite.name}」已成功覆盖`);
        } catch (err) {
             const errorString = typeof err === 'string' ? err : (err?.message || '未知覆盖错误');
             console.error(`Failed to overwrite preset ${presetToOverwrite.id}:`, errorString);
                toast.error(`覆盖预设失败：${errorString}`);
             setIsOverwriting(false); // Keep modal open
        }
    };

    // Disable buttons if any action is running
    const isOtherActionRunning = isCreating || applyingPresetId !== null || isDeleting || isOverwriting;

    return (
        <div style={styles.container} className="fadeIn">
            <div style={styles.pageHeader}>
                <h1 style={styles.pageTitle}>模组预设</h1>
            </div>

            <form onSubmit={handleCreatePreset} style={styles.createSection}>
                <input
                    type="text"
                    style={styles.input}
                    value={newPresetName}
                    onChange={(e) => setNewPresetName(e.target.value)}
                    placeholder="输入新预设名称..."
                    aria-label="新预设名称"
                    disabled={isOtherActionRunning}
                />
                <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={!newPresetName.trim() || isOtherActionRunning}
                >
                    {isCreating ? (
                        <><i className="fas fa-spinner fa-spin fa-fw"></i> 保存中...</>
                    ) : (
                        <><i className="fas fa-save fa-fw"></i> 创建预设</>
                    )}
                </button>
            </form>

            <div>
                {isLoading ? (
                    <p style={styles.placeholderText}>正在加载预设...</p>
                ) : presets.length === 0 ? (
                    <p style={styles.placeholderText}>尚未创建任何预设，请在上方创建以保存当前模组配置</p>
                ) : (
                    <ul style={styles.presetList}>
                        {presets.map(preset => (
                            <li key={preset.id} style={styles.presetItem}>
                                <span style={styles.presetName}>{preset.name}</span>
                                <div style={styles.presetActions}>
                                    {/* Apply Button */}
                                    <button
                                        style={styles.iconButton}
                                        className="preset-action-btn apply" // Add class for CSS hover styling
                                        title="应用预设"
                                        onClick={() => handleApplyPreset(preset.id)}
                                        disabled={applyingPresetId === preset.id || isOtherActionRunning}
                                    >
                                        {applyingPresetId === preset.id ? (
                                             <i className="fas fa-spinner fa-spin fa-fw"></i>
                                        ) : (
                                             <i className="fas fa-play-circle fa-fw" /* style={{ color: 'var(--success)' }} - Handled by CSS */ ></i>
                                         )}
                                    </button>
                                     {/* Overwrite Button */}
                                     <button
                                         style={styles.iconButton}
                                         className="preset-action-btn overwrite" // Add class for CSS hover styling
                                         title="确认覆盖"
                                         onClick={() => openOverwriteModal(preset)}
                                         disabled={isOtherActionRunning}
                                     >
                                          <i className="fas fa-save fa-fw" /* style={{ color: 'var(--primary)' }} - Handled by CSS */ ></i>
                                      </button>
                                     {/* Favorite Button */}
                                     <button
                                         style={styles.iconButton}
                                         className="preset-action-btn favorite" // Add class for CSS hover styling
                                         title={preset.is_favorite ? "从收藏中移除" : "添加到收藏"}
                                         onClick={() => handleToggleFavorite(preset)}
                                         disabled={isOtherActionRunning}
                                     >
                                          <i className={`fas fa-star fa-fw`} style={{ color: preset.is_favorite ? 'var(--accent)' : 'inherit' }}></i>
                                      </button>
                                     {/* Delete Button */}
                                     <button
                                        style={styles.iconButton}
                                        className="preset-action-btn delete" // Add class for CSS hover styling
                                        title="删除预设"
                                        onClick={() => openDeleteModal(preset)}
                                        disabled={isOtherActionRunning}
                                     >
                                          <i className="fas fa-trash-alt fa-fw" /* style={{ color: 'var(--danger)' }} - Handled by CSS */ ></i>
                                      </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

             {/* Overwrite Confirmation Modal */}
            {isOverwriteModalOpen && presetToOverwrite && (
                 <ConfirmationModal
                    isOpen={isOverwriteModalOpen}
                    onClose={closeOverwriteModal}
                    onConfirm={confirmOverwritePreset}
                    title="确认覆盖"
                    confirmText="覆盖"
                 >
                    确定要用当前的模组启用/禁用状态覆盖预设「{presetToOverwrite.name}」吗？此操作无法撤销。
                 </ConfirmationModal>
             )}

             {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && presetToDelete && (
                 <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={closeDeleteModal}
                    onConfirm={confirmDeletePreset}
                    title="确认删除预设"
                    confirmText="删除"
                    confirmButtonVariant="danger"
                    isLoading={isDeleting}
                 >
                    确定要永久删除预设「{presetToDelete.name}」吗？此操作无法撤销。
                 </ConfirmationModal>
             )}

             {/* Apply Progress Popup */}
            <ScanProgressPopup
                isOpen={showApplyPopup}
                progressData={applyProgressData}
                summary={applySummary}
                error={applyError}
                onClose={closeApplyPopup}
                baseTitle="正在应用预设..."
            />
        </div>
    );
}

export default PresetPage;