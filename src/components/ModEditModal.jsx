// src/components/ModEditModal.jsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, convertFileSrc } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 1000,
        backdropFilter: 'blur(5px)',
    },
    modal: {
        background: 'var(--dark)', padding: '30px 40px', borderRadius: '12px',
        boxShadow: '0 5px 25px rgba(0, 0, 0, 0.4)', color: 'var(--light)',
        minWidth: '500px', maxWidth: '700px', maxHeight: '90vh', overflowY: 'auto',
    },
    title: {
        fontSize: '22px', fontWeight: '600', marginBottom: '25px',
        color: 'var(--primary)', borderBottom: '1px solid rgba(255,255,255,0.1)',
        paddingBottom: '15px',
    },
    formGroup: { marginBottom: '20px' },
    label: {
        display: 'block', marginBottom: '8px', fontSize: '14px',
        fontWeight: '500', color: 'rgba(255, 255, 255, 0.8)',
    },
    input: {
        width: '100%', padding: '10px 15px', backgroundColor: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px',
        color: 'var(--light)', fontSize: '14px', boxSizing: 'border-box',
    },
    textarea: {
        width: '100%', padding: '10px 15px', backgroundColor: 'rgba(0,0,0,0.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px',
        color: 'var(--light)', fontSize: '14px', minHeight: '100px', resize: 'vertical',
        boxSizing: 'border-box', fontFamily: 'inherit',
    },
    imagePreviewContainer: {
        marginTop: '10px', padding: '10px', border: '1px dashed rgba(255,255,255,0.2)',
        borderRadius: '6px', textAlign: 'center', minHeight: '120px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
    },
    imagePreview: {
        maxWidth: '100%', maxHeight: '150px', borderRadius: '4px',
        marginBottom: '10px', objectFit: 'contain',
    },
    imagePlaceholderText: { fontSize: '13px', color: 'rgba(255,255,255,0.5)' },
    buttonGroup: {
        display: 'flex', justifyContent: 'flex-end', gap: '15px',
        marginTop: '30px', paddingTop: '20px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)',
    },
    errorText: { color: 'var(--danger)', marginTop: '15px', fontSize: '14px', textAlign: 'center' },
};

const FALLBACK_MOD_IMAGE_MODAL = '/api/placeholder/150/100?text=No+Preview';

