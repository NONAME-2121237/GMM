// src/components/ImportModModal.jsx
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { invoke } from '@tauri-apps/api/tauri';
import { open } from '@tauri-apps/api/dialog';
import Select from 'react-select';

const reactSelectStyles = {
    control: (baseStyles, state) => ({
      ...baseStyles,
      backgroundColor: 'rgba(0,0,0,0.2)',
      borderColor: state.isFocused ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)',
      boxShadow: state.isFocused ? '0 0 0 1px var(--primary)' : 'none',
      color: 'var(--light)',
      minHeight: '43px', // Match input height roughly
      '&:hover': {
        borderColor: 'var(--primary)',
      },
    }),
    valueContainer: (baseStyles) => ({
      ...baseStyles,
      padding: '2px 12px', // Adjust padding
    }),
    singleValue: (baseStyles) => ({
      ...baseStyles,
      color: 'var(--light)',
    }),
    placeholder: (baseStyles) => ({
       ...baseStyles,
       color: 'rgba(255, 255, 255, 0.5)', // Placeholder text color
    }),
    input: (baseStyles) => ({
      ...baseStyles,
      color: 'var(--light)', // Input text color
       margin: '0px',
       padding: '0px',
    }),
    indicatorSeparator: (baseStyles) => ({
       ...baseStyles,
       backgroundColor: 'rgba(255, 255, 255, 0.1)', // Separator line color
    }),
    dropdownIndicator: (baseStyles, state) => ({
        ...baseStyles,
        color: state.isFocused ? 'var(--primary)' : 'rgba(255, 255, 255, 0.5)', // Arrow color
         padding: '8px',
         '&:hover': {
           color: 'var(--primary)',
         },
    }),
    clearIndicator: (baseStyles) => ({
        ...baseStyles,
         color: 'rgba(255, 255, 255, 0.5)',
         padding: '8px',
         '&:hover': {
            color: 'var(--danger)',
         },
    }),
    menu: (baseStyles) => ({
      ...baseStyles,
      backgroundColor: 'var(--dark)', // Dropdown background
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '6px',
      zIndex: 10, // Ensure dropdown is above other content
    }),
    menuList: (baseStyles) => ({
       ...baseStyles,
        padding: '4px 0', // Padding for the list container
        maxHeight: '250px', // Limit dropdown height
    }),
    option: (baseStyles, state) => ({
      ...baseStyles,
      backgroundColor: state.isSelected
        ? 'var(--primary)' // Selected option background
        : state.isFocused
        ? 'rgba(255, 255, 255, 0.1)' // Hover/focused option background
        : 'transparent',
      color: state.isSelected ? 'white' : 'var(--light)', // Text color
      padding: '10px 15px', // Option padding
      cursor: 'pointer',
      '&:active': {
        backgroundColor: state.isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.2)',
      },
    }),
    noOptionsMessage: (baseStyles) => ({
        ...baseStyles,
        color: 'rgba(255, 255, 255, 0.6)',
        padding: '10px 15px',
    }),
  };

