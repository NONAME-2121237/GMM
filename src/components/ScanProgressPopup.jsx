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
        zIndex: 1050, // Ensure it's on top
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
    pathText: { // Specific to scan, might be hidden for apply
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
        whiteSpace: 'pre-wrap', // Allow error newlines
        textAlign: 'left',
        maxHeight: '150px', // Limit error display height
        overflowY: 'auto',
        background: 'rgba(255,0,0,0.05)',
        padding: '10px',
        borderRadius: '4px',
    }
};

function ScanProgressPopup({
    isOpen, // Control visibility from parent
    progressData, // Object like { processed, total, message, current_path? }
    summary,
    error,
    onClose,
    baseTitle = "处理中..." // 基础标题
}) {
    if (!isOpen) {
        return null;
    }

    const percentage = progressData?.total > 0 ? Math.round((progressData.processed / progressData.total) * 100) : 0;
    const isComplete = !!summary || !!error;
    const displayTitle = error ? "错误" : (summary ? "完成" : baseTitle);
    const statusMessage = progressData?.message || (isComplete ? '' : '初始化中...');
    const countsText = progressData ? `${progressData.processed} / ${progressData.total}` : '';
    const pathText = progressData?.current_path ? `...${progressData.current_path.slice(-60)}` : <>​</>; // Use zero-width space for spacing

    return (
        <div style={styles.overlay} onClick={onClose}> {/* Allow closing by clicking overlay */}
            <div style={styles.popup} onClick={(e) => e.stopPropagation()}> {/* Prevent closing when clicking popup itself */}
                <h2 style={styles.title}>{displayTitle}</h2>

                {error ? (
                    // Display error details if available
                     <p style={styles.errorText}>{error}</p>
                 ) : summary ? (
                    // Display summary message on completion
                     <p style={styles.statusText}>{summary}</p>
                 ) : (
                    // Display progress bar and status while running
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
                         <p style={styles.statusText} title={statusMessage}>{statusMessage}</p>
                         {/* Only show path text if present in progressData (useful for scan) */}
                         {progressData?.current_path &&
                            <p style={styles.pathText} title={progressData.current_path}>
                                {pathText}
                            </p>
                         }
                         <p style={styles.countsText}>{countsText}</p>
                     </>
                 )}

                {/* Show close button only on completion or error */}
                {isComplete && (
                    <button className="btn btn-primary" onClick={onClose} style={styles.closeButton}>
                        关闭
                    </button>
                )}
            </div>
        </div>
    );
}

export default ScanProgressPopup;