function ModEditModal({ asset, onClose, onSaveSuccess }) {
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        author: '',
        category_tag: '',
    });
    const [currentImageUrl, setCurrentImageUrl] = useState(FALLBACK_MOD_IMAGE_MODAL);
    const [selectedImageAbsPath, setSelectedImageAbsPath] = useState(null);
    const objectUrlRef = useRef(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    // Cleanup function to revoke old object URLs
    const cleanupObjectUrl = () => {
        if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
        }
    };

    // Initialize form and image preview when asset changes
    useEffect(() => {
        if (asset) {
            setFormData({
                name: asset.name || '',
                description: asset.description || '',
                author: asset.author || '',
                category_tag: asset.category_tag || '',
            });
            setSelectedImageAbsPath(null);
            setError('');
            cleanupObjectUrl(); // Clean up any previous temporary URL

            // Load existing image preview
            if (asset.image_filename) {
                invoke('get_asset_image_path', {
                    entitySlug: '',
                    folderNameOnDisk: asset.folder_name,
                    imageFilename: asset.image_filename,
                })
                .then(filePath => {
                    // Check if component is still mounted indirectly via objectUrlRef check
                    if (objectUrlRef.current === null) { // Only set if not already previewing a new selection
                        setCurrentImageUrl(convertFileSrc(filePath));
                    }
                })
                .catch(err => {
                    console.warn(`Modal: Failed to load existing image ${asset.image_filename}: ${err}`);
                    if (objectUrlRef.current === null) {
                       setCurrentImageUrl(FALLBACK_MOD_IMAGE_MODAL);
                    }
                });
            } else {
                setCurrentImageUrl(FALLBACK_MOD_IMAGE_MODAL);
            }
        }

        // Cleanup object URL on component unmount or asset change
        return cleanupObjectUrl;

    }, [asset]); // Rerun when the asset prop changes

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSelectImage = async () => {
        setError('');
        cleanupObjectUrl(); // Clean up previous temporary URL before creating new one

        try {
            const selected = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
            });

            let absolutePath = null;
            if (selected && typeof selected === 'string') {
                absolutePath = selected;
            } else if (Array.isArray(selected) && selected.length > 0) {
                 absolutePath = selected[0];
            }

            if (absolutePath) {
                setSelectedImageAbsPath(absolutePath); // Store the absolute path for saving

                try {
                    // Read the file content using Tauri API
                    const fileData = await invoke('read_binary_file', { path: absolutePath });
                    // Create a Blob from the Uint8Array
                    const blob = new Blob([new Uint8Array(fileData)], { type: 'image/png' }); // Adjust type if needed
                    // Create an Object URL
                    const url = URL.createObjectURL(blob);
                    objectUrlRef.current = url; // Store for cleanup
                    setCurrentImageUrl(url); // Set the preview URL
                    console.log("Created Blob URL for preview:", url);
                } catch (readError) {
                    console.error("Error reading selected file for preview:", readError);
                    setError('Could not read selected image for preview.');
                    setCurrentImageUrl(FALLBACK_MOD_IMAGE_MODAL); // Fallback on read error
                    setSelectedImageAbsPath(null); // Clear selected path if preview failed
                }
            }
        } catch (err) {
            console.error("Error selecting image:", err);
            setError('Failed to open image file dialog.');
        }
    };

    const handleSave = async () => {
        if (!asset) return;
        setIsSaving(true);
        setError('');

        try {
            console.log("Saving asset info:", {
                assetId: asset.id,
                ...formData,
                selectedImageAbsPath: selectedImageAbsPath // Send the absolute path if new image selected
            });

            await invoke('update_asset_info', {
                assetId: asset.id,
                name: formData.name,
                description: formData.description || null,
                author: formData.author || null,
                categoryTag: formData.category_tag || null,
                selectedImageAbsolutePath: selectedImageAbsPath // Pass the stored absolute path
            });

            console.log("Asset info saved successfully.");
            const updatedAssetData = {
                 ...asset,
                 ...formData,
                 image_filename: selectedImageAbsPath ? "preview.png" : asset.image_filename,
                 // We need to refetch or update the folder_name if the toggle state affects it
                 // but edit doesn't change toggle state, so keep asset.folder_name
                 folder_name: asset.folder_name,
                 is_enabled: asset.is_enabled, // Keep the existing enabled state
            };
            onSaveSuccess(updatedAssetData);

        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown save error');
            console.error("Failed to save asset info:", errorString);
            setError(`Save Failed: ${errorString}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (!asset) return null; // Don't render if no asset provided

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h2 style={styles.title}>Edit Mod: {asset.name}</h2>

                <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="mod-name">Name:</label>
                    <input
                        id="mod-name"
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleInputChange}
                        style={styles.input}
                    />
                </div>

                <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="mod-description">Description:</label>
                    <textarea
                        id="mod-description"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        style={styles.textarea}
                    />
                </div>

                <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="mod-author">Author:</label>
                    <input
                        id="mod-author"
                        type="text"
                        name="author"
                        value={formData.author}
                        onChange={handleInputChange}
                        style={styles.input}
                    />
                </div>

                <div style={styles.formGroup}>
                    <label style={styles.label} htmlFor="mod-category-tag">Category Tag:</label>
                    <input
                        id="mod-category-tag"
                        type="text"
                        name="category_tag"
                        value={formData.category_tag}
                        onChange={handleInputChange}
                        style={styles.input}
                        placeholder="e.g., Outfit, Retexture, Effect"
                    />
                </div>

                <div style={styles.formGroup}>
                    <label style={styles.label}>Preview Image:</label>
                    <div style={styles.imagePreviewContainer}>
                        {currentImageUrl !== FALLBACK_MOD_IMAGE_MODAL ? (
                            <img
                                src={currentImageUrl}
                                alt="Mod preview"
                                style={styles.imagePreview}
                                onError={() => {
                                     console.log("Image onError triggered in modal");
                                     cleanupObjectUrl(); // Clean up potentially broken object URL
                                     setCurrentImageUrl(FALLBACK_MOD_IMAGE_MODAL);
                                 }}
                            />
                        ) : (
                             <p style={styles.imagePlaceholderText}>No preview image set.</p>
                         )}
                    </div>
                     <button
                        className="btn btn-outline"
                        style={{marginTop:'10px', width:'100%'}}
                        onClick={handleSelectImage}
                        disabled={isSaving}
                    >
                         <i className="fas fa-image fa-fw"></i> Change Image...
                     </button>
                </div>

                {error && <p style={styles.errorText}>{error}</p>}

                <div style={styles.buttonGroup}>
                    <button className="btn btn-outline" onClick={onClose} disabled={isSaving}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
                        {isSaving ? <><i className="fas fa-spinner fa-spin fa-fw"></i> Saving...</> : <><i className="fas fa-save fa-fw"></i> Save Changes</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ModEditModal;