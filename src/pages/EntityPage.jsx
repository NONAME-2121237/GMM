// src/pages/EntityPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import ModCard from '../components/ModCard';
import ModEditModal from '../components/ModEditModal';

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
const DEFAULT_ENTITY_PLACEHOLDER_IMAGE = '/api/placeholder/260/400?text=No+Image';

function EntityPage() {
    const { entitySlug } = useParams();
    const navigate = useNavigate();
    const [entity, setEntity] = useState(null);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingAsset, setEditingAsset] = useState(null); // State for the asset being edited
    const [isEditModalOpen, setIsEditModalOpen] = useState(false); // State for modal visibility

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

                    const updatedFolderName = newIsEnabledState ? baseFolderName : `DISABLED_${baseFolderName}`;
                    const updatedAsset = { ...asset, is_enabled: newIsEnabledState, folder_name: updatedFolderName };
                    console.log(`[EntityPage ${entitySlug}] Updated asset ${assetId} state:`, updatedAsset);
                    return updatedAsset;
                }
                return asset;
            })
        );
        // This state update might not be immediately reflected if we try to read `assets` right after this line.
        // Updating mod count based on this state change directly is difficult.
        // Option 1: Simple +/- 1 (might drift if initial state was wrong)
        // Option 2: Refetch entity details (reliable but slower)
        // Let's try Option 2 for reliability.
         invoke('get_entity_details', { entitySlug })
            .then(updatedEntityDetails => {
                console.log(`[EntityPage ${entitySlug}] Refetched entity details after toggle:`, updatedEntityDetails);
                setEntity(updatedEntityDetails);
            })
            .catch(err => console.error(`[EntityPage ${entitySlug}] Failed to refetch entity details after toggle:`, err));

    }, [entitySlug]); // Add entitySlug dependency because we refetch


    const goBack = () => {
         if (window.history.length > 2) {
            navigate(-1);
         } else {
             // Fallback to default category if no history
             // Determine default based on current entity? Or just always characters?
             const fallbackCategory = entity?.category_id === 1 ? 'characters' : 'characters'; // Example logic, needs refinement based on category IDs
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

    const handleSaveEditSuccess = useCallback((updatedAssetData) => {
         console.log("Saving successful, updating asset in state:", updatedAssetData);
        // Update the asset list state with the new data
        setAssets(currentAssets =>
            currentAssets.map(asset =>
                asset.id === updatedAssetData.id ? updatedAssetData : asset
            )
        );
        handleCloseEditModal(); // Close the modal on success
        // Optionally, force ModCard image reload if needed, though changing asset data should trigger its useEffect
    }, [handleCloseEditModal]);

    if (loading) return <div className="placeholder-text">Loading entity details for {entitySlug}... <i className="fas fa-spinner fa-spin"></i></div>;
    if (error) return <div className="placeholder-text" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
    if (!entity) return <div className="placeholder-text">Entity data could not be loaded.</div>;


    const details = parseDetails(entity.details);
    const element = details?.element;
    const elementIconClass = element ? (elementIconsFA[element] || 'fas fa-question-circle') : null;
    const weapon = details?.weapon;
    const weaponIconClass = weapon ? (weaponIconsFA[weapon] || 'fas fa-question-circle') : null;

    // Construct avatar URL - CHECKING THIS LOGIC
    // If base_image exists, construct path relative to public/images/entities/
    // Otherwise use the placeholder API/text-based placeholder
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
                {/* Button group removed for brevity, can be added back if needed */}
            </div>

            <div className="character-profile">
                {/* Entity Avatar */}
                <div
                    className="character-avatar"
                    style={{ backgroundImage: `url('${avatarUrl}')` }}
                    // onError doesn't work reliably for background images.
                    // We might need an inner <img> tag or rely on the fallback in the URL construction.
                    // Let's assume the URL construction handles the fallback for now.
                >
                 {/* If using an img tag instead: */}
                 {/* <img
                     src={avatarUrl}
                     alt={`${entity.name} Avatar`}
                     onError={handleAvatarError}
                     style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top' }}
                     loading="lazy"
                 /> */}
                </div>

                {/* Entity Info */}
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
                                onEdit={handleOpenEditModal} // Pass the edit handler
                            />
                        ))
                    ) : (
                        <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>
                           {/* No mods message */}
                        </p>
                    )}
                </div>
            </div>

            {/* Edit Modal */}
            {isEditModalOpen && editingAsset && (
                <ModEditModal
                    asset={editingAsset}
                    onClose={handleCloseEditModal}
                    onSaveSuccess={handleSaveEditSuccess}
                />
            )}
        </div>
    );
}

export default EntityPage;