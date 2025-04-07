// src/components/ModCard.jsx
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

function ModCard({ asset, entitySlug, onToggleComplete, onEdit }) {
    // --- State ---
    const isEnabled = asset.is_enabled; // Derived from props
    const folderNameOnDisk = asset.folder_name; // Derived from props, reflects disk state
    const [isToggling, setIsToggling] = useState(false);
    const [imageBgCss, setImageBgCss] = useState(FALLBACK_MOD_IMAGE_BG); // Stores background-image CSS value
    const [imageLoading, setImageLoading] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [toggleError, setToggleError] = useState(null);
    const objectUrlRef = useRef(null); // Ref to store temporary blob URL for cleanup

    // --- Memoized Tags ---
    const tags = useMemo(() => parseTags(asset.category_tag), [asset.category_tag]);

    // --- Callbacks ---
    // Cleanup function for Object URL
    const cleanupObjectUrl = useCallback(() => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    }, []); // No dependency needed as it only uses the ref

    // Effect to load image data
    useEffect(() => {
        let isMounted = true;
        // Reset state on asset change
        setImageBgCss(FALLBACK_MOD_IMAGE_BG);
        setImageError(false);
        setImageLoading(false);
        cleanupObjectUrl(); // Clean up previous URL before starting

        if (asset.image_filename && folderNameOnDisk) {
            setImageLoading(true);
            console.log(`[ModCard ${asset.id}] Image Effect: Attempting load for ${asset.image_filename} in ${folderNameOnDisk}`);

            // Chain promises: Get path -> Read data -> Create Blob URL
            invoke('get_asset_image_path', {
                entitySlug: entitySlug, // May not be strictly needed by backend
                folderNameOnDisk: folderNameOnDisk,
                imageFilename: asset.image_filename
            })
            .then(filePath => {
                if (!isMounted) return Promise.reject(new Error("Component unmounted")); // Stop chain if unmounted
                console.log(`[ModCard ${asset.id}] Got absolute path: ${filePath}`);
                return invoke('read_binary_file', { path: filePath });
            })
            .then(fileData => {
                if (!isMounted || !fileData) return Promise.reject(new Error("Component unmounted or no file data")); // Stop chain
                console.log(`[ModCard ${asset.id}] Read binary data (length: ${fileData.length})`);

                 try {
                    // Determine image type from filename (basic detection)
                    const extension = asset.image_filename.split('.').pop().toLowerCase();
                    let mimeType = 'image/png'; // Default
                    if (['jpg', 'jpeg'].includes(extension)) mimeType = 'image/jpeg';
                    else if (extension === 'gif') mimeType = 'image/gif';
                    else if (extension === 'webp') mimeType = 'image/webp';
                    // Add more types as needed

                    const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
                    const url = URL.createObjectURL(blob);
                    objectUrlRef.current = url; // Store for cleanup

                    // Check mount again before setting state
                    if (isMounted) {
                        setImageBgCss(`url('${url}')`); // Set the CSS background value
                        setImageError(false);
                        console.log(`[ModCard ${asset.id}] Created Object URL: ${url}`);
                    } else {
                         // If unmounted between blob creation and setState, cleanup immediately
                         URL.revokeObjectURL(url);
                         objectUrlRef.current = null;
                         console.log(`[ModCard ${asset.id}] Component unmounted before setting Object URL state, revoked.`);
                    }

                 } catch (blobError) {
                    // Handle potential errors during Blob/URL creation
                    console.error(`[ModCard ${asset.id}] Error creating blob/URL:`, blobError);
                     if(isMounted) {
                        setImageBgCss(FALLBACK_MOD_IMAGE_BG);
                        setImageError(true);
                     }
                 }
            })
            .catch(err => {
                 if (isMounted) {
                    // Catch errors from any part of the promise chain
                    console.warn(`[ModCard ${asset.id}] Failed to get/read image ${asset.image_filename}:`, err.message || err);
                    setImageBgCss(FALLBACK_MOD_IMAGE_BG);
                    setImageError(true);
                 }
            })
            .finally(() => {
                // Ensure loading state is turned off if still mounted
                if (isMounted) {
                    setImageLoading(false);
                }
            });
        } else {
             // No image filename or folder specified
             console.log(`[ModCard ${asset.id}] No image filename or folder name defined.`);
             setImageBgCss(FALLBACK_MOD_IMAGE_BG); // Ensure fallback if no image defined
        }

        // Cleanup function for the effect: called on unmount or before effect reruns
        return () => {
            isMounted = false;
            cleanupObjectUrl();
        };
    // Dependencies: Rerun if the asset details relevant to image loading change
    }, [asset.id, asset.image_filename, folderNameOnDisk, entitySlug, cleanupObjectUrl]);

    // Toggle Handler
    const handleToggle = useCallback(async () => {
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
    }, [isToggling, asset, entitySlug, onToggleComplete, isEnabled]); // isEnabled might be redundant if asset covers it

    // Edit Handler
    const handleEditClick = useCallback((e) => {
        e.stopPropagation();
        e.preventDefault();
        onEdit(asset); // Call parent's edit handler
    }, [asset, onEdit]);

    // --- Style for Image Container ---
    const imageContainerStyle = useMemo(() => ({
        marginBottom: '15px',
        height: '120px',
        width: '100%',
        backgroundColor: 'rgba(0,0,0,0.2)',
        backgroundImage: imageLoading ? 'none' : imageBgCss,
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

    // --- Render ---
    return (
        <div className={`mod-card ${!isEnabled ? 'mod-disabled-visual' : ''}`} title={`Folder: ${folderNameOnDisk}`}>
            {/* Image Display Area */}
            <div style={imageContainerStyle}>
                {imageLoading && (
                    <i className="fas fa-spinner fa-spin fa-2x" style={{ color: 'rgba(255,255,255,0.6)' }}></i>
                )}
                {!imageLoading && imageBgCss === FALLBACK_MOD_IMAGE_BG && (
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', padding: '5px', background: 'rgba(0,0,0,0.3)', borderRadius: '3px' }}>
                        {imageError ? 'Preview failed' : 'No preview'}
                    </span>
                )}
            </div>

            {/* Mod Header */}
             <div className="mod-header">
                <div className="mod-title">{asset.name}</div>
                {/* Edit Button */}
                <button
                    onClick={handleEditClick}
                    className="btn-icon" // Add a style for icon buttons if needed
                    title="Edit Mod Info"
                    style={{ background:'none', border:'none', color:'var(--light)', cursor:'pointer', fontSize:'16px', padding:'5px', marginLeft:'10px', opacity: 0.7 }}
                    onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                    onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                    disabled={isToggling} // Disable edit while toggling
                >
                    <i className="fas fa-pencil-alt fa-fw"></i>
                </button>
                {/* Toggle Switch */}
                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={isEnabled}
                        onChange={handleToggle}
                        disabled={isToggling}
                        aria-label={`Enable/Disable ${asset.name} mod`}
                    />
                    <span className="slider"></span>
                </label>
            </div>

            {/* Tags */}
             {tags.length > 0 && (
                <div className="mod-tags-container" style={{ marginBottom: '12px', display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                    {tags.map((tag, index) => (
                        <span key={index} className="mod-category"> {/* Reuse style or create specific 'mod-tag' */}
                            {tag}
                        </span>
                    ))}
                </div>
            )}

            {/* Description */}
             {asset.description ? (
                <p className="mod-description">{asset.description}</p>
            ) : (
                 <p className="mod-description placeholder-text" style={{padding:0, textAlign:'left', fontStyle:'italic'}}>(No description)</p>
            )}

             {/* Toggle Error */}
             {toggleError && <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: 'auto', paddingTop:'5px', flexShrink:0 }}>{toggleError}</p>}

            {/* Mod Details Footer */}
            <div className="mod-details">
                <div className="mod-author">
                    {asset.author ? `By: ${asset.author}` : '(Unknown author)'}
                </div>
                 {/* Keybinding Placeholder */}
                 <div className="key-binding" title="Keybinding (Not Implemented)">
                    <i className="fas fa-keyboard fa-fw"></i>
                    {/* <span className="key">F10</span> */}
                 </div>
            </div>
        </div>
    );
}

export default ModCard;