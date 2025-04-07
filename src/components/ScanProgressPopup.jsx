// src/components/ScanProgressPopup.jsx
import React from 'react';

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000, // Ensure it's on top
        backdropFilter: 'blur(5px)',
    },
    popup: {
        background: 'var(--dark)',
        padding: '30px 40px',
        borderRadius: '12px',
        boxShadow: '0 5px 25px rgba(0, 0, 0, 0.4)',
        color: 'var(--light)',
        minWidth: '400px',
        maxWidth: '600px',
        textAlign: 'center',
    },
    title: {
        fontSize: '20px',
        fontWeight: '600',
        marginBottom: '20px',
        color: 'var(--primary)',
    },
    progressBarContainer: {
        height: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        borderRadius: '6px',
        overflow: 'hidden',
        marginBottom: '10px',
    },
    progressBar: {
        height: '100%',
        backgroundColor: 'var(--success)',
        width: '0%', // Default width
        borderRadius: '6px',
        transition: 'width 0.2s ease-out',
    },
    statusText: {
        fontSize: '14px',
        color: 'rgba(255, 255, 255, 0.8)',
        marginBottom: '5px',
        minHeight: '20px', // Prevent layout shift
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
    },
     pathText: {
        fontSize: '12px',
        color: 'rgba(255, 255, 255, 0.6)',
        minHeight: '18px', // Prevent layout shift
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
     },
    countsText: {
        fontSize: '13px',
        color: 'rgba(255, 255, 255, 0.7)',
        marginTop: '10px',
    },
    closeButton: {
        marginTop: '25px',
        padding: '8px 20px',
    },
    errorText: {
        color: 'var(--danger)',
        fontWeight: '500',
        marginTop: '15px',
    }
};

function ScanProgressPopup({ progress, status, error, summary, onClose }) {
    if (!progress && !status && !error && !summary) {
        return null; // Don't render if no data (initially hidden)
    }

    const percentage = progress?.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;
    const isComplete = !!summary || !!error;

    return (
        <div style={styles.overlay}>
            <div style={styles.popup}>
                <h2 style={styles.title}>{error ? "Scan Error" : (summary ? "Scan Complete" : "Scanning Mods Folder...")}</h2>

                {error ? (
                     <p style={styles.errorText}>{error}</p>
                 ) : summary ? (
                     <p style={styles.statusText}>{summary}</p>
                 ) : (
                    <>
                        <div style={styles.progressBarContainer}>
                            <div
                                style={{
                                    ...styles.progressBar,
                                    width: `${percentage}%`,
                                    backgroundColor: 'var(--success)'
                                }}
                                role="progressbar"
                                aria-valuenow={percentage}
                                aria-valuemin="0"
                                aria-valuemax="100"
                            />
                        </div>
                         <p style={styles.statusText}>{status || 'Initializing...'}</p>
                         <p style={styles.pathText} title={progress?.current_path || ''}>
                             {progress?.current_path ? `...${progress.current_path.slice(-60)}` : <> </>}
                         </p>
                         <p style={styles.countsText}>
                             {progress ? `${progress.processed} / ${progress.total}` : '0 / 0'}
                         </p>
                     </>
                 )}

                {/* Show close button only on completion or error */}
                {isComplete && (
                    <button className="btn btn-primary" onClick={onClose} style={styles.closeButton}>
                        Close
                    </button>
                )}
            </div>
        </div>
    );
}

export default ScanProgressPopup;