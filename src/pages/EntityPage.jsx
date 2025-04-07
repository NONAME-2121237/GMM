// --- START OF FILE src/pages/EntityPage.jsx ---
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import ModCard from '../components/ModCard';
import ModEditModal from '../components/ModEditModal';
import ConfirmationModal from '../components/ConfirmationModal'; // Import confirmation modal

// Helper function to parse details JSON
const parseDetails = (detailsJson) => {
    try {
        if (!detailsJson) return {};
        return JSON.parse(detailsJson);
    } catch (e) {
        console.error("Failed to parse entity details JSON:", e);
        return {};
    }
};

// Font Awesome icons map
const elementIconsFA = {
    Electro: "fas fa-bolt", Pyro: "fas fa-fire", Cryo: "fas fa-snowflake",
    Hydro: "fas fa-tint", Anemo: "fas fa-wind", Geo: "fas fa-mountain",
    Dendro: "fas fa-leaf",
};
const weaponIconsFA = {
    Polearm: "fas fa-staff-aesculapius", Sword: "fas fa-sword", // Using fas icons
    Claymore: "fas fa-gavel", Bow: "fas fa-bow-arrow", // Using fas icons
    Catalyst: "fas fa-book-sparkles" // Using fas icons
};
const RarityIcon = () => <i className="fas fa-star fa-fw" style={{ color: '#ffcc00' }}></i>;

// Default placeholder image path (relative to public) - For the main entity avatar
const DEFAULT_ENTITY_PLACEHOLDER_IMAGE = '/images/unknown.png';

