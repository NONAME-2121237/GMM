// src/pages/EntityPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import ModCard from '../components/ModCard';
import ModEditModal from '../components/ModEditModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import ModCardSkeleton from '../components/ModCardSkeleton';
import { FixedSizeList, FixedSizeGrid } from 'react-window';
import useMeasure from 'react-use-measure';
import { toast } from 'react-toastify';

// Helper function to parse details JSON
const parseDetails = (detailsJson) => {
    try {
        if (!detailsJson) return {};
        return JSON.parse(detailsJson);
    } catch (e) {
        console.error("Failed to parse entity details JSON:", e);
        return {}; // Return empty object on error
    }
};

// Font Awesome icons map
const elementIconsFA = {
    Electro: "fas fa-bolt", Pyro: "fas fa-fire", Cryo: "fas fa-snowflake",
    Hydro: "fas fa-tint", Anemo: "fas fa-wind", Geo: "fas fa-mountain",
    Dendro: "fas fa-leaf",
};
const weaponIconsFA = {
    Polearm: "fas fa-staff-aesculapius", Sword: "fas fa-sword",
    Claymore: "fas fa-gavel", Bow: "fas fa-bow-arrow",
    Catalyst: "fas fa-book-sparkles"
};
const RarityIcon = () => <i className="fas fa-star fa-fw" style={{ color: '#ffcc00' }}></i>;
const DEFAULT_ENTITY_PLACEHOLDER_IMAGE = '/images/unknown.jpg';

// Global View Mode Key
const VIEW_MODE_STORAGE_KEY = 'entityViewMode';
const LIST_ITEM_HEIGHT = 60; // Height including padding/margin
const GRID_ITEM_WIDTH = 330;
const GRID_ITEM_HEIGHT = 350; // Includes padding inside the cell