const styles = {
    overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, backdropFilter: 'blur(5px)' },
    modal: { background: 'var(--dark)', padding: '30px 40px', borderRadius: '12px', boxShadow: '0 5px 25px rgba(0, 0, 0, 0.4)', color: 'var(--light)', width: '90%', maxWidth: '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column'},
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '15px'},
    title: { fontSize: '22px', fontWeight: '600', color: 'var(--primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
    closeButton: { background: 'none', border: 'none', color: 'var(--light)', fontSize: '24px', cursor: 'pointer', padding: '0 5px', opacity: 0.7, ':hover': { opacity: 1 } },
    content: { flexGrow: 1, overflowY: 'auto', display: 'flex', gap: '30px', paddingRight: '10px' /* Space for scrollbar */ },
    leftPanel: { flex: '1 1 40%', display:'flex', flexDirection: 'column', minWidth: '250px' },
    rightPanel: { flex: '1 1 60%', display:'flex', flexDirection: 'column', minWidth: '350px' },
    fileListContainer: { border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', maxHeight: '300px', minHeight: '150px', overflowY: 'auto', marginBottom: '15px', flexGrow: 1, background:'rgba(0,0,0,0.1)'},
    fileListItem: { padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px', display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', wordBreak: 'break-all', ':hover': { backgroundColor: 'rgba(255, 255, 255, 0.05)' } },
    fileListItemSelected: { backgroundColor: 'rgba(156, 136, 255, 0.2)'}, // Use primary color with alpha
    formGroup: { marginBottom: '15px' },
    label: { display: 'block', marginBottom: '8px', fontSize: '14px', fontWeight: '500', color: 'rgba(255, 255, 255, 0.8)' },
    input: { width: '100%', padding: '10px 15px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', color: 'var(--light)', fontSize: '14px', boxSizing: 'border-box' },
    textarea: { width: '100%', padding: '10px 15px', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '6px', color: 'var(--light)', fontSize: '14px', minHeight: '80px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'},
    footer: { display: 'flex', justifyContent: 'flex-end', gap: '15px', marginTop: '25px', paddingTop: '20px', borderTop: '1px solid rgba(255, 255, 255, 0.1)', flexShrink: 0 },
    errorText: { color: 'var(--danger)', fontSize: '14px', textAlign: 'center', flexGrow: 1, marginRight:'10px', display: 'flex', alignItems: 'center', justifyContent:'center' },
    select: {
        width: '100%',
        padding: '10px 15px',
        backgroundColor: 'rgba(0,0,0,0.4)', // Dark background for the closed box
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: 'var(--light)', // <--- Ensure text color for selected value is light
        fontSize: '14px',
        boxSizing: 'border-box',
        appearance: 'none', // Removes default system arrow/styling
        // Custom arrow using background SVG
        backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' fill=\'%23cccccc\' height=\'24\' viewBox=\'0 0 24 24\' width=\'24\'%3E%3Cpath d=\'M7 10l5 5 5-5z\'/%3E%3C/svg%3E")',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: '35px', // Make space for the custom arrow
        cursor: 'pointer', // Indicate it's interactive
    },
    icon: { opacity: 0.7, width: '16px', textAlign: 'center', marginRight: '5px', flexShrink: 0 },
    imagePreviewContainer: { marginTop: '10px', padding: '10px', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: '6px', textAlign: 'center', minHeight: '100px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',},
    imagePreview: { maxWidth: '100%', maxHeight: '120px', borderRadius: '4px', marginBottom: '10px', objectFit: 'contain',},
    imagePlaceholderText: { fontSize: '13px', color: 'rgba(255,255,255,0.5)' },
};

const FALLBACK_MOD_IMAGE_MODAL = '/images/placeholder.jpg';

function ImportModModal({ analysisResult, onClose, onImportSuccess }) {
    // Form State
    const [modName, setModName] = useState('');
    const [description, setDescription] = useState('');
    const [author, setAuthor] = useState('');
    const [categoryTag, setCategoryTag] = useState('');
    const [selectedInternalRoot, setSelectedInternalRoot] = useState('');
    // Entity Selection State
    const [categories, setCategories] = useState([]);
    const [entities, setEntities] = useState([]);
    const [selectedCategoryOption, setSelectedCategoryOption] = useState(null);
    const [selectedEntityOption, setSelectedEntityOption] = useState(null);
    const [categoryLoading, setCategoryLoading] = useState(true);
    const [entityLoading, setEntityLoading] = useState(false);
    // --- NEW: Preset Selection State ---
    const [allPresets, setAllPresets] = useState([]);
    const [selectedPresets, setSelectedPresets] = useState([]); // Array of { value, label }
    const [presetsLoading, setPresetsLoading] = useState(true);
    // ---------------------------------
    // Preview State
    const [previewImageUrl, setPreviewImageUrl] = useState(FALLBACK_MOD_IMAGE_MODAL);
    const [selectedPreviewAbsPath, setSelectedPreviewAbsPath] = useState(null);
    const previewObjectUrlRef = useRef(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [pastedImageFile, setPastedImageFile] = useState(null);
    // Modal State
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState('');

    // Cleanup Blob URL
    const cleanupPreviewObjectUrl = useCallback(() => {
        if (previewObjectUrlRef.current) {
            URL.revokeObjectURL(previewObjectUrlRef.current);
            previewObjectUrlRef.current = null;
        }
    }, []);

    // Format data for react-select
    const categoryOptions = useMemo(() => categories.map(cat => ({ value: cat.slug, label: cat.name })), [categories]);
    const entityOptions = useMemo(() => entities.map(ent => ({ value: ent.slug, label: ent.name })), [entities]);
    // --- NEW: Preset Options ---
    const presetOptions = useMemo(() => allPresets.map(p => ({ value: p.id, label: p.name })), [allPresets]);
    // -------------------------

    // Fetch Categories AND Presets on Mount
    useEffect(() => {
        setCategoryLoading(true);
        setPresetsLoading(true); // Start loading presets
        const fetchInitialData = async () => {
            try {
                const [fetchedCategories, fetchedPresets] = await Promise.all([
                    invoke('get_categories'),
                    invoke('get_presets') // Fetch presets
                ]);
                setCategories(fetchedCategories || []);
                setAllPresets(fetchedPresets || []); // Store fetched presets
            } catch (err) {
                console.error("Failed fetch initial modal data:", err);
                // Handle error appropriately, maybe set an error state
            } finally {
                setCategoryLoading(false);
                setPresetsLoading(false); // Finish loading presets
            }
        };
        fetchInitialData();
    }, []);

    // --- Set Initial Values & Try Deduction when analysisResult and categories/presets are ready ---
    useEffect(() => {
        let isMounted = true;
        // Wait for all initial loading to finish
        if (!analysisResult || categoryLoading || presetsLoading) return;

        // Reset fields (including presets)
        setDescription('');
        setAuthor('');
        setCategoryTag('');
        setSelectedEntityOption(null);
        setSelectedCategoryOption(null);
        setSelectedPresets([]); // Reset selected presets
        setError('');
        setPreviewImageUrl(FALLBACK_MOD_IMAGE_MODAL);
        setSelectedPreviewAbsPath(null);
        setPastedImageFile(null);
        cleanupPreviewObjectUrl();

        // Set deduced name/author
        const nameGuess = analysisResult.deduced_mod_name || analysisResult.file_path.split('/').pop().split('\\').pop().replace(/\.(zip|rar|7z)$/i, '');
        setModName(nameGuess);
        setAuthor(analysisResult.deduced_author || '');

        // Select likely root
        const likelyRoot = analysisResult.entries?.find(e => e.is_likely_mod_root);
        const firstDir = analysisResult.entries?.find(e => e.is_dir);
        const rootToSelect = likelyRoot ? likelyRoot.path : (firstDir ? firstDir.path : '');
        setSelectedInternalRoot(rootToSelect);

        // Deduce Category
        if (analysisResult.deduced_category_slug) {
             const deducedCatOption = categoryOptions.find(opt => opt.value === analysisResult.deduced_category_slug);
             if (deducedCatOption) {
                 setSelectedCategoryOption(deducedCatOption);
             }
        }

        // Load detected preview from archive (independent of deduction)
        if (analysisResult.detected_preview_internal_path) {
            setPreviewLoading(true);
            invoke('read_archive_file_content', {
                archivePathStr: analysisResult.file_path,
                internalFilePath: analysisResult.detected_preview_internal_path
            })
            .then(fileData => {
                if (!isMounted || !fileData) return;
                 try {
                     const extension = analysisResult.detected_preview_internal_path.split('.').pop().toLowerCase();
                     let mimeType = 'image/png';
                     if (['jpg', 'jpeg'].includes(extension)) mimeType = 'image/jpeg';
                     else if (extension === 'gif') mimeType = 'image/gif';
                     else if (extension === 'webp') mimeType = 'image/webp';
                     const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
                     const url = URL.createObjectURL(blob);
                     if (isMounted) {
                        previewObjectUrlRef.current = url;
                        setPreviewImageUrl(url);
                     } else { URL.revokeObjectURL(url); }
                 } catch (e) { console.error("Error creating blob for detected preview:", e); if (isMounted) setPreviewImageUrl(FALLBACK_MOD_IMAGE_MODAL); }
            })
            .catch(err => { console.warn("Failed to load detected preview:", err); if (isMounted) setPreviewImageUrl(FALLBACK_MOD_IMAGE_MODAL); })
            .finally(() => { if (isMounted) setPreviewLoading(false); });
        } else {
            setPreviewImageUrl(FALLBACK_MOD_IMAGE_MODAL);
        }

        return () => { isMounted = false; cleanupPreviewObjectUrl(); }

    }, [analysisResult, categories, categoryOptions, categoryLoading, presetsLoading, cleanupPreviewObjectUrl]);


     // Fetch Entities & Set Deduced Entity when selectedCategoryOption changes
     useEffect(() => {
        let isMounted = true;
        const categorySlug = selectedCategoryOption?.value;

        if (categorySlug) {
             setEntities([]);
             setSelectedEntityOption(null);
             setEntityLoading(true);
             invoke('get_entities_by_category', { categorySlug: categorySlug })
                 .then(loadedEntities => {
                     if (!isMounted) return;
                     // Important: Update raw entities state *before* trying to find match
                     setEntities(loadedEntities);
                     console.log(`Entities loaded. Count: ${loadedEntities.length}`);

                     // --- Set deduced entity slug IF category matches deduction ---
                     // Need to compare the *currently selected* category slug with the deduced one
                     if (categorySlug === analysisResult?.deduced_category_slug && analysisResult?.deduced_entity_slug) {
                         const deducedEntityOption = loadedEntities
                              .map(ent => ({ value: ent.slug, label: ent.name })) // Map to options format first
                              .find(opt => opt.value === analysisResult.deduced_entity_slug);

                         if (deducedEntityOption) {
                             setSelectedEntityOption(deducedEntityOption);
                             console.log(`Successfully pre-selected deduced entity: ${analysisResult.deduced_entity_slug}`);
                         } else {
                             console.warn("Deduced entity slug not found in loaded entities for the deduced category.");
                         }
                     }
                     // --- Fallback: Try matching raw target name if no direct slug deduction worked ---
                     else if (!selectedEntityOption && analysisResult?.raw_ini_target) { // Check if not already set
                         const rawTarget = analysisResult.raw_ini_target;
                         console.log(`Attempting to match raw target name: ${rawTarget}`);
                         const lowerRawTarget = rawTarget.toLowerCase();
                         const matchedEntity = loadedEntities.find(ent =>
                             ent.name.toLowerCase() === lowerRawTarget || ent.slug.toLowerCase() === lowerRawTarget
                         );
                         if (matchedEntity) {
                             const matchedOption = { value: matchedEntity.slug, label: matchedEntity.name };
                             setSelectedEntityOption(matchedOption);
                             console.log(`Matched entity '${matchedOption.value}' from raw INI target '${rawTarget}'`);
                         } else {
                              console.log(`Raw INI target '${rawTarget}' did not match any entity in category '${categorySlug}'.`);
                         }
                     }
                 })
                 .catch(err => {
                     console.error(`Failed to fetch entities for ${selectedCategory}:`, err);
                     if(isMounted) setEntities([]);
                  })
                .finally(() => { if(isMounted) setEntityLoading(false); });
            } else {
                setEntities([]);
                setSelectedEntityOption(null);
                setEntityLoading(false);
            }
            return () => { isMounted = false; }
        }, [selectedCategoryOption, analysisResult?.deduced_category_slug, analysisResult?.deduced_entity_slug, analysisResult?.raw_ini_target]);

    const handlePaste = useCallback((event) => {
        setError('');
        const items = event.clipboardData.items;
        let imageFound = false;
        for (let i = 0; i < items.length; i++) {
            if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
                const file = items[i].getAsFile();
                if (file) {
                    imageFound = true;
                    console.log("Pasted image file for import:", file);
                    cleanupPreviewObjectUrl();
                    setSelectedPreviewAbsPath(null); // Clear file path selection
                    setPastedImageFile(file); // Store the File object

                    const url = URL.createObjectURL(file);
                    previewObjectUrlRef.current = url;
                    setPreviewImageUrl(url);
                    break;
                }
            }
        }
        if (imageFound) { event.preventDefault(); }
        else { console.log("No image found in paste for import."); }
    }, [cleanupPreviewObjectUrl]);

    // --- Select Separate Preview Handler ---
    const handleSelectPreviewImage = async () => {
        setError('');
        cleanupPreviewObjectUrl();
        try {
            const selected = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
             });
            let absolutePath = null;
            if (selected && typeof selected === 'string') absolutePath = selected;
            else if (Array.isArray(selected) && selected.length > 0) absolutePath = selected[0];

            if (absolutePath) {
                setPastedImageFile(null);
                setSelectedPreviewAbsPath(absolutePath);
                setPreviewLoading(true);
                invoke('read_binary_file', { path: absolutePath })
                    .then(fileData => {
                         try {
                             // Basic mime type detection
                             let mimeType = 'image/png';
                             const ext = absolutePath.split('.').pop().toLowerCase();
                             if (['jpg', 'jpeg'].includes(ext)) mimeType = 'image/jpeg';
                             else if (ext === 'gif') mimeType = 'image/gif';
                             else if (ext === 'webp') mimeType = 'image/webp';

                             const blob = new Blob([new Uint8Array(fileData)], { type: mimeType });
                             const url = URL.createObjectURL(blob);
                             previewObjectUrlRef.current = url;
                             setPreviewImageUrl(url);
                         } catch(e) { throw new Error("Cannot create preview blob"); }
                    })
                    .catch(readError => {
                        console.error("Error reading selected file for preview:", readError);
                        setError('Could not read selected image for preview.');
                        setPreviewImageUrl(FALLBACK_MOD_IMAGE_MODAL);
                        setSelectedPreviewAbsPath(null);
                    })
                    .finally(() => setPreviewLoading(false));
            }
        } catch (err) {
             console.error("Error selecting image:", err);
             setError('Failed to open image file dialog.');
         }
    };


    // --- Confirm Import Handler ---
    const handleConfirmImport = async () => {
        setError('');
        const targetEntitySlugValue = selectedEntityOption?.value;
        if (!targetEntitySlugValue) { setError('Please select the target character/entity.'); return; }
        if (!modName.trim()) { setError('Please enter a mod name.'); return; }
        const hasDirectories = analysisResult?.entries?.some(e => e.is_dir);
        if (!selectedInternalRoot && hasDirectories) { setError('Please select the mod root folder from the archive.'); return; }

        setIsImporting(true);
        let imageDataToSend = null;

        // --- Read pasted image data if present ---
        if (pastedImageFile) {
            try {
                const arrayBuffer = await pastedImageFile.arrayBuffer();
                imageDataToSend = Array.from(new Uint8Array(arrayBuffer));
                console.log("Prepared pasted image data for import (length):", imageDataToSend.length);
            } catch (readErr) {
                console.error("Error reading pasted file for import:", readErr);
                setError("Failed to read pasted image data.");
                setIsImporting(false);
                return;
            }
        }
        // --- End Read ---

        // --- Get selected preset IDs ---
        const presetIdsToSend = selectedPresets.length > 0
            ? selectedPresets.map(opt => opt.value)
            : null;
        // -----------------------------

        try {
            await invoke('import_archive', {
                archivePathStr: analysisResult.file_path,
                targetEntitySlug: targetEntitySlugValue,
                selectedInternalRoot: selectedInternalRoot || "",
                modName: modName.trim(),
                description: description || null,
                author: author || null,
                categoryTag: categoryTag || null,
                imageData: imageDataToSend,
                selectedPreviewAbsolutePath: imageDataToSend ? null : selectedPreviewAbsPath,
                // --- Pass preset IDs ---
                presetIds: presetIdsToSend,
                // -----------------------
            });
            onImportSuccess(targetEntitySlugValue, selectedCategoryOption?.value || 'characters');
        } catch (err) {
             const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown import error');
             console.error("Import failed:", errorString);
             setError(`Import Failed: ${errorString}`);
        } finally {
            setIsImporting(false);
        }
    };

    // Memoized archive filename for display
    const archiveFilename = useMemo(() => analysisResult?.file_path?.split('/').pop()?.split('\\').pop() || 'archive', [analysisResult]);

    // Helper to render file tree node
    const renderFileNode = (entry) => {
         const indentLevel = entry.path.includes('/') ? entry.path.split('/').length - 1 : 0;
         const isSelected = entry.path === selectedInternalRoot;
         const canSelect = entry.is_dir; // Only allow selecting directories

        return (
             <div
                key={entry.path}
                style={{
                    ...styles.fileListItem,
                    ...(isSelected ? styles.fileListItemSelected : {}),
                    paddingLeft: `${12 + indentLevel * 15}px`,
                    cursor: canSelect ? 'pointer' : 'default',
                    opacity: canSelect ? 1 : 0.7
                 }}
                onClick={() => canSelect && setSelectedInternalRoot(entry.path)}
                title={entry.path}
            >
                 <i className={`fas ${entry.is_dir ? 'fa-folder' : 'fa-file-alt'} fa-fw`} style={{...styles.icon, color: entry.is_dir ? 'var(--accent)' : undefined}}></i>
                 <span style={{flexGrow: 1}}>{entry.path.split('/').pop() || entry.path}</span>
                 {entry.is_likely_mod_root && <i className="fas fa-star fa-fw" style={{color:'var(--accent)', marginLeft:'auto', fontSize:'11px', flexShrink:0}} title="Likely Mod Root (Contains INI)"></i>}
             </div>
        );
    }

    return ReactDOM.createPortal(
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div style={styles.header}>
                    <h2 style={styles.title} title={archiveFilename}>Import Mod: {archiveFilename}</h2>
                     <button
                         onClick={onClose}
                         style={styles.closeButton}
                         title="Close"
                         onMouseOver={(e) => e.currentTarget.style.opacity = 1}
                         onMouseOut={(e) => e.currentTarget.style.opacity = 0.7}
                         disabled={isImporting}
                     >×</button>
                </div>

                {/* Content */}
                <div style={styles.content}>
                    {/* Left Panel: Archive Contents & Selection */}
                    <div style={styles.leftPanel}>
                        <label style={styles.label}>Select Mod Root Folder (click folder name):</label>
                        <div style={styles.fileListContainer}>
                            {analysisResult?.entries?.length > 0 ? (
                                analysisResult.entries.map(renderFileNode)
                             ) : (
                                <p style={{padding:'10px', textAlign:'center', fontSize:'13px', color:'rgba(255,255,255,0.6)'}}>Analyzing archive or archive empty...</p>
                             )}
                        </div>
                         <p style={{fontSize:'12px', color:'rgba(255,255,255,0.6)', marginTop:'5px'}}>Selected Root: {selectedInternalRoot || '(None - extracting all)'}</p>

                        {/* Preview Section */}
                        <div style={{marginTop:'auto', paddingTop:'15px'}}>
                             <label style={styles.label}>Preview Image:</label>
                             {/* --- Add onPaste and tabIndex --- */}
                              <div
                                  style={styles.imagePreviewContainer}
                                  onPaste={handlePaste}
                                  tabIndex={0}
                                  title="Click 'Select Preview' or paste image here"
                              >
                              {/* --- End Add --- */}
                                 {previewLoading ? <i className="fas fa-spinner fa-spin fa-fw"></i>
                                 : previewImageUrl !== FALLBACK_MOD_IMAGE_MODAL ? <img src={previewImageUrl} alt="Preview" style={styles.imagePreview} onError={() => setPreviewImageUrl(FALLBACK_MOD_IMAGE_MODAL)} />
                                 : <p style={styles.imagePlaceholderText}>No preview.</p>}
                              </div>
                              <button className="btn btn-outline" style={{marginTop:'10px', width:'100%'}} onClick={handleSelectPreviewImage} disabled={isImporting}>
                                  <i className="fas fa-image fa-fw"></i> Change Image...
                              </button>
                              <p style={{fontSize:'11px', color:'rgba(255,255,255,0.5)', textAlign:'center', marginTop:'5px'}}>Paste image directly into box above.</p>
                         </div>
                    </div> {/* End Left Panel */}

                    {/* Right Panel: Mod Info Form */}
                    <div style={styles.rightPanel}>
                         {/* --- Category Select --- */}
                         <div style={styles.formGroup}>
                            <label style={styles.label} htmlFor="import-category">Target Category:</label>
                            <Select
                                id="import-category"
                                styles={reactSelectStyles} // Apply custom styles
                                options={categoryOptions}
                                value={selectedCategoryOption}
                                onChange={setSelectedCategoryOption} // react-select passes the whole option object
                                placeholder={categoryLoading ? 'Loading...' : 'Select Category...'}
                                isLoading={categoryLoading}
                                isDisabled={isImporting || categoryLoading}
                                isClearable={false}
                                isSearchable={true} // Enable searching
                                menuPosition={'fixed'}
                            />
                        </div>

                        {/* --- Entity Select --- */}
                        <div style={styles.formGroup}>
                             <label style={styles.label} htmlFor="import-entity">Target Entity:</label>
                             <Select
                                id="import-entity"
                                styles={reactSelectStyles} // Apply custom styles
                                options={entityOptions}
                                value={selectedEntityOption}
                                onChange={setSelectedEntityOption} // react-select passes the whole option object
                                placeholder={entityLoading ? 'Loading...' : (selectedCategoryOption ? (entities.length > 0 ? 'Select or type to search...' : 'No entities found') : 'Select Category First')}
                                isLoading={entityLoading}
                                isDisabled={isImporting || !selectedCategoryOption || entityLoading || entities.length === 0}
                                isClearable={false}
                                isSearchable={true} // Enable searching
                                menuPosition={'fixed'}
                             />
                         </div>

                        <div style={styles.formGroup}>
                            <label style={styles.label} htmlFor="import-mod-name">Mod Name:</label>
                            <input id="import-mod-name" type="text" value={modName} onChange={e => setModName(e.target.value)} style={styles.input} required disabled={isImporting}/>
                        </div>
                        <div style={styles.formGroup}>
                             <label style={styles.label} htmlFor="import-author">Author:</label>
                             <input id="import-author" type="text" value={author} onChange={e => setAuthor(e.target.value)} style={styles.input} disabled={isImporting}/>
                         </div>
                         <div style={styles.formGroup}>
                             <label style={styles.label} htmlFor="import-category-tag">Category Tags (comma-separated):</label>
                             <input id="import-category-tag" type="text" value={categoryTag} onChange={e => setCategoryTag(e.target.value)} style={styles.input} placeholder="Outfit, Retexture, Effect..." disabled={isImporting}/>
                         </div>
                         <div style={styles.formGroup}>
                             <label style={styles.label} htmlFor="import-description">Description:</label>
                             <textarea id="import-description" value={description} onChange={e => setDescription(e.target.value)} style={styles.textarea} disabled={isImporting}/>
                         </div>
                         <div style={styles.formGroup}>
                             <label style={styles.label} htmlFor="import-presets">Add to Preset(s) (Optional):</label>
                             <Select
                                id="import-presets"
                                isMulti
                                styles={reactSelectStyles} // Use shared styles
                                options={presetOptions}
                                value={selectedPresets}
                                onChange={setSelectedPresets}
                                placeholder={presetsLoading ? 'Loading...' : 'Select presets...'}
                                isLoading={presetsLoading}
                                isDisabled={isImporting || presetsLoading}
                                closeMenuOnSelect={false}
                                menuPosition={'fixed'}
                             />
                         </div>
                    </div>{/* End Right Panel */}
                </div> {/* End Content */}


                {/* Footer */}
                <div style={styles.footer}>
                     {error && <p style={styles.errorText}>{error}</p>}
                    <button className="btn btn-outline" onClick={onClose} disabled={isImporting}>Cancel</button>
                    <button
                        className="btn btn-primary"
                        onClick={handleConfirmImport}
                        disabled={isImporting || !selectedEntityOption || !modName.trim() || (!selectedInternalRoot && analysisResult?.entries?.some(e=>e.is_dir))} // Check selectedEntityOption
                    >
                        {isImporting ? <><i className="fas fa-spinner fa-spin fa-fw"></i> Importing...</> : <><i className="fas fa-check fa-fw"></i> Confirm Import</>}
                    </button>
                </div>
            </div> {/* End Modal */}
        </div>, // End Overlay
        document.body
    );
}

export default ImportModModal;