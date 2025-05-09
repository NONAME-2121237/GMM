// src/pages/EnhancedEntityPage.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import ModCard from '../components/ModCard';
import ModEditModal from '../components/ModEditModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import ModCardSkeleton from '../components/ModCardSkeleton';
import { FixedSizeList, FixedSizeGrid } from 'react-window';
import useMeasure from 'react-use-measure';
import { toast } from 'react-toastify';
import ContextMenu from '../components/ContextMenu';
import AddToPresetModal from '../components/AddToPresetModal';
import LightboxModal from '../components/LightboxModal';
import { motion, AnimatePresence } from 'framer-motion';
import ModStatsDashboard from '../components/ModStatsDashboard';

const WIKI_BASE_URLS = {
    "genshin": "https://genshin-impact.fandom.com/wiki/",
    "zzz": "https://zenless-zone-zero.fandom.com/wiki/",
    "hsr": "https://honkai-star-rail.fandom.com/wiki/",
    "wuwa": "https://wutheringwaves.fandom.com/wiki/"
};

const getWikiUrl = (entityName, activeGame) => {
    const formattedName = entityName.replace(/\s+/g, '_');
    const baseUrl = WIKI_BASE_URLS[activeGame] || WIKI_BASE_URLS.genshin;
    
    return `${baseUrl}${formattedName}`;
  };

// Helper function to parse details JSON
const parseDetails = (detailsJson) => {
    try {
        if (!detailsJson) return {};
        return JSON.parse(detailsJson);
    } catch (e) {
        console.error("Failed to parse entity details JSON:", e);
        return {}; // Return empty object on error
    }
};

// Genshin Font Awesome icons map
const elementIconsFA = {
    Electro: "fas fa-bolt", Pyro: "fas fa-fire", Cryo: "fas fa-snowflake",
    Hydro: "fas fa-tint", Anemo: "fas fa-wind", Geo: "fas fa-mountain",
    Dendro: "fas fa-leaf",
};
const weaponIconsFA = {
    Polearm: "fas fa-utensils",
    Sword: "fas fa-khanda",
    Claymore: "fas fa-hammer",
    Bow: "fas fa-bullseye",
    Catalyst: "fas fa-book-open"
};

// ZZZ Font Awesome icons map
const attributeIconsFA = {
    Physical: "fas fa-fist-raised",
    Fire: "fas fa-fire-alt",
    Ice: "fas fa-icicles",
    Electric: "fas fa-bolt",
    // Add more ZZZ attributes as needed
};

const specialtyIconsFA = {
    Assault: "fas fa-crosshairs",
    Support: "fas fa-hands-helping",
    Defense: "fas fa-shield-alt",
    Healer: "fas fa-first-aid",
    // Add more ZZZ specialties as needed
};

const typeIconsFA = {
    DPS: "fas fa-fire", 
    Tank: "fas fa-shield-alt",
    Healer: "fas fa-heart",
    // Add more common types as needed
};

const EnhancedScrollIndicator = ({ onViewMods }) => {
    const [hovered, setHovered] = useState(false);
    
    return (
      <div className="scroll-indicator" style={{
        textAlign: 'center',
        marginTop: '0',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        color: 'rgba(255, 255, 255, 0.8)',
        fontSize: '16px'
      }}>
        {/* Animated scroll text */}
        <motion.p
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ 
            duration: 0.8,
            repeat: Infinity,
            repeatType: "reverse",
            ease: "easeInOut"
          }}
          style={{ marginBottom: '15px' }}
        >
          向下滚动查看模组
        </motion.p>
        
        {/* Enhanced button with animation */}
        <motion.button 
          className="btn view-mods-button"
          initial={{ scale: 1 }}
          whileHover={{ 
            scale: 1.05,
            transition: { duration: 0.2 }
          }}
          whileTap={{ scale: 0.98 }}
          onClick={onViewMods}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            marginTop: '10px',
            background: `linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)`,
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            padding: '9px 20px',
            fontSize: '15px',
            fontWeight: '500',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: hovered 
              ? '0 5px 15px rgba(156, 136, 255, 0.5)' 
              : '0 4px 10px rgba(156, 136, 255, 0.3)',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          <motion.i 
            className="fas fa-chevron-down fa-fw"
            animate={{ 
              y: [0, 3, 0],
            }}
            transition={{ 
              duration: 1.5,
              repeat: Infinity,
              repeatType: "loop",
              ease: "easeInOut"
            }}
          />
          查看模组
        </motion.button>
      </div>
    );
  };

const RarityIcon = () => <i className="fas fa-star fa-fw" style={{ color: '#ffcc00' }}></i>;
const TypeIcon = () => <i className="fas fa-tag fa-fw" style={{ color: '#7acbf9' }}></i>;
const DEFAULT_ENTITY_PLACEHOLDER_IMAGE = '/images/unknown.jpg';
const FALLBACK_MOD_IMAGE = '/images/placeholder.jpg';

// Global View Mode Key
const VIEW_MODE_STORAGE_KEY = 'entityViewMode';
const LIST_ITEM_HEIGHT = 60; // Height including padding/margin
const GRID_ITEM_WIDTH = 330;
const GRID_ITEM_HEIGHT = 350; // Includes padding inside the cell

// --- Sort Options ---
const SORT_OPTIONS = [
    { value: 'name-asc', label: '名称（升序）' },
    { value: 'name-desc', label: '名称（降序）' },
    { value: 'id-desc', label: '添加日期（新→旧）' },
    { value: 'id-asc', label: '添加日期（旧→新）' },
    { value: 'enabled-desc', label: '状态（启用优先）' },
    { value: 'enabled-asc', label: '状态（禁用优先）' },
];
const DEFAULT_SORT_OPTION = 'name-asc';
// ----------------------