function EntityPage() {
    const { entitySlug } = useParams();
    const navigate = useNavigate();
    const [entity, setEntity] = useState(null);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    // Edit Modal State
    const [editingAsset, setEditingAsset] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    // Delete Modal State
    const [assetToDelete, setAssetToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false); // Loading state for delete operation
    const [deleteError, setDeleteError] = useState(''); // Error state for delete operation


    const fetchData = useCallback(async () => {
        console.log(`[EntityPage ${entitySlug}] Fetching data...`);
        setLoading(true);
        setError(null);
        setEntity(null); // Clear old data
        setAssets([]); // Clear old data
        try {
            // Fetch details and assets sequentially or in parallel
            const entityDetails = await invoke('get_entity_details', { entitySlug });
            console.log(`[EntityPage ${entitySlug}] Fetched entity details:`, entityDetails);
            setEntity(entityDetails);
            // Pass entitySlug when fetching assets
            const entityAssets = await invoke('get_assets_for_entity', { entitySlug });
            console.log(`[EntityPage ${entitySlug}] Fetched assets:`, entityAssets);
            setAssets(entityAssets);
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown error');
            console.error(`[EntityPage ${entitySlug}] Failed to load data:`, errorString);
            // Distinguish between entity not found and other errors
             if (errorString.includes("not found")) {
                setError(`Entity '${entitySlug}' not found.`);
             } else {
                setError(`Could not load details or mods for ${entitySlug}. Details: ${errorString}`);
             }
        } finally {
            setLoading(false);
            console.log(`[EntityPage ${entitySlug}] Fetching complete. Loading: ${false}`);
        }
    }, [entitySlug]); // Dependency: refetch when slug changes

    useEffect(() => {
        fetchData();
    }, [fetchData]); // Run fetchData when the memoized function changes

    // Callback for ModCard to update state after toggle
    const handleToggleComplete = useCallback((assetId, newIsEnabledState) => {
        console.log(`[EntityPage ${entitySlug}] handleToggleComplete called for asset ${assetId}, new state: ${newIsEnabledState}`);
        setAssets(currentAssets =>
            currentAssets.map(asset => {
                if (asset.id === assetId) {
                    console.log(`[EntityPage ${entitySlug}] Updating asset ${assetId} in state. Old state:`, asset);
                    // Determine the correct folder name based on the *new* state reported by backend
                    const currentFolderName = asset.folder_name; // The name *before* the toggle completed visually
                    const isCurrentlyDisabledPrefixed = currentFolderName.startsWith('DISABLED_');
                    const baseFolderName = isCurrentlyDisabledPrefixed ? currentFolderName.substring(9) : currentFolderName; // Remove 'DISABLED_' prefix (9 chars)

                    // --- FIX: Handle potential nested paths during toggle renaming ---
                    const parts = baseFolderName.split('/');
                    const filename = parts.pop() || ''; // Get the last part (filename)
                    const parentPath = parts.join('/'); // Get the preceding path parts

                    let updatedFolderName;
                    if (newIsEnabledState) {
                        updatedFolderName = baseFolderName; // Enabled state uses the clean base name
                    } else {
                        const disabledFilename = `DISABLED_${filename}`;
                        updatedFolderName = parentPath ? `${parentPath}/${disabledFilename}` : disabledFilename; // Reconstruct path with disabled prefix
                    }

                    const updatedAsset = { ...asset, is_enabled: newIsEnabledState, folder_name: updatedFolderName };
                    console.log(`[EntityPage ${entitySlug}] Updated asset ${assetId} state:`, updatedAsset);
                    return updatedAsset;
                }
                return asset;
            })
        );
        // Refetch entity details (includes mod_count)
         invoke('get_entity_details', { entitySlug })
            .then(updatedEntityDetails => {
                console.log(`[EntityPage ${entitySlug}] Refetched entity details after toggle:`, updatedEntityDetails);
                setEntity(updatedEntityDetails);
            })
            .catch(err => console.error(`[EntityPage ${entitySlug}] Failed to refetch entity details after toggle:`, err));

    }, [entitySlug]);


    const goBack = () => {
         if (window.history.length > 2) {
            navigate(-1);
         } else {
             // Fallback to default category if no history
             const fallbackCategory = entity?.category_id === 1 ? 'characters' : 'characters'; // Example logic
             navigate(`/category/${fallbackCategory}`);
         }
    };

    // --- Edit Modal Handlers ---
    const handleOpenEditModal = useCallback((assetToEdit) => {
        console.log("Opening edit modal for:", assetToEdit);
        setEditingAsset(assetToEdit);
        setIsEditModalOpen(true);
    }, []);

    const handleCloseEditModal = useCallback(() => {
        setIsEditModalOpen(false);
        setEditingAsset(null); // Clear editing state on close
    }, []);

    const handleSaveEditSuccess = useCallback((originalAssetId, newTargetEntitySlug) => {
        console.log("Save successful, processing result for asset ID:", originalAssetId, "New Slug:", newTargetEntitySlug);
        handleCloseEditModal(); // Close the modal on success

        if (newTargetEntitySlug && newTargetEntitySlug !== entitySlug) {
             // Relocation occurred, remove from current list
             console.log(`Asset ${originalAssetId} relocated from ${entitySlug} to ${newTargetEntitySlug}. Removing from list.`);
             setAssets(currentAssets => currentAssets.filter(asset => asset.id !== originalAssetId));
              // Decrement mod count locally for immediate feedback (will be corrected on next full fetch)
              setEntity(currentEntity => ({ ...currentEntity, mod_count: Math.max(0, (currentEntity?.mod_count || 0) - 1) }));
        } else {
            // No relocation, just refresh data for this entity to get updated info
            console.log(`Asset ${originalAssetId} updated within ${entitySlug}. Refreshing data.`);
            fetchData(); // Refetch all data for the current entity
        }
    }, [handleCloseEditModal, entitySlug, fetchData]);

    // --- Delete Modal Handlers ---
    const handleOpenDeleteModal = useCallback((asset) => {
        setAssetToDelete(asset);
        setIsDeleteModalOpen(true);
        setDeleteError(''); // Clear previous errors
    }, []);

    const handleCloseDeleteModal = useCallback(() => {
        setIsDeleteModalOpen(false);
        setAssetToDelete(null);
        setIsDeleting(false); // Ensure loading state is reset
        setDeleteError('');
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!assetToDelete) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await invoke('delete_asset', { assetId: assetToDelete.id });
            console.log(`Asset ${assetToDelete.id} deleted successfully.`);
            // Remove from state
            setAssets(currentAssets => currentAssets.filter(asset => asset.id !== assetToDelete.id));
            // Update mod count in entity state (will be corrected on next full fetch if needed)
             setEntity(currentEntity => ({ ...currentEntity, mod_count: Math.max(0, (currentEntity?.mod_count || 0) - 1) }));
             handleCloseDeleteModal();
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown delete error');
            console.error(`Failed to delete asset ${assetToDelete.id}:`, errorString);
            setDeleteError(`Failed to delete: ${errorString}`);
             setIsDeleting(false); // Keep modal open to show error
        }
    }, [assetToDelete, handleCloseDeleteModal]);


    if (loading) return <div className="placeholder-text">Loading entity details for {entitySlug}... <i className="fas fa-spinner fa-spin"></i></div>;
    if (error) return <div className="placeholder-text" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
    if (!entity) return <div className="placeholder-text">Entity data could not be loaded.</div>;


    const details = parseDetails(entity.details);
    const element = details?.element;
    const elementIconClass = element ? (elementIconsFA[element] || 'fas fa-question-circle') : null;
    const weapon = details?.weapon;
    const weaponIconClass = weapon ? (weaponIconsFA[weapon] || 'fas fa-question-circle') : null;

     const avatarUrl = entity.base_image
        ? `/images/entities/${entity.base_image}` // Assumes images are in public/images/entities/
        : DEFAULT_ENTITY_PLACEHOLDER_IMAGE; // Fallback placeholder

     const handleAvatarError = (e) => {
        if (e.target.src !== DEFAULT_ENTITY_PLACEHOLDER_IMAGE) {
            console.warn(`Failed to load entity avatar: ${avatarUrl}, falling back to placeholder.`);
            e.target.style.backgroundImage = `url('${DEFAULT_ENTITY_PLACEHOLDER_IMAGE}')`; // Set background to placeholder
        }
     };


    return (
        <div className="character-page fadeIn">
            <div className="page-header">
                <h1 className="page-title">
                    <i
                        className="fas fa-arrow-left fa-fw"
                        onClick={goBack}
                        title="Back to list"
                        style={{ cursor: 'pointer', marginRight: '15px' }}
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
                    {/* Mod count display - now updated by refetch */}
                    <p style={{fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', marginTop:'15px'}}>
                        Mods in library: {entity.mod_count ?? '...'}
                    </p>
                </div>
            </div>

            {/* Mods Section */}
            <div className="mods-section">
                <div className="section-header">
                    <h2 className="section-title">Available Mods ({assets.length})</h2>
                </div>

                <div className="mods-grid">
                    {assets.length > 0 ? (
                        assets.map(asset => (
                            <ModCard
                                key={asset.id}
                                asset={asset}
                                entitySlug={entitySlug}
                                onToggleComplete={handleToggleComplete}
                                onEdit={handleOpenEditModal}
                                onDelete={handleOpenDeleteModal} // Pass delete handler
                            />
                        ))
                    ) : (
                        <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>
                           No mods found for {entity.name}. You can import mods via the sidebar.
                        </p>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && editingAsset && (
                <ModEditModal
                    asset={editingAsset}
                    currentEntitySlug={entitySlug} // Pass current slug for comparison logic in modal
                    onClose={handleCloseEditModal}
                    onSaveSuccess={(newTargetSlug) => handleSaveEditSuccess(editingAsset.id, newTargetSlug)} // Pass original ID and new slug
                />
            )}

             {/* Delete Confirmation Modal */}
            {isDeleteModalOpen && assetToDelete && (
                 <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={handleCloseDeleteModal}
                    onConfirm={handleConfirmDelete}
                    title="Confirm Deletion"
                    confirmText="Delete"
                    confirmButtonVariant="danger" // Style the confirm button as danger
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