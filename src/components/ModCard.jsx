import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';

// Helper to split tags, trimming whitespace and filtering empty ones
const parseTags = (tagString) => {
    if (!tagString || typeof tagString !== 'string') return [];
    return tagString.split(',')
                    .map(tag => tag.trim())
                    .filter(tag => tag.length > 0);
};

// API placeholder for fallback background image
const FALLBACK_MOD_IMAGE = '/api/placeholder/100/60?text=No+Preview';
const FALLBACK_MOD_IMAGE_BG = `url('${FALLBACK_MOD_IMAGE}')`;
const OTHER_ENTITY_SUFFIX = '-other'; // Define suffix constant

function ModCard({ asset, entitySlug, onToggleComplete, onEdit, onDelete, viewMode = 'grid' }) {
    // State
    const isEnabled = asset.is_enabled;
    const folderNameOnDisk = asset.folder_name; // Reflects disk state
    const [isToggling, setIsToggling] = useState(false);
    const [imageBgCss, setImageBgCss] = useState(FALLBACK_MOD_IMAGE_BG); // For grid view background
    const [imageLoading, setImageLoading] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [toggleError, setToggleError] = useState(null);
    const objectUrlRef = useRef(null); // Ref to store temporary blob URL for cleanup
    const isOtherEntity = entitySlug?.endsWith(OTHER_ENTITY_SUFFIX);
    const tags = useMemo(() => parseTags(asset.category_tag), [asset.category_tag]);

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
        setToggleError(null);
        try {
            const newIsEnabledState = await invoke('toggle_asset_enabled', { entitySlug, asset });
            onToggleComplete(asset.id, newIsEnabledState);
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown toggle error');
            console.error(`[ModCard ${asset.id}] Failed to toggle:`, errorString);
            setToggleError(`Toggle failed: ${errorString.length > 100 ? errorString.substring(0, 97) + '...' : errorString}`); // Truncate long errors
        } finally {
            setIsToggling(false);
        }
     }, [isToggling, asset, entitySlug, onToggleComplete]);

    // Edit Handler
    const handleEditClick = useCallback((e) => {
        e.stopPropagation(); // Prevent potential parent clicks
        e.preventDefault();
        onEdit(asset);
    }, [asset, onEdit]);

    // Delete Handler
    const handleDeleteClick = useCallback((e) => {
        e.stopPropagation(); // Prevent potential parent clicks
        e.preventDefault();
        onDelete(asset);
    }, [asset, onDelete]);


    // Effect to load image data (only relevant for grid view display)
    useEffect(() => {
        let isMounted = true;
        setImageBgCss(FALLBACK_MOD_IMAGE_BG); // Reset on asset change
        setImageError(false);
        setImageLoading(false);
        cleanupObjectUrl(); // Clean up previous blob URL

        // No need to fetch image if in list mode or 'other' entity
        if (viewMode !== 'grid' || isOtherEntity) {
            return;
        }

        if (asset.image_filename && folderNameOnDisk) {
            setImageLoading(true);
            console.log(`[ModCard ${asset.id}] Image Effect: Attempting load for ${asset.image_filename} in ${folderNameOnDisk}`);
            invoke('get_asset_image_path', { entitySlug: entitySlug, folderNameOnDisk: folderNameOnDisk, imageFilename: asset.image_filename })
            .then(filePath => {
                if (!isMounted) return Promise.reject(new Error("Component unmounted"));
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
                    console.warn(`[ModCard ${asset.id}] Failed to get/read image ${asset.image_filename}:`, err.message || err);
                    setImageBgCss(FALLBACK_MOD_IMAGE_BG);
                    setImageError(true);
                 }
            })
            .finally(() => {
                if (isMounted) {
                    setImageLoading(false);
                }
            });
        } else {
             console.log(`[ModCard ${asset.id}] No image filename or folder name defined.`);
             setImageBgCss(FALLBACK_MOD_IMAGE_BG);
        }
        return () => {
            isMounted = false;
            cleanupObjectUrl();
        };

    }, [asset.id, asset.image_filename, folderNameOnDisk, entitySlug, cleanupObjectUrl, isOtherEntity, viewMode]); // Rerun if viewMode changes back to grid

    // Reset toggle error when asset changes or its enabled state is updated from parent
     useEffect(() => {
        setToggleError(null);
     }, [asset.id, isEnabled]);


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
            <div
                className={`mod-card-list ${!isEnabled ? 'mod-disabled-visual' : ''}`}
                title={`Folder: ${folderNameOnDisk}\n${asset.description || ''}`}
            >
                 <label className="toggle-switch compact-toggle">
                     <input type="checkbox" checked={isEnabled} onChange={handleToggle} disabled={isToggling} aria-label={`Enable/Disable ${asset.name} mod`} />
                     <span className="slider"></span>
                 </label>
                <div className="mod-list-name">
                    {asset.name}
                 </div>
                 {asset.author && (
                    <div className="mod-list-author" title={`Author: ${asset.author}`}>
                         By: {asset.author}
                     </div>
                 )}
                 {toggleError && <div className="mod-list-error" title={toggleError}> <i className="fas fa-exclamation-triangle"></i> </div>}
                 <div className="mod-list-actions">
                    <button onClick={handleEditClick} className="btn-icon compact-btn" title="Edit Mod Info" disabled={isToggling}>
                        <i className="fas fa-pencil-alt fa-fw"></i>
                    </button>
                    <button onClick={handleDeleteClick} className="btn-icon compact-btn danger" title="Delete Mod" disabled={isToggling}>
                        <i className="fas fa-trash-alt fa-fw"></i>
                    </button>
                 </div>
            </div>
        );
    }

    // Default Grid View Structure
    return (
        <div className={`mod-card mod-card-grid ${!isEnabled ? 'mod-disabled-visual' : ''}`} title={`Folder: ${folderNameOnDisk}`}>
            {!isOtherEntity && (
                <div style={imageContainerStyle}>
                     {imageLoading && ( <i className="fas fa-spinner fa-spin fa-2x" style={{ color: 'rgba(255,255,255,0.6)' }}></i> )}
                     {!imageLoading && imageBgCss === FALLBACK_MOD_IMAGE_BG && (
                        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '5px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                            {imageError ? 'Preview failed' : 'No preview'}
                        </span>
                     )}
                </div>
            )}
             <div className="mod-header">
                <div className="mod-title">{asset.name}</div>
                 <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', gap: '5px' }}>
                    <button onClick={handleEditClick} className="btn-icon" title="Edit Mod Info" style={gridButtonStyles.edit} onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7} disabled={isToggling} >
                        <i className="fas fa-pencil-alt fa-fw"></i>
                    </button>
                    <button onClick={handleDeleteClick} className="btn-icon" title="Delete Mod" style={gridButtonStyles.delete} onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7} disabled={isToggling} >
                        <i className="fas fa-trash-alt fa-fw"></i>
                    </button>
                    <label className="toggle-switch" style={{ marginLeft: '5px' }}>
                        <input type="checkbox" checked={isEnabled} onChange={handleToggle} disabled={isToggling} aria-label={`Enable/Disable ${asset.name} mod`} />
                        <span className="slider"></span>
                    </label>
                 </div>
            </div>
             {tags.length > 0 && (
                <div className="mod-tags-container" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {tags.map((tag, index) => ( <span key={index} className="mod-category">{tag}</span> ))}
                </div>
             )}
             {asset.description ? ( <p className="mod-description">{asset.description}</p> ) : ( <p className="mod-description placeholder-text" style={{padding:0, textAlign:'left', fontStyle:'italic'}}>(No description)</p> )}
             {toggleError && <p style={gridStyles.errorTextGrid}>{toggleError}</p>}
            <div className="mod-details">
                <div className="mod-author">{asset.author ? `By: ${asset.author}` : '(Unknown author)'}</div>
                 <div className="key-binding" title="Keybinding (Not Implemented)"><i className="fas fa-keyboard fa-fw"></i></div>
            </div>
        </div>
    );
}

// Styles specifically for grid buttons
const gridButtonBase = { background:'none', border:'none', cursor:'pointer', fontSize:'15px', padding:'5px', opacity: 0.7 };
const gridButtonStyles = {
    edit: { ...gridButtonBase, color:'var(--light)' },
    delete: { ...gridButtonBase, color:'var(--danger)' },
};
// Style for grid toggle error
const gridStyles = {
     errorTextGrid: { color: 'var(--danger)', fontSize: '12px', marginTop: 'auto', paddingTop:'5px', flexShrink:0, textAlign:'right' }
};

export default ModCard;