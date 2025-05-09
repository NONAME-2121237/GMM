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
    onImageClick,
}) {
    // State
    const isEnabled = asset.is_enabled;
    const [cleanRelativePath, setCleanRelativePath] = useState('');
    const [imageUrl, setImageUrl] = useState(null); // State holds the URL string
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

    const handleImageClickInternal = useCallback(() => {
        if (!imageLoading && !imageError && imageUrl && imageUrl !== FALLBACK_MOD_IMAGE && onImageClick) {
            onImageClick(imageUrl);
        }
    }, [imageLoading, imageError, imageUrl, onImageClick]);

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

    // --- NEW: Open Folder Handler ---
    const handleOpenFolder = useCallback(async (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
            await invoke('open_asset_folder', { assetId: asset.id });
        } catch (err) {
            console.error(`Failed to open folder for asset ${asset.id}:`, err);
            toast.error(`Failed to open folder: ${err}`); // User feedback
        }
    }, [asset.id]);
    // -----------------------------

    // Checkbox change handler
    const handleCheckboxChange = useCallback((e) => {
         onSelectChange(asset.id, e.target.checked);
    }, [asset.id, onSelectChange]);

    // --- Image Loading Effect ---
    useEffect(() => {
        let isMounted = true;
        // Reset state upfront
        setImageUrl(null);
        setImageError(false);
        setImageLoading(false);

        // No need to check viewMode here if list also shows image
        if (!asset.image_filename) {
            setImageUrl(FALLBACK_MOD_IMAGE); // Set fallback if no filename
            return;
        }

        // Guard condition: Only run for grid view AND if image filename exists
        if (!asset.image_filename) {
            // console.log(`[ModCard ${asset.id}] Skipping image load. ViewMode: ${viewMode}, Image Filename: ${asset.image_filename}`);
            return; // Exit early
        }

        setImageLoading(true); // Indicate loading process start
        // console.log(`[ModCard ${asset.id}] Image Effect: Getting image path for ${asset.image_filename}`);

        // Get the absolute path from the optimized backend command
        invoke('get_asset_image_path', { assetId: asset.id })
            .then(filePath => {
                if (!isMounted) return;
                if (!filePath) throw new Error("No image path found.");
                const assetUrl = convertFileSrc(filePath);
                // console.log(`[ModCard ${asset.id}, ${viewMode}] Image URL set: ${assetUrl}`);
                if (isMounted) {
                    setImageUrl(assetUrl);
                    setImageError(false);
                }
            })
            .catch(err => {
                 if (isMounted) {
                    // console.warn(`[ModCard ${asset.id}, ${viewMode}] Failed image load:`, String(err.message || err));
                    setImageUrl(FALLBACK_MOD_IMAGE);
                    setImageError(true);
                 }
            })
            .finally(() => {
                if (isMounted) {
                    setImageLoading(false);
                }
            });

        return () => { isMounted = false; };
    }, [asset.id, asset.image_filename]);

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

    const ImagePreview = () => (
        <div
            className={`mod-image-container view-${viewMode}`}
            // Apply specific container styles based on viewMode
            style={viewMode === 'grid' ? gridImageContainerStyle : listImageContainerStyle}
            onClick={handleImageClickInternal}
            title={imageUrl && imageUrl !== FALLBACK_MOD_IMAGE ? "点击放大预览" : undefined}
        >
            {imageLoading && <i className="fas fa-spinner fa-spin"></i>}
            {/* Render img only when not loading and URL is available */}
            {!imageLoading && imageUrl && (
                <img
                    src={imageUrl}
                    alt={imageError ? "Preview failed" : `${asset.name} preview`}
                    className={`mod-image ${imageError ? 'error' : ''}`}
                    // Apply specific image styles based on viewMode
                    style={viewMode === 'grid' ? gridImageViewStyle : listImageViewStyle}
                     // Let the useEffect handle the error state and fallback URL
                     // onError={() => { if (!imageError) setImageError(true); setImageUrl(FALLBACK_MOD_IMAGE); }}
                />
            )}
             {/* Show placeholder text only if not loading and no valid image URL (e.g., initial state or error) */}
             {!imageLoading && !imageUrl && (
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)'}}>No Preview</span>
             )}
              {!imageLoading && imageUrl === FALLBACK_MOD_IMAGE && imageError && (
                  <span style={{ fontSize: '10px', color: 'rgba(255,100,100,0.7)'}}>Load Failed</span>
             )}
        </div>
    );

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
                     {/* Checkbox */}
                     <input type="checkbox" checked={isSelected} onChange={handleCheckboxChange} onClick={(e) => e.stopPropagation()} style={listStyles.checkbox} aria-label={`Select mod ${asset.name}`} />
                     {/* Image Preview (Small) */}
                     <ImagePreview /> {/* Renders the common component */}
                     {/* Name & Author */}
                     <div style={listStyles.nameAuthorContainer}>
                         <div className="mod-list-name" style={listStyles.name}> {asset.name} </div>
                         {asset.author && ( <div className="mod-list-author" style={listStyles.author} title={`Author: ${asset.author}`}> By: {asset.author} </div> )}
                     </div>
                     {/* Toggle */}
                     <label className="toggle-switch compact-toggle" style={listStyles.toggle}>
                         <input type="checkbox" checked={isEnabled} onChange={handleToggle} disabled={isToggling} aria-label={`Enable/Disable ${asset.name} mod`} />
                         <span className="slider"></span>
                     </label>
                     {/* Actions */}
                     <div className="mod-list-actions" style={listStyles.actions}>
                         {/* --- ADDED: Open Folder Button --- */}
                         <button onClick={handleOpenFolder} className="btn-icon compact-btn" title="打开模组文件夹" disabled={isToggling}> <i className="fas fa-folder-open fa-fw"></i> </button>
                         {/* --- End Added Button --- */}
                         <button onClick={handleOpenKeybindsPopup} className="btn-icon compact-btn" title="查看按键绑定" disabled={isToggling}> <i className="fas fa-keyboard fa-fw"></i> </button>
                         <button onClick={handleEditClick} className="btn-icon compact-btn" title="编辑模组信息" disabled={isToggling}> <i className="fas fa-pencil-alt fa-fw"></i> </button>
                         <button onClick={handleDeleteClick} className="btn-icon compact-btn danger" title="删除模组" disabled={isToggling}> <i className="fas fa-trash-alt fa-fw"></i> </button>
                     </div>
                </div>
                 {/* Modals */}
                <KeybindsPopup isOpen={isKeybindsPopupOpen} onClose={handleCloseKeybindsPopup} assetId={asset.id} assetName={asset.name} keybinds={keybinds} isLoading={keybindsLoading} error={keybindsError} />
                <AddToPresetModal assetId={asset.id} assetName={asset.name} isOpen={isAddToPresetModalOpen} onClose={handleCloseAddToPreset} />
            </>
        );
    }

    // Default Grid View Structure
    return (
        <>
            <div className={`mod-card mod-card-grid ${!isEnabled ? 'mod-disabled-visual' : ''}`} title={`Path: ${cleanRelativePath}`} style={{ height: '100%' }} onContextMenu={onContextMenu}>
                {/* Image Preview (Large Banner) */}
                <ImagePreview />
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
                         <button className="btn-icon add-preset-button" onClick={handleOpenAddToPreset} title="添加到预设" style={gridButtonStyles.addPreset} disabled={isToggling} > <i className="fas fa-plus-circle fa-fw"></i> </button>
                         {/* --- ADDED: Open Folder Button --- */}
                         <button className="btn-icon open-folder-button" onClick={handleOpenFolder} title="打开模组文件夹" style={gridButtonStyles.openFolder} disabled={isToggling} > <i className="fas fa-folder-open fa-fw"></i> </button>
                         {/* --- End Added Button --- */}
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

// Updated grid styles including AddPreset and OpenFolder buttons
const gridButtonBase = { background:'none', border:'none', cursor:'pointer', fontSize:'15px', padding:'5px', opacity: 0.7, transition: 'opacity 0.2s ease, color 0.2s ease', color: 'var(--light)' };
const gridButtonStyles = {
    edit: { ...gridButtonBase },
    delete: { ...gridButtonBase, color:'var(--danger)' },
    keybind: { ...gridButtonBase },
    addPreset: { ...gridButtonBase }, // Style for the add to preset button
    openFolder: { ...gridButtonBase } // Style for the open folder button
};

// Base styles for the image container div
const imageContainerBaseStyle = {
    width: '100%',
    backgroundColor: 'rgba(0,0,0,0.2)', // Fallback BG
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
    cursor: 'default', // Default cursor
};
// Styles for Grid View Image
const gridImageContainerStyle = {
    ...imageContainerBaseStyle,
    marginBottom: '15px',
    height: '120px', // Keep banner height
    borderRadius: '6px',
    cursor: 'pointer', // Make it clickable
};
const gridImageViewStyle = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'contain', // Or 'cover' if you prefer the original look
};
// Styles for List View Image
const listImageContainerStyle = {
    ...imageContainerBaseStyle,
    width: '45px', // Fixed width for list item image
    height: '45px', // Fixed height
    borderRadius: '4px',
    marginRight: '12px',
    flexShrink: 0, // Prevent shrinking
};
const listImageViewStyle = {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover', // Cover usually looks better for small list icons
};
// Specific styles for list items layout using flex
const listStyles = {
    checkbox: { marginRight: '10px', cursor: 'pointer', width: '16px', height: '16px', flexShrink: 0 },
    nameAuthorContainer: { display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'hidden', marginRight: '10px' },
    name: { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px' },
    author: { fontSize: '11px', color: 'rgba(255, 255, 255, 0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
    toggle: { marginLeft: 'auto', marginRight: '10px', flexShrink: 0 },
    actions: { display: 'flex', gap: '2px', flexShrink: 0 }, // Adjusted gap for new button
};

export default React.memo(ModCard);