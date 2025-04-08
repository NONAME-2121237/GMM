import React from 'react';
import ReactDOM from 'react-dom';
import { invoke } from '@tauri-apps/api/tauri';

const styles = {
    overlay: {
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)', display: 'flex',
        justifyContent: 'center', alignItems: 'center', zIndex: 1050, // Ensure it's above other modals if needed
        backdropFilter: 'blur(5px)',
    },
    modal: {
        background: 'var(--dark)', padding: '30px 40px', borderRadius: '12px',
        boxShadow: '0 5px 25px rgba(0, 0, 0, 0.4)', color: 'var(--light)',
        minWidth: '350px', maxWidth: '500px', textAlign: 'center',
        maxHeight: '70vh', display: 'flex', flexDirection: 'column',
    },
    title: {
        fontSize: '20px', fontWeight: '600', marginBottom: '10px',
        color: 'var(--primary)',
    },
    subtitle: {
        fontSize: '13px', color: 'rgba(255, 255, 255, 0.6)', marginBottom: '20px',
        borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px',
    },
    content: {
        overflowY: 'auto', paddingRight: '10px', marginBottom: '20px', flexGrow: 1,
    },
    keybindList: {
        listStyle: 'none', padding: 0, margin: 0, textAlign: 'left',
    },
    keybindItem: {
        background: 'rgba(0,0,0,0.15)', padding: '10px 15px', // Increased padding
        borderRadius: '6px', marginBottom: '10px', // Increased margin
    },
    keybindTitle: { // New style for the title
        display: 'block', // Make title take full width
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginBottom: '5px', // Space between title and key
        fontWeight: '500',
    },
    keybindKey: { // Renamed from keyText for clarity
        fontFamily: "'Consolas', 'Monaco', monospace",
        fontWeight: 'bold',
        color: 'var(--accent)',
        fontSize: '14px', // Slightly larger key text
        wordBreak: 'break-all', // Allow long keys to wrap
    },
    // --- End updated styles ---
    buttonGroup: {
        display: 'flex', justifyContent: 'space-between', gap: '15px',
        marginTop: 'auto', paddingTop: '15px',
        borderTop: '1px solid rgba(255, 255, 255, 0.1)', flexShrink: 0,
    },
    errorText: {
        color: 'var(--danger)', marginTop: '15px', fontSize: '14px',
    },
    placeholderText: {
        color: 'rgba(255, 255, 255, 0.5)', fontStyle: 'italic',
    }
};

function KeybindsPopup({
    isOpen,
    onClose,
    assetId,
    assetName,
    keybinds,
    isLoading,
    error,
}) {
    if (!isOpen) {
        return null;
    }

    const handleOpenFolder = async () => {
        try {
            await invoke('open_asset_folder', { assetId });
            // Keep popup open after opening folder
        } catch (err) {
            console.error("Failed to open asset folder:", err);
            alert(`Error opening folder: ${err}`); // Simple feedback
        }
    };

    return ReactDOM.createPortal(
        <div style={styles.overlay} onClick={onClose}>
            <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
                <h2 style={styles.title}>Keybinds</h2>
                <p style={styles.subtitle}>{assetName}</p>

                <div style={styles.content}>
                    {isLoading && <p style={styles.placeholderText}><i className="fas fa-spinner fa-spin fa-fw"></i> Loading...</p>}
                    {error && <p style={styles.errorText}>{error}</p>}
                    {!isLoading && !error && (
                        keybinds.length > 0 ? (
                            <ul style={styles.keybindList}>
                                {keybinds.map((bindInfo, index) => (
                                    <li key={index} style={styles.keybindItem}>
                                        <span style={styles.keybindTitle}>{bindInfo.title}</span>
                                        <span style={styles.keybindKey}>{bindInfo.key}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p style={styles.placeholderText}>No keybinds found in the INI file(s).</p>
                        )
                    )}
                </div>

                <div style={styles.buttonGroup}>
                     <button className="btn btn-outline" onClick={handleOpenFolder} disabled={isLoading}>
                         <i className="fas fa-folder-open fa-fw"></i> Open Mod Folder
                     </button>
                     <button className="btn btn-primary" onClick={onClose}>
                         Close
                     </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default KeybindsPopup;