// --- START OF FILE src/components/ModCard.jsx ---
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@tauri-apps/api/tauri';

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

function ModCard({ asset, entitySlug, onToggleComplete, onEdit, onDelete }) {
    // --- State ---
    const isEnabled = asset.is_enabled; // Derived from props
    const folderNameOnDisk = asset.folder_name; // Derived from props, reflects disk state
    const [isToggling, setIsToggling] = useState(false);
    const [imageBgCss, setImageBgCss] = useState(FALLBACK_MOD_IMAGE_BG); // Stores background-image CSS value
    const [imageLoading, setImageLoading] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [toggleError, setToggleError] = useState(null);
    const objectUrlRef = useRef(null); // Ref to store temporary blob URL for cleanup

    // --- Determine if image loading should be skipped ---
    const isOtherEntity = entitySlug?.endsWith(OTHER_ENTITY_SUFFIX);

    // --- Memoized Tags ---
    const tags = useMemo(() => parseTags(asset.category_tag), [asset.category_tag]);

    // --- Callbacks ---
    const cleanupObjectUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []);

    // Effect to load image data
    useEffect(() => {
        // --- ADD CHECK: Skip image loading for 'other' entities ---
        if (isOtherEntity) {
            console.log(`[ModCard ${asset.id}] Skipping image load for 'Other' entity.`);
            setImageBgCss(FALLBACK_MOD_IMAGE_BG); // Ensure fallback is set
            setImageLoading(false);
            setImageError(false);
            cleanupObjectUrl();
            return; // Exit effect early
        }
        // --- END CHECK ---

        let isMounted = true;
        // Reset state on asset change (if not 'other')
        setImageBgCss(FALLBACK_MOD_IMAGE_BG);
        setImageError(false);
        setImageLoading(false);
        setToggleError(null);
        cleanupObjectUrl();

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
                // ... (rest of the image loading logic remains the same) ...
                 if (!isMounted || !fileData) return Promise.reject(new Error("Component unmounted or no file data")); // Stop chain
                console.log(`[ModCard ${asset.id}] Read binary data (length: ${fileData.length})`);
                 try {
                    const extension = asset.image_filename.split('.').pop().toLowerCase();
                    let mimeType = 'image/png'; // Default
                    if (['jpg', 'jpeg'].includes(extension)) mimeType = 'image/jpeg';
                    else if (extension === 'gif') mimeType = 'image/gif';
                    else if (extension === 'webp') mimeType = 'image/webp';
                    const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    objectUrlRef.current = url; // Store for cleanup
                    if (isMounted) {
                        setImageBgCss(`url('${url}')`); // Set the CSS background value
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
    // Add isOtherEntity to dependency array
    }, [asset.id, asset.image_filename, folderNameOnDisk, entitySlug, cleanupObjectUrl, isOtherEntity]);

    // Toggle Handler (remains the same)
    const handleToggle = useCallback(async () => { /* ... */
        if (isToggling) return;
        setIsToggling(true);
        setToggleError(null);
        console.log(`[ModCard ${asset.id}] Toggle initiated. Current UI state: ${isEnabled}`);
        try {
            const newIsEnabledState = await invoke('toggle_asset_enabled', {
                entitySlug: entitySlug,
                asset: asset
            });
            console.log(`[ModCard ${asset.id}] Toggle successful. Backend reported new state: ${newIsEnabledState}`);
            onToggleComplete(asset.id, newIsEnabledState); // Inform parent
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown toggle error');
            console.error(`[ModCard ${asset.id}] Failed to toggle mod ${asset.name}:`, errorString);
            setToggleError(`Toggle failed: ${errorString}`);
        } finally {
            setIsToggling(false);
        }
     }, [isToggling, asset, entitySlug, onToggleComplete, isEnabled]);

    // Edit Handler (remains the same)
    const handleEditClick = useCallback((e) => { /* ... */
        e.stopPropagation();
        e.preventDefault();
        onEdit(asset); // Call parent's edit handler
    }, [asset, onEdit]);

    // Delete Handler (remains the same)
    const handleDeleteClick = useCallback((e) => { /* ... */
        e.stopPropagation();
        e.preventDefault();
        onDelete(asset); // Call parent's delete handler
    }, [asset, onDelete]);


    // --- Style for Image Container ---
    const imageContainerStyle = useMemo(() => ({
        marginBottom: '15px',
        height: '120px',
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.2)',
        // Use fallback background if it's an 'other' entity or loading/error
        backgroundImage: (isOtherEntity || imageLoading) ? FALLBACK_MOD_IMAGE_BG : imageBgCss,
        backgroundSize: 'cover',
        backgroundPosition: 'center center',
        backgroundRepeat: 'no-repeat',
        borderRadius: '6px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
    }), [imageLoading, imageBgCss, isOtherEntity]);

    // --- Render ---
    return (
        <div className={`mod-card ${!isEnabled ? 'mod-disabled-visual' : ''}`} title={`Folder: ${folderNameOnDisk}`}>
            {/* Image Display Area */}
            <div style={imageContainerStyle}>
                {imageLoading && !isOtherEntity && ( // Only show spinner if not 'other'
                    <i className="fas fa-spinner fa-spin fa-2x" style={{ color: 'rgba(255,255,255,0.6)' }}></i>
                )}
                {/* Show placeholder text if loading failed, or if it's 'other' */}
                {!imageLoading && (imageBgCss === FALLBACK_MOD_IMAGE_BG || isOtherEntity) && (
                     <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '5px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                        {isOtherEntity ? 'Preview N/A' : (imageError ? 'Preview failed' : 'No preview')}
                    </span>
                )}
            </div>

            {/* Mod Header (remains the same) */}
             <div className="mod-header">
                <div className="mod-title">{asset.name}</div>
                 <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto', gap: '5px' }}>
                    <button onClick={handleEditClick} className="btn-icon" title="Edit Mod Info" style={{ background:'none', border:'none', color:'var(--light)', cursor:'pointer', fontSize:'15px', padding:'5px', opacity: 0.7 }} onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7} disabled={isToggling} >
                        <i className="fas fa-pencil-alt fa-fw"></i>
                    </button>
                    <button onClick={handleDeleteClick} className="btn-icon" title="Delete Mod" style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:'15px', padding:'5px', opacity: 0.7 }} onMouseOver={(e) => e.currentTarget.style.opacity = 1} onMouseOut={(e) => e.currentTarget.style.opacity = 0.7} disabled={isToggling} >
                        <i className="fas fa-trash-alt fa-fw"></i>
                    </button>
                    <label className="toggle-switch" style={{ marginLeft: '5px' }}>
                        <input type="checkbox" checked={isEnabled} onChange={handleToggle} disabled={isToggling} aria-label={`Enable/Disable ${asset.name} mod`} />
                        <span className="slider"></span>
                    </label>
                 </div>
            </div>

            {/* Tags (remains the same) */}
             {tags.length > 0 && (
                <div className="mod-tags-container" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {tags.map((tag, index) => (
                        <span key={index} className="mod-category">
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Description (remains the same) */}
             {asset.description ? (
                <p className="mod-description">{asset.description}</p>
            ) : (
                 <p className="mod-description placeholder-text" style={{padding:0, textAlign:'left', fontStyle:'italic'}}>(No description)</p>
            )}

             {/* Toggle Error (remains the same) */}
             {toggleError && <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: 'auto', paddingTop:'5px', flexShrink:0 }}>{toggleError}</p>}

            {/* Mod Details Footer (remains the same) */}
            <div className="mod-details">
                <div className="mod-author">
                    {asset.author ? `By: ${asset.author}` : '(Unknown author)'}
                </div>
                 <div className="key-binding" title="Keybinding (Not Implemented)">
                    <i className="fas fa-keyboard fa-fw"></i>
                 </div>
            </div>
        </div>
    );
}

export default ModCard;