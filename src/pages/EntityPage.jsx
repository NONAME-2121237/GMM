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
const DEFAULT_ENTITY_PLACEHOLDER_IMAGE = '/images/unknown.png';

// Global View Mode Key
const VIEW_MODE_STORAGE_KEY = 'entityViewMode';
const LIST_ITEM_HEIGHT = 72;
const GRID_ITEM_WIDTH = 330;
const GRID_ITEM_HEIGHT = 350;

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

    // Fetch data (includes loading view mode)
    const fetchData = useCallback(async () => {
        const savedViewMode = getLocalStorageItem(VIEW_MODE_STORAGE_KEY, 'grid');
        setViewMode(savedViewMode);

        console.log(`[EntityPage ${entitySlug}] Fetching data...`);
        setLoading(true);
        setError(null);
        setEntity(null);
        setAssets([]);
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
                    const currentFolderName = asset.folder_name;
                    const isCurrentlyDisabledPrefixed = currentFolderName.startsWith('DISABLED_');
                    const baseFolderName = isCurrentlyDisabledPrefixed ? currentFolderName.substring(9) : currentFolderName;
                    const parts = baseFolderName.split('/');
                    const filename = parts.pop() || '';
                    const parentPath = parts.join('/');
                    let updatedFolderName;
                    if (newIsEnabledState) {
                        updatedFolderName = baseFolderName;
                    } else {
                        const disabledFilename = `DISABLED_${filename}`;
                        updatedFolderName = parentPath ? `${parentPath}/${disabledFilename}` : disabledFilename;
                    }
                    const updatedAsset = { ...asset, is_enabled: newIsEnabledState, folder_name: updatedFolderName };
                    console.log(`[EntityPage ${entitySlug}] Updated asset ${assetId} state:`, updatedAsset);
                    return updatedAsset;
                }
                return asset;
            })
        );
        // Refetch entity details (includes mod_count) - moved inside the callback for consistency
         invoke('get_entity_details', { entitySlug })
            .then(updatedEntityDetails => {
                console.log(`[EntityPage ${entitySlug}] Refetched entity details after toggle:`, updatedEntityDetails);
                setEntity(updatedEntityDetails);
            })
            .catch(err => console.error(`[EntityPage ${entitySlug}] Failed to refetch entity details after toggle:`, err));

    }, [entitySlug]); // Removed fetchData dependency here, explicit call inside

    // goBack function
    const goBack = () => {
         if (window.history.length > 2) {
            navigate(-1);
         } else {
             // Fallback logic (adjust as needed)
             const fallbackCategory = entity?.category_id === 1 ? 'characters' : 'characters';
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

    const handleSaveEditSuccess = useCallback((originalAssetId, newTargetEntitySlug) => {
        console.log("Save successful, processing result for asset ID:", originalAssetId, "New Slug:", newTargetEntitySlug);
        handleCloseEditModal();
        if (newTargetEntitySlug && newTargetEntitySlug !== entitySlug) {
             console.log(`Asset ${originalAssetId} relocated from ${entitySlug} to ${newTargetEntitySlug}. Removing from list.`);
             setAssets(currentAssets => currentAssets.filter(asset => asset.id !== originalAssetId));
              setEntity(currentEntity => ({ ...currentEntity, mod_count: Math.max(0, (currentEntity?.mod_count || 0) - 1) }));
        } else {
            console.log(`Asset ${originalAssetId} updated within ${entitySlug}. Refreshing data.`);
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
            setAssets(currentAssets => currentAssets.filter(asset => asset.id !== assetToDelete.id));
             setEntity(currentEntity => ({ ...currentEntity, mod_count: Math.max(0, (currentEntity?.mod_count || 0) - 1) }));
             handleCloseDeleteModal();
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown delete error');
            console.error(`Failed to delete asset ${assetToDelete.id}:`, errorString);
            setDeleteError(`Failed to delete: ${errorString}`);
             setIsDeleting(false);
        }
    }, [assetToDelete, handleCloseDeleteModal]);

    // View Mode Toggle Handler
    const toggleViewMode = (newMode) => {
        if (newMode !== viewMode) {
            setViewMode(newMode);
            setLocalStorageItem(VIEW_MODE_STORAGE_KEY, newMode); // Save preference globally
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

    const ListItem = ({ index, style }) => {
        const asset = filteredAssets[index];
        return (
             <div style={style}> {/* Apply style for positioning */}
                 <ModCard
                     key={asset.id} // Key should ideally be here, but react-window manages keys
                     asset={asset}
                     entitySlug={entitySlug}
                     onToggleComplete={handleToggleComplete}
                     onEdit={handleOpenEditModal}
                     onDelete={handleOpenDeleteModal}
                     viewMode="list"
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
             <div style={style}> {/* Apply style for positioning */}
                {/* Add padding inside the cell if needed */}
                <div style={{ padding: '0 10px 10px 10px', height:'100%' }}>
                    <ModCard
                        key={asset.id}
                        asset={asset}
                        entitySlug={entitySlug}
                        onToggleComplete={handleToggleComplete}
                        onEdit={handleOpenEditModal}
                        onDelete={handleOpenDeleteModal}
                        viewMode="grid"
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
    const avatarUrl = entity.base_image ? `/images/entities/${entity.base_image}` : DEFAULT_ENTITY_PLACEHOLDER_IMAGE;
    const handleAvatarError = (e) => {
        if (e.target.src !== DEFAULT_ENTITY_PLACEHOLDER_IMAGE) {
            console.warn(`Failed to load entity avatar: ${avatarUrl}, falling back to placeholder.`);
            // Use background style fallback for div
            e.target.style.backgroundImage = `url('${DEFAULT_ENTITY_PLACEHOLDER_IMAGE}')`;
        }
     };

    const gridColumnCount = Math.max(1, Math.floor(bounds.width / GRID_ITEM_WIDTH));
    const gridRowCount = Math.ceil(filteredAssets.length / gridColumnCount);


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
                    // onError doesn't work directly on div background, handle indirectly if needed
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
                <div className="section-header">
                    <h2 className="section-title">Available Mods ({filteredAssets.length})</h2>
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

                {/* --- List/Grid Container (measured) --- */}
                <div ref={listContainerRef} style={{ height: 'calc(100vh - 450px)', minHeight: '300px' /* Adjust based on profile height */, overflow: 'hidden' }}>
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
                                itemSize={LIST_ITEM_HEIGHT}
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
                                rowHeight={GRID_ITEM_HEIGHT}
                                width={bounds.width}
                                itemData={filteredAssets} // Pass data if needed inside item renderer
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