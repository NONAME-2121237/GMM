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
    // --- Store clean path separately ---
    const [cleanRelativePath, setCleanRelativePath] = useState('');
    // -------------------------------
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

    // --- MODIFIED Image Loading Effect ---
    useEffect(() => {
        let isMounted = true;
        setImageBgCss(FALLBACK_MOD_IMAGE_BG); // Reset on asset change
        setImageError(false);
        setImageLoading(false);
        cleanupObjectUrl(); // Clean up previous blob URL

        // Only load if in grid view and image filename exists
        if (viewMode !== 'grid' || !asset.image_filename) {
            return;
        }

        setImageLoading(true);
        console.log(`[ModCard ${asset.id}] Image Effect: Attempting load for ${asset.image_filename}`);

        // Call the MODIFIED backend command using assetId
        invoke('get_asset_image_path', { assetId: asset.id })
            .then(filePath => {
                if (!isMounted) return Promise.reject(new Error("Component unmounted"));
                if (!filePath) throw new Error("Backend returned empty path.");
                console.log(`[ModCard ${asset.id}] Got absolute path: ${filePath}`);
                return invoke('read_binary_file', { path: filePath });
            })
            .then(fileData => {
                 if (!isMounted || !fileData) return Promise.reject(new Error("Component unmounted or no file data"));
                 console.log(`[ModCard ${asset.id}] Read binary data (length: ${fileData.length})`);
                 try {
                    const extension = asset.image_filename.split('.').pop().toLowerCase();
                    let mimeType = 'image/png';
                    if (['jpg', 'jpeg'].includes(extension)) mimeType = 'image/jpeg';
                    else if (extension === 'gif') mimeType = 'image/gif';
                    else if (extension === 'webp') mimeType = 'image/webp';
                    const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    objectUrlRef.current = url;
                    if (isMounted) {
                        setImageBgCss(`url('${url}')`);
                        setImageError(false);
                        console.log(`[ModCard ${asset.id}] Created Object URL: ${url}`);
                    } else {
                         URL.revokeObjectURL(url);
                         objectUrlRef.current = null;
                         console.log(`[ModCard ${asset.id}] Component unmounted before setting Object URL state, revoked.`);
                    }
                 } catch (blobError) {
                    console.error(`[ModCard ${asset.id}] Error creating blob/URL:`, blobError);
                     if(isMounted) {
                        setImageBgCss(FALLBACK_MOD_IMAGE_BG);
                        setImageError(true);
                     }
                 }
            })
            .catch(err => {
                 if (isMounted) {
                    // Don't log "Folder not found" or "Image file not found" as errors if it's expected
                    const errorMsg = String(err.message || err);
                    if (!errorMsg.includes('not found')) {
                        console.warn(`[ModCard ${asset.id}] Failed to get/read image ${asset.image_filename}:`, errorMsg);
                    } else {
                        console.log(`[ModCard ${asset.id}] Image/folder not found for ${asset.image_filename}.`);
                    }
                    setImageBgCss(FALLBACK_MOD_IMAGE_BG);
                    setImageError(true); // Still indicate an error state visually if needed
                 }
            })
            .finally(() => {
                if (isMounted) {
                    setImageLoading(false);
                }
            });
        return () => {
            isMounted = false;
            cleanupObjectUrl();
        };
    // Dependencies: asset.id and asset.image_filename trigger the path/read, viewMode controls execution
    }, [asset.id, asset.image_filename, viewMode, cleanupObjectUrl]);
    // --- END MODIFIED Effect ---

    // Style for Image Container (only used in grid mode)
    const imageContainerStyle = useMemo(() => ({
        marginBottom: '15px',
        height: '120px',
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.2)',
        backgroundImage: imageLoading ? FALLBACK_MOD_IMAGE_BG : imageBgCss,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        borderRadius: '6px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
    }), [imageLoading, imageBgCss]);


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
                    {!imageLoading && imageBgCss === FALLBACK_MOD_IMAGE_BG && (
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

export default ModCard;