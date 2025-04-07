// src/pages/HomePage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom'; // Removed useNavigate as it's not needed here anymore
import { invoke } from '@tauri-apps/api/tauri';
import EntityCard from '../components/EntityCard';

// Define Element data (could be moved to a constants file)
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


function HomePage() {
    // This component now ONLY handles /category/:categorySlug
    const { categorySlug } = useParams();
    const [categoryInfo, setCategoryInfo] = useState({ name: categorySlug, id: null }); // Store category name/id
    const [entities, setEntities] = useState([]);
    const [loadingEntities, setLoadingEntities] = useState(true);
    const [error, setError] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedElement, setSelectedElement] = useState('all'); // State for element filter

    // Fetch Category Info and Entities based on slug
    useEffect(() => {
        setLoadingEntities(true);
        setError(null);
        setEntities([]); // Clear previous entities
        setSelectedElement('all'); // Reset filter on category change
        setSearchTerm(''); // Reset search term

        // Fetch category details (like name) and then entities
        // This requires a new backend command or modification if we want the proper name
        // For now, just use the slug as the name, TBD enhance later
        setCategoryInfo({ name: categorySlug || 'Unknown', id: null });

        invoke('get_entities_by_category', { categorySlug })
            .then(setEntities)
            .catch(err => {
                console.error(`Failed to fetch entities for ${categorySlug}:`, err);
                setError(`Could not load ${categorySlug}.`);
            })
            .finally(() => setLoadingEntities(false));

        // TODO: Add a backend call like `get_category_details` to get the proper name
        // invoke('get_category_details', { categorySlug }).then(info => setCategoryInfo(info)).catch(...)

    }, [categorySlug]); // Re-run only when categorySlug changes

    // Memoized filtered list based on search and element
    const filteredEntities = useMemo(() => {
        return entities.filter(entity => {
            // Element Check (only if category is characters and filter is not 'all')
            if (categorySlug === 'characters' && selectedElement !== 'all') {
                const details = safeParseJson(entity.details, {});
                if (details?.element !== selectedElement) {
                    return false; // Mismatch element, exclude
                }
            }

            // Search Term Check
            if (searchTerm && !entity.name.toLowerCase().includes(searchTerm.toLowerCase())) {
                 return false; // Mismatch search term, exclude
            }

            return true; // Passed all filters
        });
    }, [entities, searchTerm, selectedElement, categorySlug]);


    const pageTitle = categoryInfo.name.charAt(0).toUpperCase() + categoryInfo.name.slice(1);
    const showElementFilters = categorySlug === 'characters'; // Condition to show filters

    return (
        <div className="home-page fadeIn"> {/* Keep class name for potential styling */}
            <div className="page-header">
                {/* Title */}
                <h1 className="page-title">{pageTitle}</h1>

                {/* Element Filters (Conditional) */}
                {showElementFilters && (
                    <div className="element-filters">
                        {elements.map(element => (
                            <button
                                key={element.key}
                                className={`element-filter-button ${selectedElement === element.key ? 'active' : ''}`}
                                onClick={() => setSelectedElement(element.key)}
                                title={element.name}
                                style={{ '--element-color': element.color }} // Pass color via CSS variable
                            >
                                <i className={`${element.icon} fa-fw`}></i>
                                {/* Optionally show name on larger screens */}
                                <span className="filter-button-name">{element.name}</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* Search Bar Container (for alignment) */}
                <div className="search-bar-container">
                     <div className="search-bar">
                        <i className="fas fa-search"></i>
                        <input
                            type="text"
                            placeholder={`Search ${pageTitle.toLowerCase()}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            aria-label={`Search ${pageTitle}`}
                        />
                    </div>
                </div>
            </div>

            {/* REMOVED Tab Navigation */}

            {/* Content Area */}
            {loadingEntities && <div className="placeholder-text">Loading {pageTitle.toLowerCase()}...</div>}
            {error && <div className="placeholder-text" style={{ color: 'var(--danger)' }}>Error: {error}</div>}

            {!loadingEntities && !error && (
                <div className="cards-grid">
                    {filteredEntities.length > 0 ? (
                        filteredEntities.map(entity => (
                            <EntityCard key={entity.slug} entity={entity} />
                        ))
                    ) : entities.length > 0 ? (
                         // Message when search/filter yields no results but there *are* entities
                         <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>
                             No {pageTitle.toLowerCase()} found matching your criteria.
                         </p>
                     ) : (
                         // Message when the category is completely empty
                         <p className="placeholder-text" style={{ gridColumn: '1 / -1' }}>
                            No {pageTitle.toLowerCase()} have been added to the manager yet.
                         </p>
                    )}
                </div>
            )}
        </div>
    );
}

export default HomePage;