// --- START OF FILE src/components/ConfirmationModal.jsx ---
import React from 'react';

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 1050, // Higher z-index than other modals
        backdropFilter: 'blur(5px)',
    },
    modal: {
        background: 'var(--dark)', padding: '30px 40px', borderRadius: '12px',
        boxShadow: '0 5px 25px rgba(0, 0, 0, 0.4)', color: 'var(--light)',
        minWidth: '350px', maxWidth: '500px', textAlign: 'center',
    },
    title: {
        fontSize: '20px', fontWeight: '600', marginBottom: '15px',
        color: 'var(--light)', // Default title color
    },
    message: {
        fontSize: '15px', color: 'rgba(255, 255, 255, 0.8)',
        lineHeight: '1.6', marginBottom: '25px',
    },
    buttonGroup: {
        display: 'flex', justifyContent: 'center', gap: '15px',
        marginTop: '20px',
    },
    errorText: {
        color: 'var(--danger)', marginTop: '15px', marginBottom: '0px', fontSize: '14px', fontWeight: '500',
    }
};

function ConfirmationModal({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Action",
    children, // Message content
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmButtonVariant = "primary", // 'primary' or 'danger'
    isLoading = false,
    errorMessage = '',
}) {
    if (!isOpen) {
        return null;
    }

    const confirmButtonClass = confirmButtonVariant === 'danger' ? 'btn-danger' : 'btn-primary';
    const titleColor = confirmButtonVariant === 'danger' ? 'var(--danger)' : 'var(--primary)';

    return (
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h2 style={{ ...styles.title, color: titleColor }}>{title}</h2>
                <div style={styles.message}>
                    {children}
                </div>

                {errorMessage && <p style={styles.errorText}>{errorMessage}</p>}

                <div style={styles.buttonGroup}>
                    <button className="btn btn-outline" onClick={onClose} disabled={isLoading}>
                        {cancelText}
                    </button>
                    <button
                        // Dynamically apply btn-primary or btn-danger (needs corresponding CSS)
                        // For now, just using inline style for color
                        className={`btn ${confirmButtonClass}`} // Assuming you add .btn-danger style
                        onClick={onConfirm}
                        disabled={isLoading}
                        style={confirmButtonVariant === 'danger' ? { backgroundColor: 'var(--danger)', color: 'white' } : {}}
                    >
                        {isLoading ? (
                            <><i className="fas fa-spinner fa-spin fa-fw"></i> Processing...</>
                        ) : (
                            confirmText
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Add basic btn-danger style to main.css if needed:
/*
.btn-danger {
    background-color: var(--danger);
    color: white;
}
.btn-danger:hover {
    background-color: #cc5656; // Darker red
    box-shadow: 0 5px 15px rgba(255, 107, 107, 0.4);
}
*/


export default ConfirmationModal;