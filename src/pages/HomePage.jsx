// src/pages/HomePage.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import EntityCard from '../components/EntityCard';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';
import EntityCardSkeleton from '../components/EntityCardSkeleton';

// Element data for Genshin
const elements = [
    { key: 'all', name: '全部', icon: 'fas fa-circle-nodes', color: 'var(--light)' },
    { key: '火', name: '火', icon: 'fas fa-fire', color: 'var(--火)' },
    { key: '水', name: '水', icon: 'fas fa-tint', color: 'var(--水)' },
    { key: '风', name: '风', icon: 'fas fa-wind', color: 'var(--风)' },
    { key: '雷', name: '雷', icon: 'fas fa-bolt', color: 'var(--雷)' },
    { key: '草', name: '草', icon: 'fas fa-leaf', color: 'var(--草)' },
    { key: '冰', name: '冰', icon: 'fas fa-snowflake', color: 'var(--冰)' },
    { key: '岩', name: '岩', icon: 'fas fa-mountain', color: 'var(--岩)' },
];

// Attribute data for ZZZ
const attributes = [
    { key: 'all', name: '全部', icon: 'fas fa-circle-nodes', color: 'var(--light)' },
    { key: 'Electric', name: '电', icon: 'fas fa-bolt', color: 'var(--zzz-electric)' },
    { key: 'Fire', name: '火', icon: 'fas fa-fire', color: 'var(--zzz-fire)' },
    { key: 'Ice', name: '冰', icon: 'fas fa-snowflake', color: 'var(--zzz-ice)' },
    { key: 'Frost', name: '霜', icon: 'fas fa-snowflake', color: 'var(--zzz-ice)' },
    { key: 'Ether', name: '以太', icon: 'fas fa-star', color: 'var(--zzz-ether)' },
    { key: 'Physical', name: '物理', icon: 'fas fa-fist-raised', color: 'var(--zzz-physical)' },
];

// Helper to safely parse JSON
const safeParseJson = (jsonString, defaultValue = null) => {
    if (!jsonString) return defaultValue;
    try {
        return JSON.parse(jsonString);
    } catch (e) {
        console.error("JSON parse error:", e);
        return defaultValue;
    }
};

// Sorting Options including new ones
const sortOptions = [
    { value: 'name-asc', label: '名称（升序）' },
    { value: 'name-desc', label: '名称（降序）' },
    { value: 'total-desc', label: '模组总数（高→低）' },
    { value: 'total-asc', label: '模组总数（低→高）' },
    { value: 'enabled-desc', label: '启用模组（高→低）' },
    { value: 'enabled-asc', label: '启用模组（低→高）' },
];
const DEFAULT_SORT_OPTION = 'name-asc';
const OTHER_ENTITY_SUFFIX = '-other'; // Make sure this matches backend

