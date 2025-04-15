import React, { useEffect, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom';

const styles = {
    overlay: { // Invisible overlay to catch outside clicks
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'transparent', // Make it invisible
        zIndex: 1090, // Below menu, above other content
    },
    menu: {
        position: 'absolute',
        minWidth: '180px',
        backgroundColor: 'var(--dark)', // Use dark background
        borderRadius: '8px',
        boxShadow: '0 5px 15px rgba(0, 0, 0, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        padding: '6px 0',
        zIndex: 1100, // Ensure it's on top
        color: 'var(--light)',
        fontSize: '14px',
    },
    menuItem: {
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '8px 15px',
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
    },
    menuItemHover: { // Style for hover effect (can be done with :hover in CSS too)
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    menuItemDanger: {
        color: 'var(--danger)',
    },
    menuItemDangerHover: {
        backgroundColor: 'rgba(var(--danger-rgb), 0.15)',
        color: 'var(--danger)',
    },
    separator: {
        height: '1px',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        margin: '4px 0',
    },
    icon: {
        width: '16px',
        textAlign: 'center',
        opacity: 0.8,
    }
};

function ContextMenu({ isVisible, xPos, yPos, items = [], onClose }) {
    const menuRef = useRef(null);

    // Close menu on outside click
    const handleClickOutside = useCallback((event) => {
        // We check the overlay click instead of document to avoid closing immediately
        // if the click that opened it bubbles up.
        onClose();
    }, [onClose]);

    // Close menu on Escape key
    const handleKeyDown = useCallback((event) => {
        if (event.key === 'Escape') {
            onClose();
        }
    }, [onClose]);

    useEffect(() => {
        if (isVisible) {
            document.addEventListener('keydown', handleKeyDown);
            // Note: Click outside is handled by the overlay now
            return () => {
                document.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isVisible, handleKeyDown]);

    if (!isVisible) {
        return null;
    }

    // Basic boundary check (adjust position slightly if near edge)
    // A more robust solution would involve measuring menu size
    const adjustedX = window.innerWidth - xPos < 200 ? xPos - 180 : xPos + 5; // Simple flip if too close to right
    const adjustedY = window.innerHeight - yPos < 150 ? yPos - 100 : yPos + 5; // Simple adjust if too close to bottom

    return ReactDOM.createPortal(
        <>
            {/* Invisible overlay to handle clicks outside */}
            <div style={styles.overlay} onClick={handleClickOutside}></div>
            {/* Actual Menu */}
            <div
                ref={menuRef}
                style={{ ...styles.menu, top: `${adjustedY}px`, left: `${adjustedX}px` }}
                // Prevent closing when clicking inside the menu itself
                onClick={(e) => e.stopPropagation()}
                onContextMenu={(e) => e.preventDefault()} // Prevent nested context menus
            >
                {items.map((item, index) => (
                    item.separator ? (
                        <div key={`sep-${index}`} style={styles.separator}></div>
                    ) : (
                        <div
                            key={item.label || index}
                            style={{
                                ...styles.menuItem,
                                ...(item.danger ? styles.menuItemDanger : {})
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = item.danger ? styles.menuItemDangerHover.backgroundColor : styles.menuItemHover.backgroundColor}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                            onClick={() => {
                                item.onClick(); // Execute the action
                                // No need to call onClose here, overlay click will handle it
                            }}
                        >
                            {item.icon && <i className={`${item.icon} fa-fw`} style={styles.icon}></i>}
                            <span>{item.label}</span>
                        </div>
                    )
                ))}
            </div>
        </>,
        document.body // Render at the top level
    );
}

export default ContextMenu;