function EntityPage() {
    const { entitySlug } = useParams();
    const navigate = useNavigate();
    const [entity, setEntity] = useState(null);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingAsset, setEditingAsset] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [assetToDelete, setAssetToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // Default, loaded in useEffect
    const [modSearchTerm, setModSearchTerm] = useState('');
    const [listContainerRef, bounds] = useMeasure();
    // --- New State for Bulk Actions ---
    const [selectedAssetIds, setSelectedAssetIds] = useState(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    // ----------------------------------

    // Fetch data (includes loading view mode)
    const fetchData = useCallback(async () => {
        const savedViewMode = getLocalStorageItem(VIEW_MODE_STORAGE_KEY, 'grid');
        setViewMode(savedViewMode);

        console.log(`[EntityPage ${entitySlug}] Fetching data...`);
        setLoading(true);
        setError(null);
        setEntity(null);
        setAssets([]);
        setSelectedAssetIds(new Set()); // Reset selection on fetch
        try {
            const entityDetails = await invoke('get_entity_details', { entitySlug });
            setEntity(entityDetails);
            const entityAssets = await invoke('get_assets_for_entity', { entitySlug });
            setAssets(entityAssets);
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown error');
            console.error(`[EntityPage ${entitySlug}] Failed to load data:`, errorString);
             if (errorString.includes("not found")) setError(`Entity '${entitySlug}' not found.`);
             else setError(`Could not load details or mods for ${entitySlug}. Details: ${errorString}`);
        } finally {
            setLoading(false);
            console.log(`[EntityPage ${entitySlug}] Fetching complete. Loading: ${false}`);
        }
    }, [entitySlug]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Callback for ModCard to update state after toggle
    const handleToggleComplete = useCallback((assetId, newIsEnabledState) => {
        console.log(`[EntityPage ${entitySlug}] handleToggleComplete called for asset ${assetId}, new state: ${newIsEnabledState}`);
        setAssets(currentAssets =>
            currentAssets.map(asset => {
                if (asset.id === assetId) {
                    // Logic to calculate the potentially new folder_name based on state
                    // This is needed if ModCard itself doesn't know the "clean" relative path
                    const isCurrentlyDisabledPrefixed = asset.folder_name.startsWith('DISABLED_');
                    let cleanRelativePath = asset.folder_name;
                    if (isCurrentlyDisabledPrefixed) {
                        const parts = asset.folder_name.split('/');
                        const filename = parts.pop() || '';
                        cleanRelativePath = parts.length > 0 ? `${parts.join('/')}/${filename.substring(9)}` : filename.substring(9);
                    }

                    let updatedFolderName;
                    if (newIsEnabledState) {
                         updatedFolderName = cleanRelativePath; // Use clean path if enabled
                    } else {
                         const parts = cleanRelativePath.split('/');
                         const filename = parts.pop() || '';
                         const disabledFilename = `DISABLED_${filename}`;
                         updatedFolderName = parts.length > 0 ? `${parts.join('/')}/${disabledFilename}` : disabledFilename;
                     }

                    const updatedAsset = { ...asset, is_enabled: newIsEnabledState, folder_name: updatedFolderName };
                    console.log(`[EntityPage ${entitySlug}] Updated asset ${assetId} state:`, updatedAsset);
                    return updatedAsset;
                }
                return asset;
            })
        );
        // Refetch entity details only if counts might change (for simplicity, always refetch)
        invoke('get_entity_details', { entitySlug })
            .then(updatedEntityDetails => {
                console.log(`[EntityPage ${entitySlug}] Refetched entity details after toggle:`, updatedEntityDetails);
                setEntity(updatedEntityDetails);
            })
            .catch(err => console.error(`[EntityPage ${entitySlug}] Failed to refetch entity details after toggle:`, err));

    }, [entitySlug]);

    // goBack function
    const goBack = () => {
         if (window.history.length > 2) {
            navigate(-1);
         } else {
             // Fallback logic
             const fallbackCategory = entity?.category_id === 1 ? 'characters' : 'characters'; // Simple default
             navigate(`/category/${fallbackCategory}`);
         }
    };

    // Edit Modal Handlers
    const handleOpenEditModal = useCallback((assetToEdit) => {
        console.log("Opening edit modal for:", assetToEdit);
        setEditingAsset(assetToEdit);
        setIsEditModalOpen(true);
    }, []);

    const handleCloseEditModal = useCallback(() => {
        setIsEditModalOpen(false);
        setEditingAsset(null);
    }, []);

    const handleSaveEditSuccess = useCallback((targetSlug) => {
        // Called when save is successful, receives the NEW target entity slug
        console.log("Save successful, processing result. New Target Slug:", targetSlug);
        handleCloseEditModal();
        if (targetSlug && targetSlug !== entitySlug) {
             console.log(`Asset relocated from ${entitySlug} to ${targetSlug}. Refreshing data.`);
             toast.info(`Mod relocated to ${targetSlug}. Refreshing list...`);
             // Refresh the current page's data (which will now exclude the moved mod)
             fetchData();
        } else {
            console.log(`Asset updated within ${entitySlug}. Refreshing data.`);
            toast.success(`Mod details updated.`);
            fetchData(); // Refetch all data for the current entity
        }
    }, [handleCloseEditModal, entitySlug, fetchData]);


    // Delete Modal Handlers
    const handleOpenDeleteModal = useCallback((asset) => {
        setAssetToDelete(asset);
        setIsDeleteModalOpen(true);
        setDeleteError('');
    }, []);

    const handleCloseDeleteModal = useCallback(() => {
        setIsDeleteModalOpen(false);
        setAssetToDelete(null);
        setIsDeleting(false);
        setDeleteError('');
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!assetToDelete) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await invoke('delete_asset', { assetId: assetToDelete.id });
            console.log(`Asset ${assetToDelete.id} deleted successfully.`);
            toast.success(`Mod "${assetToDelete.name}" deleted.`);
            setAssets(currentAssets => currentAssets.filter(asset => asset.id !== assetToDelete.id));
             setEntity(currentEntity => ({ ...currentEntity, mod_count: Math.max(0, (currentEntity?.mod_count || 0) - 1) }));
             handleCloseDeleteModal();
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown delete error');
            console.error(`Failed to delete asset ${assetToDelete.id}:`, errorString);
            setDeleteError(`Failed to delete: ${errorString}`); // Show error in modal
            toast.error(`Failed to delete "${assetToDelete.name}": ${errorString}`); // Also show toast
             setIsDeleting(false); // Keep modal open on error
        }
    }, [assetToDelete, handleCloseDeleteModal]);

    // View Mode Toggle Handler
    const toggleViewMode = (newMode) => {
        if (newMode !== viewMode) {
            setViewMode(newMode);
            setLocalStorageItem(VIEW_MODE_STORAGE_KEY, newMode); // Save preference globally
            setSelectedAssetIds(new Set()); // Clear selection when changing view mode
        }
    };

    const filteredAssets = useMemo(() => {
        if (!modSearchTerm) {
            return assets; // No filter applied
        }
        const lowerSearchTerm = modSearchTerm.toLowerCase();
        return assets.filter(asset =>
            asset.name.toLowerCase().includes(lowerSearchTerm) ||
            (asset.author && asset.author.toLowerCase().includes(lowerSearchTerm)) ||
            (asset.category_tag && asset.category_tag.toLowerCase().includes(lowerSearchTerm))
        );
    }, [assets, modSearchTerm]);

    // --- Bulk Action Handlers ---
    const handleSelectAllChange = (event) => {
        const isChecked = event.target.checked;
        if (isChecked) {
            // Select all *filtered* assets
            setSelectedAssetIds(new Set(filteredAssets.map(asset => asset.id)));
        } else {
            setSelectedAssetIds(new Set());
        }
    };

    const handleAssetSelectChange = useCallback((assetId, isSelected) => {
        setSelectedAssetIds(prevSet => {
            const newSet = new Set(prevSet);
            if (isSelected) {
                newSet.add(assetId);
            } else {
                newSet.delete(assetId);
            }
            return newSet;
        });
    }, []);

    const handleBulkToggle = async (enable) => {
        if (selectedAssetIds.size === 0 || isBulkProcessing) return;

        setIsBulkProcessing(true);
        let successCount = 0;
        let failCount = 0;
        const updatedAssetsMap = new Map(assets.map(a => [a.id, { ...a }])); // Create a mutable map

        // Use toast for progress indication
        const toastId = toast.loading(`Processing ${selectedAssetIds.size} mods...`, { closeButton: false });

        // Process items sequentially to avoid overwhelming backend/UI updates too rapidly
        for (const assetId of selectedAssetIds) {
            const currentAsset = updatedAssetsMap.get(assetId);
            if (!currentAsset || currentAsset.is_enabled === enable) {
                // Skip if asset not found or already in the desired state
                continue;
            }

            try {
                // Use the existing single toggle command
                const newIsEnabledState = await invoke('toggle_asset_enabled', {
                    entitySlug,
                    asset: currentAsset // Pass the current asset state
                });

                // Update the asset in our map immediately after successful toggle
                const isCurrentlyDisabledPrefixed = currentAsset.folder_name.startsWith('DISABLED_');
                 let cleanRelativePath = currentAsset.folder_name;
                 if (isCurrentlyDisabledPrefixed) {
                     const parts = currentAsset.folder_name.split('/');
                     const filename = parts.pop() || '';
                     cleanRelativePath = parts.length > 0 ? `${parts.join('/')}/${filename.substring(9)}` : filename.substring(9);
                 }
                 let updatedFolderName;
                 if (newIsEnabledState) {
                      updatedFolderName = cleanRelativePath;
                 } else {
                      const parts = cleanRelativePath.split('/');
                      const filename = parts.pop() || '';
                      const disabledFilename = `DISABLED_${filename}`;
                      updatedFolderName = parts.length > 0 ? `${parts.join('/')}/${disabledFilename}` : disabledFilename;
                  }
                updatedAssetsMap.set(assetId, { ...currentAsset, is_enabled: newIsEnabledState, folder_name: updatedFolderName });

                successCount++;
                toast.update(toastId, { render: `${enable ? 'Enabling' : 'Disabling'} mod ${successCount}/${selectedAssetIds.size}...` });
            } catch (err) {
                failCount++;
                const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown toggle error');
                console.error(`Bulk toggle failed for asset ${assetId}:`, errorString);
                // Optionally show individual errors, but might be too noisy.
                // toast.error(`Failed for "${currentAsset.name}": ${errorString.substring(0,50)}`);
            }
        }

        // Update the main assets state once after all processing
        setAssets(Array.from(updatedAssetsMap.values()));
        setSelectedAssetIds(new Set()); // Clear selection

        // Update toast based on outcome
        if (failCount === 0) {
             toast.update(toastId, { render: `${enable ? 'Enabled' : 'Disabled'} ${successCount} mods successfully!`, type: 'success', isLoading: false, autoClose: 3000 });
        } else {
             toast.update(toastId, { render: `Bulk action completed. ${successCount} succeeded, ${failCount} failed.`, type: 'warning', isLoading: false, autoClose: 5000 });
        }

        setIsBulkProcessing(false);

        // Refetch entity details to update counts
        invoke('get_entity_details', { entitySlug })
            .then(updatedEntityDetails => setEntity(updatedEntityDetails))
            .catch(err => console.error("Failed refetch entity details after bulk toggle:", err));
    };

    // --- End Bulk Action Handlers ---

    const ListItem = ({ index, style }) => {
        const asset = filteredAssets[index];
        // --- Pass selection props ---
        const isSelected = selectedAssetIds.has(asset.id);
        return (
             <div style={style}>
                 <ModCard
                     key={asset.id}
                     asset={asset}
                     entitySlug={entitySlug}
                     onToggleComplete={handleToggleComplete}
                     onEdit={handleOpenEditModal}
                     onDelete={handleOpenDeleteModal}
                     viewMode="list"
                     // --- Pass selection props ---
                     isSelected={isSelected}
                     onSelectChange={handleAssetSelectChange}
                     // -------------------------
                 />
             </div>
        );
    };

    const GridItem = ({ columnIndex, rowIndex, style }) => {
        const columnCount = Math.max(1, Math.floor(bounds.width / GRID_ITEM_WIDTH));
        const index = rowIndex * columnCount + columnIndex;
        if (index >= filteredAssets.length) return null; // Out of bounds
        const asset = filteredAssets[index];
        return (
             <div style={style}>
                <div style={{ padding: '0 10px 10px 10px', height:'100%' }}>
                    <ModCard
                        key={asset.id}
                        asset={asset}
                        entitySlug={entitySlug}
                        onToggleComplete={handleToggleComplete}
                        onEdit={handleOpenEditModal}
                        onDelete={handleOpenDeleteModal}
                        viewMode="grid"
                        // Selection not implemented for grid view
                    />
                 </div>
             </div>
        );
    };

    // Loading/Error/No Entity checks
    if (loading) return <div className="placeholder-text">Loading entity details for {entitySlug}... <i className="fas fa-spinner fa-spin"></i></div>;
    if (error) return <div className="placeholder-text" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
    if (!entity) return <div className="placeholder-text">Entity data could not be loaded.</div>;

    // Details parsing and avatar URL
    const details = parseDetails(entity.details);
    const element = details?.element;
    const elementIconClass = element ? (elementIconsFA[element] || 'fas fa-question-circle') : null;
    const weapon = details?.weapon;
    const weaponIconClass = weapon ? (weaponIconsFA[weapon] || 'fas fa-question-circle') : null;
    const avatarUrl = entity.base_image ? `/images/entities/${entitySlug}_base.jpg` : DEFAULT_ENTITY_PLACEHOLDER_IMAGE;
    const handleAvatarError = (e) => {
        if (e.target.src !== DEFAULT_ENTITY_PLACEHOLDER_IMAGE) {
            console.warn(`Failed to load entity avatar: ${avatarUrl}, falling back to placeholder.`);
            e.target.style.backgroundImage = `url('${DEFAULT_ENTITY_PLACEHOLDER_IMAGE}')`;
        }
     };

    const gridColumnCount = Math.max(1, Math.floor(bounds.width / GRID_ITEM_WIDTH));
    const gridRowCount = Math.ceil(filteredAssets.length / gridColumnCount);

    // --- Calculate "select all" checkbox state ---
    const isAllFilteredSelected = filteredAssets.length > 0 && selectedAssetIds.size === filteredAssets.length;
    const isIndeterminate = selectedAssetIds.size > 0 && selectedAssetIds.size < filteredAssets.length;
    // -------------------------------------------


    return (
        <div className="character-page fadeIn">
            <div className="page-header">
                <h1 className="page-title">
                    <i
                        className="fas fa-arrow-left fa-fw"
                        onClick={goBack}
                        title="Back to list"
                        style={{ cursor: 'pointer', marginRight: '15px', opacity: 0.7, ':hover': { opacity: 1 } }}
                        role="button"
                        aria-label="Go back"
                        tabIndex={0}
                        onKeyPress={(e) => e.key === 'Enter' && goBack()}
                    ></i>
                    {entity.name} Mods
                </h1>
            </div>

            <div className="character-profile">
                <div
                    className="character-avatar"
                    style={{ backgroundImage: `url('${avatarUrl}')` }}
                >
                </div>

                <div className="character-info">
                    <h2 className="character-name">
                        {entity.name}
                        {elementIconClass &&
                            <span className="element-icon" style={{ color: `var(--${element?.toLowerCase()})` || 'var(--primary)' }} title={element}>
                                <i className={`${elementIconClass} fa-fw`}></i>
                            </span>
                        }
                    </h2>
                    <div className="character-details">
                        {details?.rarity && <div className="character-detail"><RarityIcon /> {details.rarity} Star</div>}
                        {element && <div className="character-detail"><i className={`${elementIconClass} fa-fw`}></i> {element}</div>}
                        {weapon && <div className="character-detail"><i className={`${weaponIconClass} fa-fw`}></i> {weapon}</div>}
                    </div>
                    {entity.description ? (
                        <p className="character-description">{entity.description}</p>
                    ) : (
                         <p className="character-description placeholder-text" style={{padding: 0, textAlign:'left'}}>No description available.</p>
                    )}
                    <p style={{fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', marginTop:'15px'}}>
                        Mods in library: {entity.mod_count ?? '...'}
                    </p>
                </div>
            </div>

            {/* Mods Section */}
            <div className="mods-section">
                 {/* --- Updated Section Header --- */}
                 <div className="section-header" style={{ alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                         <h2 className="section-title" style={{ marginBottom: 0 }}>Available Mods ({filteredAssets.length})</h2>
                         {/* Select All Checkbox (only in list view) */}
                         {viewMode === 'list' && filteredAssets.length > 0 && (
                              <input
                                  type="checkbox"
                                  title={isAllFilteredSelected ? "Deselect All" : "Select All Visible"}
                                  checked={isAllFilteredSelected}
                                  ref={el => el && (el.indeterminate = isIndeterminate)} // Set indeterminate state
                                  onChange={handleSelectAllChange}
                                  disabled={isBulkProcessing}
                                  style={{ cursor: 'pointer', width:'16px', height:'16px' }}
                                  aria-label="Select all mods"
                              />
                         )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: 'auto' }}> {/* Wrap right-side controls */}
                         {/* Bulk Action Buttons (only in list view & when items selected) */}
                         {viewMode === 'list' && selectedAssetIds.size > 0 && (
                             <div style={{ display: 'flex', gap: '10px' }}>
                                 <button className="btn btn-primary" onClick={() => handleBulkToggle(true)} disabled={isBulkProcessing} title="Enable selected mods">
                                     {isBulkProcessing ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-check fa-fw"></i>} Enable ({selectedAssetIds.size})
                                 </button>
                                 <button className="btn btn-outline" onClick={() => handleBulkToggle(false)} disabled={isBulkProcessing} title="Disable selected mods">
                                     {isBulkProcessing ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-times fa-fw"></i>} Disable ({selectedAssetIds.size})
                                 </button>
                                 {/* Add bulk delete later if needed */}
                             </div>
                         )}
                         <div className="search-bar-container">
                             <div className="search-bar">
                                 <i className="fas fa-search"></i>
                                 <input type="text" placeholder={`Search mods...`} value={modSearchTerm} onChange={(e) => setModSearchTerm(e.target.value)} aria-label={`Search mods`} data-global-search="true" />
                             </div>
                         </div>
                         <div className="view-mode-toggle">
                              <button className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => toggleViewMode('grid')} title="Grid View"><i className="fas fa-th fa-fw"></i></button>
                              <button className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => toggleViewMode('list')} title="List View"><i className="fas fa-list fa-fw"></i></button>
                         </div>
                     </div>
                 </div>
                 {/* --- End Updated Section Header --- */}

                {/* List/Grid Container */}
                {/* Use a fixed height container and let react-window handle scrolling */}
                 <div ref={listContainerRef} style={{ height: 'calc(100vh - 200px)', /* Adjust based on profile height etc */ minHeight: '300px', overflow: 'hidden', marginTop: '10px' /* Add margin if needed */}}>
                    {loading ? (
                         <div className={viewMode === 'grid' ? 'mods-grid' : 'mods-list'} style={{height: '100%'}}>
                             {Array.from({ length: 6 }).map((_, i) => <ModCardSkeleton key={i} viewMode={viewMode} />)}
                         </div>
                     ) : !filteredAssets.length ? (
                         <p className="placeholder-text" style={{ gridColumn: '1 / -1', width: '100%', paddingTop: '30px' }}>
                             {assets.length === 0 ? `No mods found for ${entity.name}.` : 'No mods found matching search.'}
                         </p>
                     ) : bounds.width > 0 && bounds.height > 0 ? ( // Only render list/grid when bounds are measured
                        viewMode === 'list' ? (
                            <FixedSizeList
                                height={bounds.height}
                                itemCount={filteredAssets.length}
                                itemSize={LIST_ITEM_HEIGHT} // Ensure this matches the actual item height including margins/padding
                                width={bounds.width}
                                style={{overflowX:'hidden'}} // Prevent horizontal scrollbar
                            >
                                {ListItem}
                            </FixedSizeList>
                        ) : (
                            <FixedSizeGrid
                                columnCount={gridColumnCount}
                                columnWidth={GRID_ITEM_WIDTH}
                                height={bounds.height}
                                rowCount={gridRowCount}
                                rowHeight={GRID_ITEM_HEIGHT} // Ensure this matches actual grid item height
                                width={bounds.width}
                                itemData={filteredAssets}
                            >
                                {GridItem}
                            </FixedSizeGrid>
                        )
                    ) : (
                         <p className="placeholder-text">Calculating layout...</p> // Fallback while measuring
                    )}
                </div>
            </div>

            {/* Modals */}
            {isEditModalOpen && editingAsset && ( <ModEditModal asset={editingAsset} currentEntitySlug={entitySlug} onClose={handleCloseEditModal} onSaveSuccess={handleSaveEditSuccess} /> )}
            {isDeleteModalOpen && assetToDelete && (
                 <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={handleCloseDeleteModal}
                    onConfirm={handleConfirmDelete}
                    title="Confirm Deletion"
                    confirmText="Delete"
                    confirmButtonVariant="danger"
                    isLoading={isDeleting}
                    errorMessage={deleteError}
                 >
                    Are you sure you want to permanently delete the mod "{assetToDelete.name}"?
                    This action will remove the mod files from your disk and cannot be undone.
                 </ConfirmationModal>
             )}
        </div>
    );
}

export default EntityPage;