function EntityPage() {
    const { entitySlug } = useParams();
    const navigate = useNavigate();
    const [entity, setEntity] = useState(null);
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editingAsset, setEditingAsset] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [assetToDelete, setAssetToDelete] = useState(null);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // Default, loaded in useEffect
    const [modSearchTerm, setModSearchTerm] = useState('');
    // --- Sort State ---
    const [sortOption, setSortOption] = useState(DEFAULT_SORT_OPTION);
    const sortStorageKey = `entitySort_${entitySlug}`; // Per-entity sort storage
    // ---------------------
    // --- Type filtering ---
    const [activeTypeFilters, setActiveTypeFilters] = useState([]);
    const [availableTypes, setAvailableTypes] = useState([]);
    // ---------------------
    const [listContainerRef, bounds] = useMeasure();
    const [selectedAssetIds, setSelectedAssetIds] = useState(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    const [contextMenuVisible, setContextMenuVisible] = useState(false);
    const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
    const [contextMenuAsset, setContextMenuAsset] = useState(null); // Store the asset for context

    const [addToPresetAsset, setAddToPresetAsset] = useState(null); // Asset to add
    const [isAddToPresetModalOpen, setIsAddToPresetModalOpen] = useState(false);

    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const [lightboxImageUrl, setLightboxImageUrl] = useState(null);

    // New state for section view
    const [activeSection, setActiveSection] = useState('entity'); // 'entity' or 'mods'
    const mainContainerRef = useRef(null);
    
    // For detecting scroll direction
    const [hasScrolled, setHasScrolled] = useState(false);
    const pageRef = useRef(null);

    const [isWikiButtonHovered, setIsWikiButtonHovered] = useState(false);
    const [wikiError, setWikiError] = useState('');
    const [activeGame, setActiveGame] = useState('genshin');
    
    useEffect(() => {
        const fetchActiveGame = async () => {
          try {
            const game = await invoke('get_active_game');
            setActiveGame(game || 'genshin');
          } catch (err) {
            console.error("Failed to get active game:", err);
            setActiveGame('genshin');
          }
        };
        
        fetchActiveGame();
    }, []);

    const openWiki = async (entityName) => {
        setWikiError('');
        try {
            const wikiUrl = getWikiUrl(entityName, activeGame);
            await open(wikiUrl);
        } catch (err) {
            console.error("Failed to open wiki:", err);
            setWikiError("无法打开百科界面");
            toast.error("无法打开百科界面");
        }
    };

    // Fetch data (includes loading view mode and sort option)
    const fetchData = useCallback(async () => {
        const savedViewMode = getLocalStorageItem(VIEW_MODE_STORAGE_KEY, 'grid');
        setViewMode(savedViewMode);
        // --- Load saved sort option ---
        const savedSort = getLocalStorageItem(sortStorageKey, DEFAULT_SORT_OPTION);
        setSortOption(savedSort);
        // ---------------------------------

        console.log(`[EntityPage ${entitySlug}] Fetching data...`);
        setLoading(true);
        setError(null);
        setEntity(null);
        setAssets([]);
        setSelectedAssetIds(new Set()); // Reset selection on fetch
        try {
            const entityDetails = await invoke('get_entity_details', { entitySlug });
            setEntity(entityDetails);
            const entityAssets = await invoke('get_assets_for_entity', { entitySlug });
            setAssets(entityAssets);
            
            // Extract available types for filtering
            const details = parseDetails(entityDetails.details);
            if (details?.types && Array.isArray(details.types)) {
                setAvailableTypes(details.types);
            }
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown error');
            console.error(`[EntityPage ${entitySlug}] Failed to load data:`, errorString);
             if (errorString.includes("not found")) setError(`实体 '${entitySlug}' 未找到。`);
             else setError(`无法加载 ${entitySlug}的详情或模组。错误详情： ${errorString}`);
        } finally {
            setLoading(false);
            console.log(`[EntityPage ${entitySlug}] Fetching complete. Loading: ${false}`);
        }
    }, [entitySlug, sortStorageKey]); // Added sortStorageKey dependency

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Toggle type filter
    const toggleTypeFilter = useCallback((type) => {
        setActiveTypeFilters(prevFilters => {
            if (prevFilters.includes(type)) {
                return prevFilters.filter(t => t !== type);
            } else {
                return [...prevFilters, type];
            }
        });
    }, []);

    // Clear all type filters
    const clearTypeFilters = useCallback(() => {
        setActiveTypeFilters([]);
    }, []);

    // Callback for ModCard to update state after toggle
    const handleToggleComplete = useCallback((assetId, newIsEnabledState) => {
        console.log(`[EntityPage ${entitySlug}] handleToggleComplete called for asset ${assetId}, new state: ${newIsEnabledState}`);
        setAssets(currentAssets =>
            currentAssets.map(asset => {
                if (asset.id === assetId) {
                    const updatedAsset = { ...asset, is_enabled: newIsEnabledState };
                    return updatedAsset;
                }
                return asset;
            })
        );
        // Refetch entity details only if counts might change (for simplicity, always refetch)
        invoke('get_entity_details', { entitySlug })
            .then(updatedEntityDetails => {
                console.log(`[EntityPage ${entitySlug}] Refetched entity details after toggle:`, updatedEntityDetails);
                setEntity(updatedEntityDetails);
            })
            .catch(err => console.error(`[EntityPage ${entitySlug}] Failed to refetch entity details after toggle:`, err));

    }, [entitySlug]);

    // goBack function
    const goBack = () => {
         if (window.history.length > 2) {
            navigate(-1);
         } else {
             // Fallback logic
             const fallbackCategory = entity?.category_id === 1 ? 'characters' : 'characters'; // Simple default
             navigate(`/category/${fallbackCategory}`);
         }
    };

    // Edit Modal Handlers
    const handleOpenEditModal = useCallback((assetToEdit) => {
        console.log("Opening edit modal for:", assetToEdit);
        setEditingAsset(assetToEdit);
        setIsEditModalOpen(true);
    }, []);

    const handleCloseEditModal = useCallback(() => {
        setIsEditModalOpen(false);
        setEditingAsset(null);
    }, []);

    const handleSaveEditSuccess = useCallback((targetSlug) => {
        // Called when save is successful, receives the NEW target entity slug
        console.log("Save successful, processing result. New Target Slug:", targetSlug);
        handleCloseEditModal();
        if (targetSlug && targetSlug !== entitySlug) {
             console.log(`Asset relocated from ${entitySlug} to ${targetSlug}. Refreshing data.`);
             toast.info(`模组将被移动到 ${targetSlug}。正在刷新列表......`);
             // Refresh the current page's data (which will now exclude the moved mod)
             fetchData();
        } else {
            console.log(`Asset updated within ${entitySlug}. Refreshing data.`);
            toast.success(`模组详情已更新。`);
            fetchData(); // Refetch all data for the current entity
        }
    }, [handleCloseEditModal, entitySlug, fetchData]);


    // Delete Modal Handlers
    const handleOpenDeleteModal = useCallback((asset) => {
        setAssetToDelete(asset);
        setIsDeleteModalOpen(true);
        setDeleteError('');
    }, []);

    const handleCloseDeleteModal = useCallback(() => {
        setIsDeleteModalOpen(false);
        setAssetToDelete(null);
        setIsDeleting(false);
        setDeleteError('');
    }, []);

    const handleConfirmDelete = useCallback(async () => {
        if (!assetToDelete) return;
        setIsDeleting(true);
        setDeleteError('');
        try {
            await invoke('delete_asset', { assetId: assetToDelete.id });
            console.log(`Asset ${assetToDelete.id} deleted successfully.`);
            toast.success(`模组"${assetToDelete.name}"已删除。`);
            setAssets(currentAssets => currentAssets.filter(asset => asset.id !== assetToDelete.id));
             setEntity(currentEntity => ({ ...currentEntity, mod_count: Math.max(0, (currentEntity?.mod_count || 0) - 1) }));
             handleCloseDeleteModal();
        } catch (err) {
            const errorString = typeof err === 'string' ? err : (err?.message || 'Unknown delete error');
            console.error(`Failed to delete asset ${assetToDelete.id}:`, errorString);
            setDeleteError(`删除"${errorString}"失败`); // Show error in modal
            toast.error(`删除"${assetToDelete.name}"失败：${errorString}`); // Also show toast
             setIsDeleting(false); // Keep modal open on error
        }
    }, [assetToDelete, handleCloseDeleteModal]);

    // View Mode Toggle Handler
    const toggleViewMode = (newMode) => {
        if (newMode !== viewMode) {
            setViewMode(newMode);
            setLocalStorageItem(VIEW_MODE_STORAGE_KEY, newMode); // Save preference globally
            setSelectedAssetIds(new Set()); // Clear selection when changing view mode
        }
    };

    // --- Sort Change Handler ---
    const handleSortChange = useCallback((event) => {
        const newSortOption = event.target.value;
        setSortOption(newSortOption);
        setLocalStorageItem(sortStorageKey, newSortOption);
    }, [sortStorageKey]);
    // --------------------------------

    // --- UPDATED: useMemo for filtering AND sorting ---
    const filteredAndSortedAssets = useMemo(() => {
        let tempAssets = [...assets]; // Create shallow copy

        // Filtering Logic
        if (modSearchTerm || activeTypeFilters.length > 0) {
            tempAssets = tempAssets.filter(asset => {
                // Text search filtering
                let matchesSearch = true;
                if (modSearchTerm) {
                    const lowerSearchTerm = modSearchTerm.toLowerCase();
                    matchesSearch = 
                        asset.name.toLowerCase().includes(lowerSearchTerm) ||
                        (asset.author && asset.author.toLowerCase().includes(lowerSearchTerm)) ||
                        (asset.category_tag && asset.category_tag.toLowerCase().includes(lowerSearchTerm));
                }
                
                // Type filtering (only apply if there are active filters)
                let matchesTypeFilter = true;
                if (activeTypeFilters.length > 0) {
                    // Parse the asset's details to check types
                    const assetDetails = parseDetails(asset.details);
                    if (assetDetails.types && Array.isArray(assetDetails.types)) {
                        // Check if any of the asset's types match any of the active filters
                        // This is an OR relationship between filters
                        matchesTypeFilter = assetDetails.types.some(type => 
                            activeTypeFilters.includes(type)
                        );
                    } else {
                        // If the asset doesn't have types, it won't match any type filter
                        matchesTypeFilter = false;
                    }
                }
                
                return matchesSearch && matchesTypeFilter;
            });
        }

        // Sorting Logic
        tempAssets.sort((a, b) => {
            switch (sortOption) {
                case 'name-asc':
                    return a.name.localeCompare(b.name);
                case 'name-desc':
                    return b.name.localeCompare(a.name);
                case 'id-desc': // Newest first
                    return b.id - a.id;
                case 'id-asc': // Oldest first
                    return a.id - b.id;
                case 'enabled-desc': // Enabled first (true > false)
                    return (b.is_enabled === a.is_enabled) ? 0 : b.is_enabled ? 1 : -1;
                case 'enabled-asc': // Disabled first (false < true)
                    return (a.is_enabled === b.is_enabled) ? 0 : a.is_enabled ? 1 : -1;
                default:
                    return a.name.localeCompare(b.name); // Fallback
            }
        });

        return tempAssets;
    }, [assets, modSearchTerm, sortOption, activeTypeFilters]); // Added activeTypeFilters dependency
    // --- END UPDATED useMemo ---

    // --- Bulk Action Handlers ---
    const handleSelectAllChange = (event) => {
        const isChecked = event.target.checked;
        if (isChecked) {
            // Select all *filtered* assets
            setSelectedAssetIds(new Set(filteredAndSortedAssets.map(asset => asset.id))); // Use sorted/filtered list
        } else {
            setSelectedAssetIds(new Set());
        }
    };

    const handleAssetSelectChange = useCallback((assetId, isSelected) => {
        setSelectedAssetIds(prevSet => {
            const newSet = new Set(prevSet);
            if (isSelected) {
                newSet.add(assetId);
            } else {
                newSet.delete(assetId);
            }
            return newSet;
        });
    }, []);

    const handleBulkToggle = async (enable) => {
        if (selectedAssetIds.size === 0 || isBulkProcessing) return;

        setIsBulkProcessing(true);
        let successCount = 0;
        let failCount = 0;
        const updatedAssetsMap = new Map(assets.map(a => [a.id, { ...a }])); // Create a mutable map

        // Use toast for progress indication
        const toastId = toast.loading(`正在处理${selectedAssetIds.size}个模组......`, { closeButton: false });

        // Process items sequentially to avoid overwhelming backend/UI updates too rapidly
        for (const assetId of selectedAssetIds) {
            const currentAsset = updatedAssetsMap.get(assetId);
            if (!currentAsset || currentAsset.is_enabled === enable) {
                // Skip if asset not found or already in the desired state
                continue;
            }

            try {
                // Use the existing single toggle command
                const newIsEnabledState = await invoke('toggle_asset_enabled', {
                    entitySlug,
                    asset: currentAsset // Pass the current asset state
                });

                // Update the asset in our map immediately after successful toggle
                const isCurrentlyDisabledPrefixed = currentAsset.folder_name.startsWith('DISABLED_');
                 let cleanRelativePath = currentAsset.folder_name;
                 if (isCurrentlyDisabledPrefixed) {
                     const parts = currentAsset.folder_name.split('/');
                     const filename = parts.pop() || '';
                     cleanRelativePath = parts.length > 0 ? `${parts.join('/')}/${filename.substring(9)}` : filename.substring(9);
                 }
                 let updatedFolderName;
                 if (newIsEnabledState) {
                      updatedFolderName = cleanRelativePath;
                 } else {
                      const parts = cleanRelativePath.split('/');
                      const filename = parts.pop() || '';
                      const disabledFilename = `DISABLED_${filename}`;
                      updatedFolderName = parts.length > 0 ? `${parts.join('/')}/${disabledFilename}` : disabledFilename;
                  }
                updatedAssetsMap.set(assetId, { ...currentAsset, is_enabled: newIsEnabledState, folder_name: updatedFolderName });

                successCount++;
                toast.update(toastId, { render: `${enable ? '正在启用' : '正在禁用'}${successCount}/${selectedAssetIds.size}个模组......` });
            } catch (err) {
                failCount++;
                const errorString = typeof err === 'string' ? err : (err?.message || '未知的切换错误');
                console.error(`批量操作失败 ${assetId}:`, errorString);
                // Optionally show individual errors, but might be too noisy.
                // toast.error(`Failed for "${currentAsset.name}": ${errorString.substring(0,50)}`);
            }
        }

        // Update the main assets state once after all processing
        setAssets(Array.from(updatedAssetsMap.values()));
        setSelectedAssetIds(new Set()); // Clear selection

        // Update toast based on outcome
        if (failCount === 0) {
             toast.update(toastId, { render: `${enable ? '已成功启用' : '已成功禁用'} ${successCount}个模组！`, type: 'success', isLoading: false, autoClose: 3000 });
        } else {
             toast.update(toastId, { render: `批量作已完成。${successCount}项成功, ${failCount}项失败。`, type: 'warning', isLoading: false, autoClose: 5000 });
        }

        setIsBulkProcessing(false);

        // Refetch entity details to update counts
        invoke('get_entity_details', { entitySlug })
            .then(updatedEntityDetails => setEntity(updatedEntityDetails))
            .catch(err => console.error("批量切换后重新获取实体详细信息失败：", err));
    };

    // --- End Bulk Action Handlers ---

    const handleShowContextMenu = useCallback((event, asset) => {
        event.preventDefault();
        event.stopPropagation(); // Prevent triggering on parent elements
        setContextMenuPosition({ x: event.clientX, y: event.clientY });
        setContextMenuAsset(asset); // Store the specific asset right-clicked
        setContextMenuVisible(true);
    }, []);

    const handleCloseContextMenu = useCallback(() => {
        setContextMenuVisible(false);
    }, []);

    const handleOpenAddToPresetModal = useCallback((asset) => {
        setAddToPresetAsset(asset);
        setIsAddToPresetModalOpen(true);
    }, []);

    const handleCloseAddToPresetModal = useCallback(() => {
        setIsAddToPresetModalOpen(false);
        setAddToPresetAsset(null);
    }, []);

    const handleImageClick = useCallback((url) => {
        if (url && url !== FALLBACK_MOD_IMAGE) { // Don't open lightbox for fallback
            setLightboxImageUrl(url);
            setIsLightboxOpen(true);
        }
    }, []);

    const handleCloseLightbox = useCallback(() => {
        setIsLightboxOpen(false);
        setLightboxImageUrl(null);
    }, []);

    // --- New section transition handlers ---
    
    const handleScrollToMods = useCallback(() => {
        setActiveSection('mods');
        setHasScrolled(true);
    }, []);

    const handleScrollToEntity = useCallback(() => {
        setActiveSection('entity');
    }, []);

    // Add scroll detection with improved implementation
    useEffect(() => {
        const handleWheel = (e) => {
            if (activeSection === 'entity' && e.deltaY > 0) {
                // User is scrolling down while in entity view
                e.preventDefault(); // Prevent normal scrolling
                handleScrollToMods();
            }
        };

        const handleScroll = () => {
            // Backup detection using scroll position
            if (activeSection === 'entity' && window.scrollY > 10) {
                handleScrollToMods();
            }
        };

        // Attach both wheel and scroll event listeners
        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('wheel', handleWheel);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [activeSection, handleScrollToMods]);

    // --- Define Context Menu Items ---
    const contextMenuItems = useMemo(() => {
        if (!contextMenuAsset) return []; // No asset, no menu

        return [
            {
                label: '打开模组文件夹',
                icon: 'fas fa-folder-open',
                onClick: async () => {
                    handleCloseContextMenu(); // Close immediately
                    try {
                        await invoke('open_asset_folder', { assetId: contextMenuAsset.id });
                    } catch (err) {
                        toast.error(`Failed to open folder: ${err}`);
                    }
                }
            },
            {
                label: '添加到预设...',
                icon: 'fas fa-plus-circle',
                onClick: () => {
                    handleCloseContextMenu(); // Close context menu
                    handleOpenAddToPresetModal(contextMenuAsset); // Open the other modal
                }
            },
            { separator: true }, // Add a visual separator
            {
                label: '编辑模组信息',
                icon: 'fas fa-pencil-alt',
                onClick: () => {
                    handleCloseContextMenu();
                    handleOpenEditModal(contextMenuAsset);
                }
            },
            {
                label: '删除模组',
                icon: 'fas fa-trash-alt',
                danger: true, // Mark as danger for styling
                onClick: () => {
                    handleCloseContextMenu();
                    handleOpenDeleteModal(contextMenuAsset);
                }
            },
        ];
    // Dependencies include the asset itself and handlers needed within onClick
    }, [contextMenuAsset, handleCloseContextMenu, handleOpenAddToPresetModal, handleOpenEditModal, handleOpenDeleteModal]);
    // --------------------------------

    const ListItem = ({ index, style }) => {
        const asset = filteredAndSortedAssets[index]; // Use sorted/filtered list
        const isSelected = selectedAssetIds.has(asset.id);
        return (
             <div style={style}>
                 <ModCard
                     key={asset.id}
                     asset={asset}
                     entitySlug={entitySlug}
                     onToggleComplete={handleToggleComplete}
                     onEdit={handleOpenEditModal}
                     onDelete={handleOpenDeleteModal}
                     viewMode="list"
                     isSelected={isSelected}
                     onSelectChange={handleAssetSelectChange}
                     onContextMenu={(e) => handleShowContextMenu(e, asset)}
                     onImageClick={handleImageClick}
                 />
             </div>
        );
    };

    const GridItem = ({ columnIndex, rowIndex, style }) => {
        const columnCount = Math.max(1, Math.floor(bounds.width / GRID_ITEM_WIDTH));
        const index = rowIndex * columnCount + columnIndex;
        if (index >= filteredAndSortedAssets.length) return null; // Out of bounds
        const asset = filteredAndSortedAssets[index]; // Use sorted/filtered list
        return (
             <div style={style}>
                <div style={{ padding: '0 10px 10px 10px', height:'100%' }}>
                    <ModCard
                        key={asset.id}
                        asset={asset}
                        entitySlug={entitySlug}
                        onToggleComplete={handleToggleComplete}
                        onEdit={handleOpenEditModal}
                        onDelete={handleOpenDeleteModal}
                        viewMode="grid"
                        onContextMenu={(e) => handleShowContextMenu(e, asset)}
                        onImageClick={handleImageClick}
                    />
                 </div>
             </div>
        );
    };

    // Loading/Error/No Entity checks
    if (loading) return <div className="placeholder-text">Loading entity details for {entitySlug}... <i className="fas fa-spinner fa-spin"></i></div>;
    if (error) return <div className="placeholder-text" style={{ color: 'var(--danger)' }}>Error: {error}</div>;
    if (!entity) return <div className="placeholder-text">Entity data could not be loaded.</div>;

    // Details parsing and avatar URL
    const details = parseDetails(entity.details);
    
    // Determine character type (Genshin or ZZZ)
    const element = details?.element;
    const elementIconClass = element ? (elementIconsFA[element] || 'fas fa-question-circle') : null;
    const weapon = details?.weapon;
    const weaponIconClass = weapon ? (weaponIconsFA[weapon] || 'fas fa-question-circle') : null;
    const rarity = details?.rarity;
    
    // ZZZ-specific properties
    const attribute = details?.attribute;
    const attributeIconClass = attribute ? (attributeIconsFA[attribute] || 'fas fa-atom') : null;
    const specialty = details?.specialty;
    const specialtyIconClass = specialty ? (specialtyIconsFA[specialty] || 'fas fa-user-tag') : null;
    const types = details?.types || [];
    const rank = details?.rank;
    
    const avatarUrl = entity.base_image ? `/images/entities/${entitySlug}_base.jpg` : DEFAULT_ENTITY_PLACEHOLDER_IMAGE;
    const handleAvatarError = (e) => {
        if (e.target.src !== DEFAULT_ENTITY_PLACEHOLDER_IMAGE) {
            console.warn(`Failed to load entity avatar: ${avatarUrl}, falling back to placeholder.`);
            e.target.style.backgroundImage = `url('${DEFAULT_ENTITY_PLACEHOLDER_IMAGE}')`;
        }
     };

    const gridColumnCount = Math.max(1, Math.floor(bounds.width / GRID_ITEM_WIDTH));
    const gridRowCount = Math.ceil(filteredAndSortedAssets.length / gridColumnCount); // Use sorted/filtered list

    // --- Calculate "select all" checkbox state ---
    const isAllFilteredSelected = filteredAndSortedAssets.length > 0 && selectedAssetIds.size === filteredAndSortedAssets.length;
    const isIndeterminate = selectedAssetIds.size > 0 && selectedAssetIds.size < filteredAndSortedAssets.length;
    // -------------------------------------------

    return (
        <div 
            className={`character-page ${activeGame === 'zzz' ? 'zzz-character' : 'genshin-character'}`} 
            style={{ height: '100%', overflow: 'hidden', position: 'relative' }}
            ref={pageRef}
            onContextMenu={(e) => {
                // If the click isn't on a card (which would stop propagation), close the menu
                if (contextMenuVisible && !e.target.closest('.mod-card-grid, .mod-card-list')) {
                    e.preventDefault(); // Prevent default browser menu on page background
                    handleCloseContextMenu();
                }
            }}
        >
            {/* Fixed page header */}
            <div className="page-header" style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--darker)', padding: '15px 25px' }}>
                <h1 className="page-title">
                    <i
                        className="fas fa-arrow-left fa-fw"
                        onClick={goBack}
                        title="Back to list"
                        style={{ cursor: 'pointer', marginRight: '15px', opacity: 0.7 }}
                        role="button"
                        aria-label="Go back"
                        tabIndex={0}
                        onKeyPress={(e) => e.key === 'Enter' && goBack()}
                    ></i>
                    {entity.name} Mods
                </h1>

                {/* Navigation between profile and mods only appears when in mods view */}
                {activeSection === 'mods' && (
                    <button 
                        className="btn-icon" 
                        onClick={handleScrollToEntity}
                        style={{ fontSize: '20px', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer' }}
                        title="返回角色简介"
                    >
                        <i className="fas fa-chevron-up"></i>
                    </button>
                )}
            </div>

            {/* Container for both sections with animations */}
            <div className="sections-container" style={{ height: 'calc(100vh - 70px)', position: 'relative' }}>
                <AnimatePresence initial={false} mode="wait">
                    {activeSection === 'entity' ? (
                        <motion.div 
                            key="entity-section"
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -50 }}
                            transition={{ duration: 0.3 }}
                            style={{ height: '100%', padding: '0 25px', position: 'absolute', width: '100%', top: 0, left: 0 }}
                        >
                            <div className="character-profile" style={{ marginBottom: '30px' }}>
                                <div
                                    className="character-avatar"
                                    style={{ backgroundImage: `url('${avatarUrl}')`, height: '300px', width: '220px' }}
                                    onError={handleAvatarError}
                                >
                                </div>

                                <div className="character-info">
                                    <h2 className="character-name">
                                        {entity.name}
                                        {/* Display element icon for Genshin characters */}
                                        {elementIconClass && activeGame === 'genshin' &&
                                            <span className="element-icon" style={{ color: `var(--${element?.toLowerCase()})` || 'var(--primary)' }} title={element}>
                                                <i className={`${elementIconClass} fa-fw`}></i>
                                            </span>
                                        }
                                        {/* Display attribute icon for ZZZ characters */}
                                        {elementIconClass && activeGame === 'zzz' &&
                                            <span className="attribute-icon" style={{ color: `var(--zzz-${attribute?.toLowerCase()})` || 'var(--primary)' }} title={`属性： ${attribute}`}>
                                                <i className={`${attributeIconClass} fa-fw`}></i>
                                            </span>
                                        }
                                    </h2>
                                    <div className="character-details">
                                        {/* Game-specific character details */}
                                        {/* Genshin-specific details */}
                                        {activeGame === 'genshin' && element && 
                                            <div className="character-detail">
                                                <i className={`${elementIconClass} fa-fw`}></i> {element}
                                            </div>
                                        }
                                        {activeGame === 'genshin' && weapon && 
                                            <div className="character-detail">
                                                <i className={`${weaponIconClass} fa-fw`}></i> {weapon}
                                            </div>
                                        }
                                        {activeGame === 'genshin' && rarity &&
                                            <div className="character-detail">
                                                <i className="fas fa-star fa-fw" style={{ color: '#ffcc00' }}></i> {rarity}
                                            </div>
                                        }
                                        
                                        {/* ZZZ-specific details */}
                                        {activeGame === 'zzz' && attribute && 
                                            <div className="character-detail">
                                                <i className={`${attributeIconClass} fa-fw`}></i> {attribute}
                                            </div>
                                        }
                                        {activeGame === 'zzz' && specialty && 
                                            <div className="character-detail">
                                                <i className={`${specialtyIconClass} fa-fw`}></i> {specialty}
                                            </div>
                                        }
                                        {activeGame === 'zzz' && rank && 
                                            <div className="character-detail">
                                                <i className="fas fa-medal fa-fw" style={{ color: '#ffaa33' }}></i> Rank {rank}
                                            </div>
                                        }
                                        
                                        {/* Display types for ZZZ characters */}
                                        {activeGame === 'zzz' && types.length > 0 && (
                                            <div className="character-types">
                                                {types.map((type, index) => (
                                                    <span key={index} className="character-type-tag">
                                                        <TypeIcon /> {type}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    {entity.description ? (
                                        <p className="character-description">{entity.description}</p>
                                    ) : (
                                        <p className="character-description placeholder-text" style={{padding: 0, textAlign:'left'}}>没有可用的描述。</p>
                                    )}

                                    {/* Game-aware Wiki Button */}
                                    <motion.button
                                        className="btn wiki-button"
                                        onClick={() => openWiki(entity.name)}
                                        onMouseEnter={() => setIsWikiButtonHovered(true)}
                                        onMouseLeave={() => setIsWikiButtonHovered(false)}
                                        initial={{ scale: 1 }}
                                        whileHover={{ 
                                            scale: 1.05,
                                            transition: { duration: 0.2 }
                                        }}
                                        whileTap={{ scale: 0.98 }}
                                        style={{
                                            marginTop: '15px',
                                            background: `linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)`,
                                            color: 'white',
                                            border: 'none',
                                            borderRadius: '8px',
                                            padding: '8px 16px',
                                            fontSize: '14px',
                                            fontWeight: '500',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            boxShadow: isWikiButtonHovered 
                                                ? '0 5px 15px rgba(156, 136, 255, 0.5)' 
                                                : '0 4px 10px rgba(156, 136, 255, 0.3)',
                                            transition: 'box-shadow 0.3s ease',
                                            maxWidth: 'fit-content'
                                        }}
                                    >
                                        <i className="fas fa-book fa-fw"></i>
                                        在 {activeGame.toUpperCase()} 百科中查看
                                    </motion.button>
                                    {wikiError && <p style={{ color: 'var(--danger)', fontSize: '12px', marginTop: '5px' }}>{wikiError}</p>}
                                </div>
                            </div>

                            {/* Mod Statistics Dashboard */}
                            <ModStatsDashboard
                                totalMods={entity.mod_count || 0}
                                enabledMods={entity.enabled_mod_count || 0}
                                recentlyAdded={entity.recent_mod_count || 0} // You might need to add this to your entity details
                                favoriteCount={entity.favorite_mod_count || 0} // You might need to add this to your entity details
                                typeBreakdown={[
                                    // Example - replace with actual data from your app if available
                                    {type: 'Appearance', count: Math.round(entity.mod_count * 0.4) || 0},
                                    {type: 'Animation', count: Math.round(entity.mod_count * 0.2) || 0},
                                    {type: 'Texture', count: Math.round(entity.mod_count * 0.3) || 0},
                                    {type: 'Effect', count: Math.round(entity.mod_count * 0.1) || 0},
                                ]}
                            />

                            {/* Scroll indicator */}
                            <EnhancedScrollIndicator onViewMods={handleScrollToMods} />
                        </motion.div>
                    ) : (
                        <motion.div 
                            key="mods-section"
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 100 }}
                            transition={{ duration: 0.3 }}
                            style={{ height: '100%', padding: '0 25px', position: 'absolute', width: '100%', top: 0, left: 0 }}
                        >
                            <div className="mods-section" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                                {/* --- Updated Section Header --- */}
                                <div className="section-header" style={{ alignItems: 'center' }}>
                                    {/* --- Left Aligned Group (Title & Select All) --- */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        <h2 className="section-title" style={{ marginBottom: 0 }}>可用模组 ({filteredAndSortedAssets.length})</h2>
                                        {viewMode === 'list' && filteredAndSortedAssets.length > 0 && (
                                            <input
                                                type="checkbox"
                                                title={isAllFilteredSelected ? "取消全选" : "选择所有可见项"}
                                                checked={isAllFilteredSelected}
                                                ref={el => el && (el.indeterminate = isIndeterminate)}
                                                onChange={handleSelectAllChange}
                                                disabled={isBulkProcessing}
                                                style={{ cursor: 'pointer', width:'16px', height:'16px' }}
                                                aria-label="选择全部Mod"
                                            />
                                        )}
                                    </div>
                                    
                                    {/* --- Right Aligned Group (Bulk Actions, Sort, Search, View Mode) --- */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginLeft: 'auto' }}>
                                        {viewMode === 'list' && selectedAssetIds.size > 0 && (
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button className="btn btn-primary" onClick={() => handleBulkToggle(true)} disabled={isBulkProcessing} title="启用选中模组">
                                                    {isBulkProcessing ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-check fa-fw"></i>} 已启用 ({selectedAssetIds.size})
                                                </button>
                                                <button className="btn btn-outline" onClick={() => handleBulkToggle(false)} disabled={isBulkProcessing} title="禁用选中模组">
                                                    {isBulkProcessing ? <i className="fas fa-spinner fa-spin fa-fw"></i> : <i className="fas fa-times fa-fw"></i>} 已禁用 ({selectedAssetIds.size})
                                                </button>
                                            </div>
                                        )}
                                        
                                        {/* --- Type Filters (for ZZZ characters) --- */}
                                        {activeGame === 'zzz' && types.length > 0 && (
                                            <div className="type-filters-container">
                                                <div className="type-filters">
                                                    {types.map((type) => (
                                                        <button
                                                            key={type}
                                                            className={`type-filter-btn ${activeTypeFilters.includes(type) ? 'active' : ''}`}
                                                            onClick={() => toggleTypeFilter(type)}
                                                            title={`Filter by ${type}`}
                                                        >
                                                            <i className={typeIconsFA[type] || "fas fa-tag"}></i> {type}
                                                        </button>
                                                    ))}
                                                    {activeTypeFilters.length > 0 && (
                                                        <button 
                                                            className="type-filter-clear" 
                                                            onClick={clearTypeFilters}
                                                            title="清除所有筛选项"
                                                        >
                                                            <i className="fas fa-times"></i> Clear
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                        
                                        {/* --- Sort Dropdown --- */}
                                        <div className="sort-dropdown-container">
                                            <label htmlFor="mod-sort-select" style={sortStyles.sortLabel}>排序方式:</label>
                                            <select id="mod-sort-select" value={sortOption} onChange={handleSortChange} style={sortStyles.sortSelect} aria-label="排序模组">
                                                {SORT_OPTIONS.map(option => ( <option key={option.value} value={option.value}>{option.label}</option> ))}
                                            </select>
                                        </div>
                                        {/* --- End Sort Dropdown --- */}
                                        <div className="search-bar-container">
                                            <div className="search-bar">
                                                <i className="fas fa-search"></i>
                                                <input type="text" placeholder={`搜索模组...`} value={modSearchTerm} onChange={(e) => setModSearchTerm(e.target.value)} aria-label={`搜索模组`} data-global-search="true" />
                                            </div>
                                        </div>
                                        <div className="view-mode-toggle">
                                            <button className={`btn-icon ${viewMode === 'grid' ? 'active' : ''}`} onClick={() => toggleViewMode('grid')} title="Grid View"><i className="fas fa-th fa-fw"></i></button>
                                            <button className={`btn-icon ${viewMode === 'list' ? 'active' : ''}`} onClick={() => toggleViewMode('list')} title="List View"><i className="fas fa-list fa-fw"></i></button>
                                        </div>
                                    </div>
                                </div>
                                {/* --- End Updated Section Header --- */}

                                <div ref={listContainerRef} style={{ flex: 1, overflow: 'hidden', marginTop: '10px' }}>
                                    {loading ? (
                                        <div className={viewMode === 'grid' ? 'mods-grid' : 'mods-list'} style={{height: '100%'}}>
                                            {Array.from({ length: 6 }).map((_, i) => <ModCardSkeleton key={i} viewMode={viewMode} />)}
                                        </div>
                                    ) : !filteredAndSortedAssets.length ? (
                                        <p className="placeholder-text" style={{ gridColumn: '1 / -1', width: '100%', paddingTop: '30px' }}>
                                            {assets.length === 0 ? `没有找到“${entity.name}”的模组。` : '没有找到符合搜索/筛选条件的模组。'}
                                        </p>
                                    ) : bounds.width > 0 && bounds.height > 0 ? (
                                        viewMode === 'list' ? (
                                            <FixedSizeList
                                                height={bounds.height - 100}
                                                itemCount={filteredAndSortedAssets.length}
                                                itemSize={LIST_ITEM_HEIGHT}
                                                width={bounds.width}
                                                style={{overflowX:'hidden'}}
                                            >
                                                {ListItem}
                                            </FixedSizeList>
                                        ) : (
                                            <FixedSizeGrid
                                                columnCount={gridColumnCount}
                                                columnWidth={GRID_ITEM_WIDTH}
                                                height={bounds.height - 100}
                                                rowCount={gridRowCount}
                                                rowHeight={GRID_ITEM_HEIGHT}
                                                width={bounds.width}
                                                itemData={filteredAndSortedAssets} // Pass sorted list here
                                            >
                                                {GridItem}
                                            </FixedSizeGrid>
                                        )
                                    ) : (
                                        <p className="placeholder-text">Calculating layout...</p>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* --- Render Context Menu --- */}
            <ContextMenu
                isVisible={contextMenuVisible}
                xPos={contextMenuPosition.x}
                yPos={contextMenuPosition.y}
                items={contextMenuItems}
                onClose={handleCloseContextMenu}
            />

            {/* --- Render Lightbox --- */}
            <LightboxModal
                isOpen={isLightboxOpen}
                imageUrl={lightboxImageUrl}
                onClose={handleCloseLightbox}
            />

            {/* Modals */}
            {isEditModalOpen && editingAsset && ( <ModEditModal asset={editingAsset} currentEntitySlug={entitySlug} onClose={handleCloseEditModal} onSaveSuccess={handleSaveEditSuccess} /> )}
            {isDeleteModalOpen && assetToDelete && (
                <ConfirmationModal
                    isOpen={isDeleteModalOpen}
                    onClose={handleCloseDeleteModal}
                    onConfirm={handleConfirmDelete}
                    title="Confirm Deletion"
                    confirmText="Delete"
                    confirmButtonVariant="danger"
                    isLoading={isDeleting}
                    errorMessage={deleteError}
                >
                    你确定要永久删除模组"{assetToDelete.name}"吗?
                    将会从硬盘中永久移除mod文件, 无法恢复.
                </ConfirmationModal>
            )}
            {isAddToPresetModalOpen && addToPresetAsset && ( <AddToPresetModal assetId={addToPresetAsset.id} assetName={addToPresetAsset.name} isOpen={isAddToPresetModalOpen} onClose={handleCloseAddToPresetModal} /> )}
        </div>
    );
}

// --- Styles for scroll indicator ---
const scrollIndicatorStyle = {
    textAlign: 'center',
    marginTop: '50px',
    padding: '20px',
    animation: 'fadeIn 0.5s ease-in-out',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: '16px'
};

// --- Styles for sort dropdown and type filters ---
const sortStyles = {
    sortLabel: {
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginRight: '8px',
        whiteSpace: 'nowrap', // Prevent label wrapping
    },
    sortSelect: {
        padding: '6px 10px',
        backgroundColor: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: 'var(--light)',
        fontSize: '13px',
        cursor: 'pointer',
        minWidth: '180px', // Adjust width as needed
        height: '34px', // Match height with filter buttons roughly
    },
};
// --- End styles ---

export default EntityPage;