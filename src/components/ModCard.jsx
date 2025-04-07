// src/components/ModCard.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';

const FALLBACK_MOD_IMAGE = '/api/placeholder/100/60?text=No+Preview';

function ModCard({ asset, entitySlug, onToggleComplete }) {
    // Directly use the is_enabled state passed from the parent (EntityPage)
    // which should be correct based on get_assets_for_entity
    const isEnabled = asset.is_enabled;
    const [isToggling, setIsToggling] = useState(false);
    const [imageUrl, setImageUrl] = useState(FALLBACK_MOD_IMAGE);
    const [imageError, setImageError] = useState(false);
    const [toggleError, setToggleError] = useState(null);

    // folderNameOnDisk reflects the current state passed via the asset prop
    const folderNameOnDisk = asset.folder_name;

    useEffect(() => {
        let isMounted = true;
        // Reset image state when asset data changes (e.g., folder name after toggle)
        setImageUrl(FALLBACK_MOD_IMAGE);
        setImageError(false);
        console.log(`[ModCard ${asset.id}] Image Effect: Checking for ${asset.image_filename} in folder ${folderNameOnDisk}`);

        if (asset.image_filename && folderNameOnDisk) {
            invoke('get_asset_image_path', {
                entitySlug: entitySlug, // Still needed? Maybe not if path is constructed solely from base + folderNameOnDisk
                folderNameOnDisk: folderNameOnDisk, // Pass the actual current folder name
                imageFilename: asset.image_filename
            })
            .then(filePath => {
                 if (isMounted) {
                    const tauriUrl = convertFileSrc(filePath);
                    console.log(`[ModCard ${asset.id}] Image found: ${filePath}, Tauri URL: ${tauriUrl}`);
                    setImageUrl(tauriUrl);
                 }
            })
            .catch(err => {
                 if (isMounted) {
                    console.warn(`[ModCard ${asset.id}] Failed to load image for ${asset.name} (${asset.image_filename} in ${folderNameOnDisk}): ${err}`);
                    setImageError(true);
                 }
            });
        } else if (!asset.image_filename) {
             console.log(`[ModCard ${asset.id}] No image filename defined for this asset.`);
             // Keep fallback image
        }

        return () => { isMounted = false; };

    // Dependency: Fetch image when asset ID, filename, or the folder name on disk changes
    }, [asset.id, asset.image_filename, folderNameOnDisk, entitySlug]);

    const handleToggle = useCallback(async () => {
        if (isToggling) return;
        setIsToggling(true);
        setToggleError(null);
        console.log(`[ModCard ${asset.id}] Toggle initiated. Current UI state: ${isEnabled}`);

        try {
            // Pass the full asset object as received from EntityPage
            const newIsEnabledState = await invoke('toggle_asset_enabled', {
                entitySlug: entitySlug, // Pass entitySlug if backend needs it contextually
                asset: asset // Send the current asset state to backend
            });
            console.log(`[ModCard ${asset.id}] Toggle successful. Backend reported new state: ${newIsEnabledState}`);
            // Inform parent component (EntityPage) about the change and the new state
            onToggleComplete(asset.id, newIsEnabledState);

        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown toggle error');
            console.error(`[ModCard ${asset.id}] Failed to toggle mod ${asset.name}:`, errorString);
            setToggleError(`Toggle failed: ${errorString}`);
            // Note: We don't call onToggleComplete here, as the state didn't actually change
        } finally {
            setIsToggling(false);
        }
    }, [isToggling, asset, entitySlug, onToggleComplete, isEnabled]); // Include isEnabled in deps? Maybe not needed if asset object covers it.

    return (
        // Use folderNameOnDisk in the title for clarity
        <div className={`mod-card ${!isEnabled ? 'mod-disabled-visual' : ''}`} title={`Folder: ${folderNameOnDisk}`}>
             {/* Image display logic remains similar */}
             {(asset.image_filename && !imageError) ? (
                <div style={{ marginBottom: '15px', textAlign: 'center', height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <img
                         src={imageUrl}
                         alt={`${asset.name} preview`}
                         style={{ maxWidth: '100%', maxHeight: '100px', borderRadius: '4px', objectFit: 'contain' }}
                         loading="lazy"
                         // Add onError to fallback directly in img tag if needed, though useEffect handles it
                         onError={() => { if (!imageError) { setImageUrl(FALLBACK_MOD_IMAGE); setImageError(true); console.log(`[ModCard ${asset.id}] img onError triggered.`); }}}
                    />
                </div>
             ) : asset.image_filename && imageError ? (
                <div style={{ marginBottom: '15px', textAlign: 'center', height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>
                    (Preview not found)
                </div>
             ) : (
                // Optional: Add a placeholder div even if no image is defined, for consistent layout
                 <div style={{ marginBottom: '15px', height: '100px' }}></div>
             )}

            <div className="mod-header">
                <div className="mod-title">{asset.name}</div>
                <label className="toggle-switch">
                    <input
                        type="checkbox"
                        checked={isEnabled} // Use the state derived from props
                        onChange={handleToggle}
                        disabled={isToggling}
                        aria-label={`Enable/Disable ${asset.name} mod`}
                    />
                    <span className="slider"></span>
                </label>
            </div>

            {asset.category_tag && (
                <div className="mod-category" style={{ marginBottom: '12px' }}>{asset.category_tag}</div>
            )}

            {asset.description ? (
                <p className="mod-description">{asset.description}</p>
            ) : (
                 <p className="mod-description placeholder-text" style={{padding:0, textAlign:'left'}}>(No description)</p>
            )}

            {toggleError && <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: 'auto', paddingTop:'5px', flexShrink:0 }}>{toggleError}</p>}

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