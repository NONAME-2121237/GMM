// src/pages/HomePage.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/tauri';
import EntityCard from '../components/EntityCard';
import { getLocalStorageItem, setLocalStorageItem } from '../utils/localStorage';

// Element data (keep existing)
const elements = [
    { key: 'all', name: 'All', icon: 'fas fa-circle-nodes', color: 'var(--light)' },
    { key: 'Pyro', name: 'Pyro', icon: 'fas fa-fire', color: 'var(--pyro)' },
    { key: 'Hydro', name: 'Hydro', icon: 'fas fa-tint', color: 'var(--hydro)' },
    { key: 'Anemo', name: 'Anemo', icon: 'fas fa-wind', color: 'var(--anemo)' },
    { key: 'Electro', name: 'Electro', icon: 'fas fa-bolt', color: 'var(--electro)' },
    { key: 'Dendro', name: 'Dendro', icon: 'fas fa-leaf', color: 'var(--dendro)' },
    { key: 'Cryo', name: 'Cryo', icon: 'fas fa-snowflake', color: 'var(--cryo)' },
    { key: 'Geo', name: 'Geo', icon: 'fas fa-mountain', color: 'var(--geo)' },
];

// Helper to safely parse JSON (keep existing)
const safeParseJson = (jsonString, defaultValue = null) => {
    if (!jsonString) return defaultValue;
    try { return JSON.parse(jsonString); }
    catch (e) { console.error("JSON parse error:", e); return defaultValue; }
};

// Sorting Options (keep existing)
const sortOptions = [
    { value: 'name-asc', label: 'Name (A-Z)' },
    { value: 'name-desc', label: 'Name (Z-A)' },
    { value: 'count-desc', label: 'Mod Count (High-Low)' },
    { value: 'count-asc', label: 'Mod Count (Low-High)' },
];
const DEFAULT_SORT_OPTION = 'name-asc';
const OTHER_ENTITY_SUFFIX = '-other'; // Define suffix constant

function HomePage() {
    const { categorySlug } = useParams();
    const [categoryInfo, setCategoryInfo] = useState({ name: categorySlug, id: null });
    const [entities, setEntities] = useState([]);
    const [loadingEntities, setLoadingEntities] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedElement, setSelectedElement] = useState('all');
    const [sortOption, setSortOption] = useState(DEFAULT_SORT_OPTION);
    const sortStorageKey = `categorySort_${categorySlug}`;

    useEffect(() => {
        setLoadingEntities(true);
        setError(null);
        setEntities([]);
        setSelectedElement('all');
        setSearchTerm('');
        const savedSort = getLocalStorageItem(sortStorageKey, DEFAULT_SORT_OPTION);
        setSortOption(savedSort);
        setCategoryInfo({ name: categorySlug || 'Unknown', id: null });

        invoke('get_entities_by_category', { categorySlug })
            .then(setEntities)
            .catch(err => {
                console.error(`Failed to fetch entities for ${categorySlug}:`, err);
                setError(`Could not load ${categorySlug}.`);
            })
            .finally(() => setLoadingEntities(false));

    }, [categorySlug, sortStorageKey]);

    const handleSortChange = (event) => {
        const newSortOption = event.target.value;
        setSortOption(newSortOption);
        setLocalStorageItem(sortStorageKey, newSortOption);
    };

    // --- MODIFIED: Memoized filtered AND sorted list ---
    const filteredAndSortedEntities = useMemo(() => {
        // Filtering (keep existing logic)
        let tempEntities = entities.filter(entity => {
            if (categorySlug === 'characters' && selectedElement !== 'all') {
                const details = safeParseJson(entity.details, {});
                if (details?.element !== selectedElement) return false;
            }
            if (searchTerm && !entity.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                 return false;
            }
            return true;
        });

        // Sorting with "Other" priority for name sorts
        tempEntities.sort((a, b) => {
            const isAOther = a.slug.endsWith(OTHER_ENTITY_SUFFIX);
            const isBOther = b.slug.endsWith(OTHER_ENTITY_SUFFIX);

            // Prioritize "Other" group first
            if (isAOther && !isBOther) return -1; // a (Other) comes before b
            if (!isAOther && isBOther) return 1;  // b (Other) comes before a
            // If both are Other or neither are Other, apply selected sort:
            if (isAOther && isBOther) { // Within "Other", sort by name or count
                switch (sortOption) {
                    case 'name-desc': return b.name.localeCompare(a.name);
                    case 'count-desc': return (b.mod_count ?? 0) - (a.mod_count ?? 0);
                    case 'count-asc': return (a.mod_count ?? 0) - (b.mod_count ?? 0);
                    case 'name-asc': // Fallthrough intended for default name ascending
                    default: return a.name.localeCompare(b.name);
                }
            } else { // Neither is "Other", standard sort
                 switch (sortOption) {
                    case 'name-asc': return a.name.localeCompare(b.name);
                    case 'name-desc': return b.name.localeCompare(a.name);
                    case 'count-desc': return (b.mod_count ?? 0) - (a.mod_count ?? 0);
                    case 'count-asc': return (a.mod_count ?? 0) - (b.mod_count ?? 0);
                    default: return 0;
                }
            }

        });

        return tempEntities;
    }, [entities, searchTerm, selectedElement, categorySlug, sortOption]); // Keep dependencies


    const pageTitle = categoryInfo.name.charAt(0).toUpperCase() + categoryInfo.name.slice(1);
    const showElementFilters = categorySlug === 'characters';

    return (
        <div className="home-page fadeIn">
            <div className="page-header">
                <h1 className="page-title">{pageTitle}</h1>

                {/* Sort Dropdown */}
                <div className="sort-dropdown-container" style={{ marginLeft: showElementFilters ? '20px' : 'auto', marginRight: '20px' }}>
                     <label htmlFor="sort-select" style={styles.sortLabel}>Sort by:</label>
                     <select id="sort-select" value={sortOption} onChange={handleSortChange} style={styles.sortSelect} aria-label="Sort entities">
                         {sortOptions.map(option => ( <option key={option.value} value={option.value}>{option.label}</option> ))}
                     </select>
                </div>

                {/* Element Filters (Conditional) */}
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

                {/* Search Bar Container */}
                <div className="search-bar-container">
                     <div className="search-bar">
                        <i className="fas fa-search"></i>
                        <input type="text" placeholder={`Search ${pageTitle.toLowerCase()}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} aria-label={`Search ${pageTitle}`} />
                    </div>
                </div>
            </div>

            {/* Content Area */}
            {loadingEntities && <div className="placeholder-text">Loading {pageTitle.toLowerCase()}...</div>}
            {error && <div className="placeholder-text" style={{ color: 'var(--danger)' }}>Error: {error}</div>}

            {!loadingEntities && !error && (
                <div className="cards-grid"> {/* Keep grid class, individual cards handle view mode */}
                    {filteredAndSortedEntities.length > 0 ? (
                        filteredAndSortedEntities.map(entity => (
                            <EntityCard key={entity.slug} entity={entity} />
                        ))
                    ) : entities.length > 0 ? (
                         <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>No {pageTitle.toLowerCase()} found matching your criteria.</p>
                     ) : (
                         <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>No {pageTitle.toLowerCase()} have been added yet.</p>
                    )}
                </div>
            )}
        </div>
    );
}

const styles = {
    sortLabel: {
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginRight: '8px',
    },
    sortSelect: {
        padding: '6px 10px',
        backgroundColor: 'rgba(0,0,0,0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '6px',
        color: 'var(--light)',
        fontSize: '13px',
        cursor: 'pointer',
        minWidth: '150px',
    },
};

export default HomePage;