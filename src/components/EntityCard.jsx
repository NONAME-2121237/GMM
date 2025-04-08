// src/components/EntityCard.jsx
import React from 'react';
import { Link } from 'react-router-dom';

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

// Font Awesome icons map
const elementIconsFA = {
    Electro: "fas fa-bolt", Pyro: "fas fa-fire", Cryo: "fas fa-snowflake",
    Hydro: "fas fa-tint", Anemo: "fas fa-wind", Geo: "fas fa-mountain",
    Dendro: "fas fa-leaf",
};
const RarityIcon = () => <i className="fas fa-star fa-fw" style={{ color: '#ffcc00' }}></i>;
const DEFAULT_PLACEHOLDER_IMAGE = '/images/unknown.png';

function EntityCard({ entity }) {
    // Destructure props including counts
    const { slug, name, details: detailsJson, base_image, total_mods, enabled_mods } = entity;

    const details = parseDetails(detailsJson);
    const element = details?.element;
    const elementIconClass = element ? (elementIconsFA[element] || 'fas fa-question-circle') : null;

    const imageUrl = base_image ? `/images/entities/${base_image}` : DEFAULT_PLACEHOLDER_IMAGE;

    const handleImageError = (e) => {
        // If the specific image fails, fall back to the generic placeholder
        if (e.target.src !== DEFAULT_PLACEHOLDER_IMAGE) {
            console.warn(`Failed to load base image: ${imageUrl}, falling back to placeholder.`);
            e.target.src = DEFAULT_PLACEHOLDER_IMAGE;
        }
    };

    return (
        <Link to={`/entity/${slug}`} className="character-card" title={`View mods for ${name}`}>

             {/* Container for Badges (CSS will handle layout) */}
             <div className="card-badges-container">
                 {/* Total Mod Count Badge */}
                 {total_mods > 0 && (
                    <div className="card-badge total-badge" title={`${total_mods} total mods`}>
                        {total_mods} <i className="fas fa-box fa-fw" style={{ marginLeft: '3px', opacity: 0.8 }}></i>
                    </div>
                 )}
                  {/* Enabled Mod Count Badge */}
                 {enabled_mods > 0 && (
                     <div className="card-badge enabled-badge" title={`${enabled_mods} mods enabled`}>
                         {enabled_mods} <i className="fas fa-check-circle fa-fw" style={{ marginLeft: '3px' }}></i>
                     </div>
                 )}
            </div>

            {/* Card Image */}
            <div
                className="card-image"
                style={{ backgroundImage: `url('${imageUrl}')` }}
                // onError could potentially be added here if using <img> instead of background
            ></div>

            {/* Card Content */}
            <div className="card-content">
                <div className="card-name">{name}</div>
                 {element && elementIconClass && (
                    <div className="card-element" title={element}>
                       <i className={`${elementIconClass} fa-fw`} style={{ color: `var(--${element?.toLowerCase()})` || 'var(--light)' }}></i>
                       {element}
                    </div>
                 )}
                 {details?.rarity && (
                     <div className="card-element" style={{ marginTop: '5px', fontSize: '13px' }}>
                         <RarityIcon /> {details.rarity} Star{details.rarity !== 1 ? 's' : ''} {/* Added pluralization */}
                     </div>
                 )}
            </div>
        </Link>
    );
}

export default EntityCard;