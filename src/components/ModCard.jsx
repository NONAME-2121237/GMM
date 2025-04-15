import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
import KeybindsPopup from './KeybindsPopup';
import { toast } from 'react-toastify';
import AddToPresetModal from './AddToPresetModal';

// Helper to split tags, trimming whitespace and filtering empty ones
const parseTags = (tagString) => {
    if (!tagString || typeof tagString !== 'string') return [];
    return tagString.split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
};

const FALLBACK_MOD_IMAGE = '/images/placeholder.jpg';
const FALLBACK_MOD_IMAGE_BG = `url('${FALLBACK_MOD_IMAGE}')`;
const OTHER_ENTITY_SUFFIX = '-other'; // Define suffix constant

function ModCard({
    asset,
    entitySlug,
    onToggleComplete,
    onEdit,
    onDelete,
    viewMode = 'grid',
    isSelected = false,
    onSelectChange,
    onContextMenu,
}) {
    // State
    const isEnabled = asset.is_enabled;
    const [cleanRelativePath, setCleanRelativePath] = useState('');
    const [imageUrl, setImageUrl] = useState(FALLBACK_MOD_IMAGE); // State holds the URL string
    const folderNameOnDisk = asset.folder_name; // Reflects disk state
    const [isToggling, setIsToggling] = useState(false);
    const [imageBgCss, setImageBgCss] = useState(FALLBACK_MOD_IMAGE_BG); // For grid view background
    const [imageLoading, setImageLoading] = useState(false);
    const [imageError, setImageError] = useState(false);
    const objectUrlRef = useRef(null); // Ref to store temporary blob URL for cleanup
    const isOtherEntity = entitySlug?.endsWith(OTHER_ENTITY_SUFFIX);
    const tags = useMemo(() => parseTags(asset.category_tag), [asset.category_tag]);

    const [isKeybindsPopupOpen, setIsKeybindsPopupOpen] = useState(false);
    const [keybinds, setKeybinds] = useState([]);
    const [keybindsLoading, setKeybindsLoading] = useState(false);
    const [keybindsError, setKeybindsError] = useState('');
    // --- NEW STATE for Add To Preset Modal ---
    const [isAddToPresetModalOpen, setIsAddToPresetModalOpen] = useState(false);
    // ---------------------------------------

    // --- Effect to derive clean path ---
    useEffect(() => {
        const isCurrentlyDisabledPrefixed = asset.folder_name?.startsWith('DISABLED_');
        let cleanPath = asset.folder_name || '';
        if (isCurrentlyDisabledPrefixed) {
            const parts = asset.folder_name.split('/');
            const filename = parts.pop() || '';
            cleanPath = parts.length > 0 ? `${parts.join('/')}/${filename.substring(9)}` : filename.substring(9);
        }
        setCleanRelativePath(cleanPath);
    }, [asset.folder_name]);
    // -----------------------------------

    // Cleanup function
    const cleanupObjectUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []);

    // Toggle Handler
    const handleToggle = useCallback(async () => {
        if (isToggling) return;
        setIsToggling(true);
        try {
            const newIsEnabledState = await invoke('toggle_asset_enabled', { entitySlug, asset });
            onToggleComplete(asset.id, newIsEnabledState);
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown toggle error');
            console.error(`[ModCard ${asset.id}] Failed to toggle:`, errorString);
            toast.error(`Toggle failed for "${asset.name}": ${errorString.length > 100 ? errorString.substring(0, 97) + '...' : errorString}`);
        } finally {
            setIsToggling(false);
        }
     }, [isToggling, asset, entitySlug, onToggleComplete]);

    // Edit Handler
    const handleEditClick = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        onEdit(asset);
    }, [asset, onEdit]);

    // Delete Handler
    const handleDeleteClick = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        onDelete(asset);
    }, [asset, onDelete]);

    // Keybinds Popup Handlers
    const handleOpenKeybindsPopup = useCallback(async (e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsKeybindsPopupOpen(true);
        setKeybindsLoading(true);
        setKeybindsError('');
        setKeybinds([]);
        try {
            const fetchedKeybinds = await invoke('get_ini_keybinds', { assetId: asset.id });
            setKeybinds(fetchedKeybinds || []);
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown error');
            console.error(`Failed to fetch keybinds for asset ${asset.id}:`, errorString);
            setKeybindsError(`Failed to load keybinds: ${errorString}`);
            toast.error(`Failed to load keybinds for "${asset.name}".`); // Toast feedback
        } finally {
            setKeybindsLoading(false);
        }
    }, [asset.id, asset.name]);

    const handleCloseKeybindsPopup = useCallback(() => {
        setIsKeybindsPopupOpen(false);
        setKeybindsLoading(false);
        setKeybindsError('');
        setKeybinds([]);
    }, []);

    // --- NEW: Add To Preset Handlers ---
    const handleOpenAddToPreset = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        setIsAddToPresetModalOpen(true);
    }, []);

    const handleCloseAddToPreset = useCallback(() => {
        setIsAddToPresetModalOpen(false);
    }, []);
    // ---------------------------------

    // Checkbox change handler
    const handleCheckboxChange = useCallback((e) => {
         onSelectChange(asset.id, e.target.checked);
    }, [asset.id, onSelectChange]);

    // --- Image Loading Effect ---
    useEffect(() => {
        let isMounted = true;
        // Reset state upfront
        setImageUrl(FALLBACK_MOD_IMAGE);
        setImageError(false);
        setImageLoading(false);

        // console.log(`[ModCard ${asset.id}] Running Image Effect. ViewMode: ${viewMode}, Image Filename: ${asset.image_filename}`);

        // Guard condition: Only run for grid view AND if image filename exists
        if (viewMode !== 'grid' || !asset.image_filename) {
            // console.log(`[ModCard ${asset.id}] Skipping image load. ViewMode: ${viewMode}, Image Filename: ${asset.image_filename}`);
            return; // Exit early
        }

        setImageLoading(true); // Indicate loading process start
        // console.log(`[ModCard ${asset.id}] Image Effect: Getting image path for ${asset.image_filename}`);

        // Get the absolute path from the optimized backend command
        invoke('get_asset_image_path', { assetId: asset.id })
            .then(filePath => {
                if (!isMounted) return; // Check if component is still mounted
                if (!filePath) {
                    console.log(`[ModCard ${asset.id}] Backend returned no path for image.`);
                    throw new Error("No image path found."); // Trigger catch block
                }

                // console.log(`[ModCard ${asset.id}] Got absolute path: ${filePath}`);
                // Convert the absolute path to a Tauri asset URL
                const assetUrl = convertFileSrc(filePath);
                // console.log(`[ModCard ${asset.id}] Generated asset URL: ${assetUrl}`);

                if (isMounted) {
                    // Set the state to the asset:// URL. The browser/Tauri webview handles loading this.
                    setImageUrl(assetUrl);
                    setImageError(false);
                }
            })
            .catch(err => {
                 if (isMounted) {
                    const errorMsg = String(err.message || err);
                    if (!errorMsg.includes('not found') && !errorMsg.includes('No image path found')) {
                        console.warn(`[ModCard ${asset.id}] Failed to get image path or convert:`, errorMsg);
                    }
                    setImageUrl(FALLBACK_MOD_IMAGE); // Revert to fallback URL on error
                    setImageError(true);
                 }
            })
            .finally(() => {
                if (isMounted) {
                    setImageLoading(false); // Mark loading as complete
                }
            });

        // No cleanup needed for convertFileSrc URLs
        return () => {
            isMounted = false;
        };
    // Dependencies: Rerun only if ID, filename, or viewMode changes.
    }, [asset.id, asset.image_filename, viewMode]);

    // Style for Image Container (only used in grid mode)
    const imageContainerStyle = useMemo(() => ({
        marginBottom: '15px',
        height: '120px',
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.2)',
        backgroundImage: `url('${imageUrl}')`, // Use the URL directly
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        borderRadius: '6px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
        transition: 'background-image 0.1s ease-in-out', // Faster transition
    }), [imageUrl]); // Only depends on the final URL


    // --- RENDER ---

    // Compact List View Structure
    if (viewMode === 'list') {
        return (
            <>
                <div
                    className={`mod-card-list ${!isEnabled ? 'mod-disabled-visual' : ''}`}
                    title={`Path: ${cleanRelativePath}\n${asset.description || ''}`}
                    style={ isSelected ? { backgroundColor: 'rgba(156, 136, 255, 0.1)' } : {} }
                    onContextMenu={onContextMenu}
                >
                     <input
                         type="checkbox" checked={isSelected} onChange={handleCheckboxChange}
                         onClick={(e) => e.stopPropagation()}
                         style={{ marginRight: '10px', cursor: 'pointer', width: '16px', height: '16px' }}
                         aria-label={`Select mod ${asset.name}`}
                     />
                    <label className="toggle-switch compact-toggle">
                        <input type="checkbox" checked={isEnabled} onChange={handleToggle} disabled={isToggling} aria-label={`Enable/Disable ${asset.name} mod`} />
                        <span className="slider"></span>
                    </label>
                    <div className="mod-list-name"> {asset.name} </div>
                    {asset.author && ( <div className="mod-list-author" title={`Author: ${asset.author}`}> By: {asset.author} </div> )}
                    <div className="mod-list-actions">
                        {/* No Add to Preset button in list view for now */}
                        <button onClick={handleOpenKeybindsPopup} className="btn-icon compact-btn" title="View Keybinds" disabled={isToggling}> <i className="fas fa-keyboard fa-fw"></i> </button>
                        <button onClick={handleEditClick} className="btn-icon compact-btn" title="Edit Mod Info" disabled={isToggling}> <i className="fas fa-pencil-alt fa-fw"></i> </button>
                        <button onClick={handleDeleteClick} className="btn-icon compact-btn danger" title="Delete Mod" disabled={isToggling}> <i className="fas fa-trash-alt fa-fw"></i> </button>
                    </div>
                </div>
                <KeybindsPopup isOpen={isKeybindsPopupOpen} onClose={handleCloseKeybindsPopup} assetId={asset.id} assetName={asset.name} keybinds={keybinds} isLoading={keybindsLoading} error={keybindsError} />
                {/* AddToPresetModal is rendered outside the list item for potential reuse, maybe at page level? For now, keep it here */}
                <AddToPresetModal assetId={asset.id} assetName={asset.name} isOpen={isAddToPresetModalOpen} onClose={handleCloseAddToPreset} />
            </>
        );
    }

    // Default Grid View Structure
    return (
        <>
            <div className={`mod-card mod-card-grid ${!isEnabled ? 'mod-disabled-visual' : ''}`} title={`Path: ${cleanRelativePath}`} style={{ height: '100%' }} onContextMenu={onContextMenu}>
                <div style={imageContainerStyle}>
                    {imageLoading && ( <i className="fas fa-spinner fa-spin fa-2x" style={{ color: 'rgba(255,255,255,0.6)' }}></i> )}
                    {!imageLoading && imageUrl === FALLBACK_MOD_IMAGE && (
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '5px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                            {imageError ? 'Preview failed' : 'No preview'}
                        </span>
                    )}
                </div>
                <div className="mod-header">
                    <div className="mod-title">{asset.name}</div>
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', gap: '5px' }}>
                        <button onClick={handleEditClick} className="btn-icon" title="Edit Mod Info" style={gridButtonStyles.edit} onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7} disabled={isToggling} > <i className="fas fa-pencil-alt fa-fw"></i> </button>
                        <button onClick={handleDeleteClick} className="btn-icon" title="Delete Mod" style={gridButtonStyles.delete} onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7} disabled={isToggling} > <i className="fas fa-trash-alt fa-fw"></i> </button>
                        <label className="toggle-switch" style={{ marginLeft: '5px' }}> <input type="checkbox" checked={isEnabled} onChange={handleToggle} disabled={isToggling} aria-label={`Enable/Disable ${asset.name} mod`} /> <span className="slider"></span> </label>
                    </div>
                </div>
                {tags.length > 0 && ( <div className="mod-tags-container" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}> {tags.map((tag, index) => ( <span key={index} className="mod-category">{tag}</span> ))} </div> )}
                {asset.description ? ( <p className="mod-description">{asset.description}</p> ) : ( <p className="mod-description placeholder-text" style={{padding:0, textAlign:'left', fontStyle:'italic'}}>(No description)</p> )}
                <div className="mod-details">
                    <div className="mod-author">{asset.author ? `By: ${asset.author}` : '(Unknown author)'}</div>
                     <div style={{ display: 'flex', gap: '5px' }}> {/* Button group */}
                         {/* Add to Preset Button */}
                         <button className="btn-icon add-preset-button" onClick={handleOpenAddToPreset} title="Add to Preset(s)" style={gridButtonStyles.addPreset} disabled={isToggling} > <i className="fas fa-plus-circle fa-fw"></i> </button>
                         {/* Keybind Button */}
                         <button className="btn-icon keybind-button" onClick={handleOpenKeybindsPopup} title="View Keybinds" style={gridButtonStyles.keybind} disabled={isToggling} aria-label={`View keybinds for ${asset.name}`} > <i className="fas fa-keyboard fa-fw"></i> </button>
                     </div>
                </div>
            </div>
             <KeybindsPopup isOpen={isKeybindsPopupOpen} onClose={handleCloseKeybindsPopup} assetId={asset.id} assetName={asset.name} keybinds={keybinds} isLoading={keybindsLoading} error={keybindsError} />
             {/* --- Render AddToPresetModal --- */}
             <AddToPresetModal assetId={asset.id} assetName={asset.name} isOpen={isAddToPresetModalOpen} onClose={handleCloseAddToPreset} />
             {/* ----------------------------- */}
         </>
    );
}

// Updated grid styles including AddPreset button
const gridButtonBase = { background:'none', border:'none', cursor:'pointer', fontSize:'15px', padding:'5px', opacity: 0.7, transition: 'opacity 0.2s ease, color 0.2s ease', color: 'var(--light)' };
const gridButtonStyles = {
    edit: { ...gridButtonBase },
    delete: { ...gridButtonBase, color:'var(--danger)' },
    keybind: { ...gridButtonBase },
    addPreset: { ...gridButtonBase } // Style for the add to preset button
};

export default React.memo(ModCard);