function HomePage() {
    const { categorySlug } = useParams();
    const [categoryInfo, setCategoryInfo] = useState({ name: categorySlug, id: null });
    // State holds the new structure returned by the backend
    const [entitiesWithCounts, setEntitiesWithCounts] = useState([]);
    const [loadingEntities, setLoadingEntities] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedElement, setSelectedElement] = useState('all');
    const [selectedAttribute, setSelectedAttribute] = useState('all');
    const [sortOption, setSortOption] = useState(DEFAULT_SORT_OPTION);
    const [activeGame, setActiveGame] = useState('genshin');
    const sortStorageKey = `categorySort_${categorySlug}`;

    // Fetch Active Game Info
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

    // Fetch Category Info and Entities with Counts
    useEffect(() => {
        setLoadingEntities(true);
        setError(null);
        setEntitiesWithCounts([]); // Clear previous entities
        setSelectedElement('all');
        setSelectedAttribute('all');
        setSearchTerm('');
        const savedSort = getLocalStorageItem(sortStorageKey, DEFAULT_SORT_OPTION);
        setSortOption(savedSort);
        // Simple category name update, could fetch real name later if needed
        setCategoryInfo({ name: categorySlug ? categorySlug.charAt(0).toUpperCase() + categorySlug.slice(1) : '未知', id: null });

        // Call the new backend command
        invoke('get_entities_by_category_with_counts', { categorySlug })
            .then(fetchedData => {
                // Add console log to verify data structure
                setEntitiesWithCounts(fetchedData || []); // Ensure it's an array
            })
            .catch(err => {
                console.error(`Failed to fetch entities with counts for ${categorySlug}:`, err);
                setError(`无法加载 ${categorySlug}。 因为: ${typeof err === 'string' ? err : err.message || '未知错误'}`);
            })
            .finally(() => setLoadingEntities(false));

    }, [categorySlug, sortStorageKey]); // Dependencies for fetching data

    // Handle Sort Change
    const handleSortChange = (event) => {
        const newSortOption = event.target.value;
        setSortOption(newSortOption);
        setLocalStorageItem(sortStorageKey, newSortOption);
    };

    // Memoized filtered AND sorted list
    const filteredAndSortedEntities = useMemo(() => {
        // Start with the fetched data
        let tempEntities = [...entitiesWithCounts]; // Create a copy to sort

        // Filtering Logic
        tempEntities = tempEntities.filter(entity => {
            // Element Filter (only for Genshin characters category)
            if (categorySlug === 'characters' && activeGame === 'genshin' && selectedElement !== 'all') {
                const details = safeParseJson(entity.details, {});
                if (details?.element !== selectedElement) return false;
            }
            
            // Attribute Filter (only for ZZZ characters category)
            if (categorySlug === 'characters' && activeGame === 'zzz' && selectedAttribute !== 'all') {
                const details = safeParseJson(entity.details, {});
                if (details?.attribute !== selectedAttribute) return false;
            }
            
            // Search Term Filter
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                if (!entity.name.toLowerCase().includes(lowerSearch)) {
                     return false; // Exclude if name doesn't match
                }
            }
            return true; // Include if passes all filters
        });

        // Sorting Logic with "Other" priority
        tempEntities.sort((a, b) => {
            const isAOther = a.slug.endsWith(OTHER_ENTITY_SUFFIX);
            const isBOther = b.slug.endsWith(OTHER_ENTITY_SUFFIX);

            // Prioritize "Other" group first
            if (isAOther && !isBOther) return -1;
            if (!isAOther && isBOther) return 1;

            // Apply selected sort (within 'Other' group or for non-'Other' items)
            // Use nullish coalescing (?? 0) to safely handle potential undefined/null counts
            switch (sortOption) {
                case 'name-asc': return a.name.localeCompare(b.name);
                case 'name-desc': return b.name.localeCompare(a.name);
                case 'total-desc': return (b.total_mods ?? 0) - (a.total_mods ?? 0);
                case 'total-asc': return (a.total_mods ?? 0) - (b.total_mods ?? 0);
                case 'enabled-desc': return (b.enabled_mods ?? 0) - (a.enabled_mods ?? 0);
                case 'enabled-asc': return (a.enabled_mods ?? 0) - (b.enabled_mods ?? 0);
                default: return a.name.localeCompare(b.name); // Fallback to name ascending
            }
        });

        return tempEntities;
    }, [entitiesWithCounts, searchTerm, selectedElement, selectedAttribute, categorySlug, sortOption, activeGame]); // Dependencies for memoization


    const pageTitle = categoryInfo.name; // Use state for title
    const showElementFilters = categorySlug === 'characters' && activeGame === 'genshin';
    const showAttributeFilters = categorySlug === 'characters' && activeGame === 'zzz';

    return (
        <div className="home-page fadeIn">
            <div className="page-header">
                 <h1 className="page-title">{pageTitle}</h1>

                 {/* Sort Dropdown */}
                 <div className="sort-dropdown-container" style={{ 
                     marginLeft: (showElementFilters || showAttributeFilters) ? '20px' : 'auto', 
                     marginRight: '20px' 
                 }}>
                     <label htmlFor="sort-select" style={styles.sortLabel}>排序依照:</label>
                     <select id="sort-select" value={sortOption} onChange={handleSortChange} style={styles.sortSelect} aria-label="Sort entities">
                         {sortOptions.map(option => ( <option key={option.value} value={option.value}>{option.label}</option> ))}
                     </select>
                 </div>

                 {/* Element Filters (Conditional for Genshin) */}
                 {showElementFilters && (
                     <div className="element-filters">
                          {elements.map(element => (
                             <button
                                 key={element.key}
                                 className={`element-filter-button ${selectedElement === element.key ? 'active' : ''}`}
                                 onClick={() => setSelectedElement(element.key)}
                                 title={element.name}
                                 style={{ '--element-color': element.color }}
                             >
                                 <i className={`${element.icon} fa-fw`}></i>
                                 <span className="filter-button-name">{element.name}</span>
                             </button>
                         ))}
                     </div>
                 )}

                 {/* Attribute Filters (Conditional for ZZZ) */}
                 {showAttributeFilters && (
                     <div className="attribute-filters">
                          {attributes.map(attribute => (
                             <button
                                 key={attribute.key}
                                 className={`attribute-filter-button ${selectedAttribute === attribute.key ? 'active' : ''}`}
                                 onClick={() => setSelectedAttribute(attribute.key)}
                                 title={attribute.name}
                                 style={{ '--attribute-color': attribute.color }}
                             >
                                 <i className={`${attribute.icon} fa-fw`}></i>
                                 <span className="filter-button-name">{attribute.name}</span>
                             </button>
                         ))}
                     </div>
                 )}

                 {/* Search Bar Container */}
                 <div className="search-bar-container">
                      <div className="search-bar">
                         <i className="fas fa-search"></i>
                         <input
                             type="text"
                             placeholder={`搜索${pageTitle ? pageTitle.toLowerCase() : '项目'}...`}
                             value={searchTerm}
                             onChange={(e) => setSearchTerm(e.target.value)}
                             aria-label={`搜索 ${pageTitle}`}
                             data-global-search="true"
                         />
                     </div>
                 </div>
            </div>

            {/* Content Area */}
            {loadingEntities ? (
                <div className="cards-grid">
                    {/* Render Skeleton loaders */}
                    {Array.from({ length: 12 }).map((_, i) => <EntityCardSkeleton key={i} />)}
                </div>
            ) : error ? (
                 <div className="placeholder-text" style={{ color: 'var(--danger)' }}>Error: {error}</div>
             ) : (
                 <div className="cards-grid">
                     {filteredAndSortedEntities.length > 0 ? (
                        filteredAndSortedEntities.map(entityData => (
                            <EntityCard key={entityData.slug} entity={entityData} />
                        ))
                     ) : entitiesWithCounts.length > 0 ? (
                          <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>
                              未找到符合筛选条件的{pageTitle ? pageTitle.toLowerCase() : '项目'}
                          </p>
                      ) : (
                          <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>
                             当前{pageTitle ? pageTitle.toLowerCase() : '项目'}列表为空
                          </p>
                     )}
                 </div>
             )}
        </div>
    );
}

// Styles for sort dropdown
const styles = {
    sortLabel: {
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginRight: '8px',
        whiteSpace: 'nowrap',
        content: '排序方式：' // 新增中文标签
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


export default HomePage;