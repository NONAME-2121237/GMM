import React from 'react';
import { Link } from 'react-router-dom';

// Helper function to parse details JSON or return default
const parseDetails = (detailsJson) => {
    try {
        if (!detailsJson) return {};
        return JSON.parse(detailsJson);
    } catch (e) {
        console.error("Failed to parse entity details JSON:", e);
        return {}; // Return empty object on error
    }
};

// Use Font Awesome icons map
const elementIconsFA = {
    Electro: "fas fa-bolt", Pyro: "fas fa-fire", Cryo: "fas fa-snowflake",
    Hydro: "fas fa-tint", Anemo: "fas fa-wind", Geo: "fas fa-mountain",
    Dendro: "fas fa-leaf",
};
const RarityIcon = () => <i className="fas fa-star fa-fw" style={{ color: '#ffcc00' }}></i>; // Gold star

// Default placeholder image path (relative to public)
const DEFAULT_PLACEHOLDER_IMAGE = '/images/unknown.png';

function EntityCard({ entity }) {
    const details = parseDetails(entity.details);
    const element = details?.element;
    const elementIconClass = element ? (elementIconsFA[element] || 'fas fa-question-circle') : null;

    // --- Construct image URL ---
    // Use the base_image field if available, otherwise use placeholder
    const imageUrl = entity.base_image
        ? `/images/entities/${entity.base_image}` // Path relative to public folder
        : DEFAULT_PLACEHOLDER_IMAGE; // Fallback

    // --- Handle image loading errors ---
    const handleImageError = (e) => {
        // If the specific image fails, fall back to the generic placeholder
        if (e.target.src !== DEFAULT_PLACEHOLDER_IMAGE) {
            console.warn(`Failed to load base image: ${imageUrl}, falling back to placeholder.`);
            e.target.src = DEFAULT_PLACEHOLDER_IMAGE;
        }
    };

    return (
        <Link to={`/entity/${entity.slug}`} className="character-card" title={`View mods for ${entity.name}`}>
             {entity.mod_count > 0 && (
                <div className="card-badge">{entity.mod_count} Mod{entity.mod_count > 1 ? 's' : ''}</div>
             )}
            {/* Use background image for the card effect */}
            <div
                className="card-image"
                style={{ backgroundImage: `url('${imageUrl}')` }}
                // Add onError for background images is tricky, usually better handled by checking existence or using <img>
                // For simplicity, we assume bundled images load. If not, the background will be blank or show broken icon.
            ></div>
            <div className="card-content">
                <div className="card-name">{entity.name}</div>
                 {element && elementIconClass && (
                    <div className="card-element" title={element}>
                       <i className={`${elementIconClass} fa-fw`} style={{ color: `var(--${element?.toLowerCase()})` || 'var(--light)' }}></i>
                       {element}
                    </div>
                 )}
                 {details?.rarity && (
                     <div className="card-element" style={{ marginTop: '5px', fontSize: '13px' }}>
                         <RarityIcon /> {details.rarity}
                     </div>
                 )}
            </div>
        </Link>
    );
}

export default EntityCard;