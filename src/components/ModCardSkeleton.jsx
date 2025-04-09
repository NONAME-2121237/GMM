import React from 'react';

const styles = {
    // Grid Style
    gridCard: {
        backgroundColor: 'var(--card-bg)', borderRadius: '12px', padding: '20px',
        border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column',
        opacity: 0.7, gap: '10px'
    },
    gridImage: { height: '120px', width: '100%', borderRadius: '6px', marginBottom:'5px' },
    gridHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    gridTitle: { height: '20px', width: '60%' },
    gridToggle: { height: '24px', width: '46px', borderRadius: '24px' },
    gridDesc: { height: '16px', width: '100%', marginTop: '5px' },
    gridDesc2: { height: '16px', width: '80%', marginTop: '5px' },
    gridFooter: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' },
    gridAuthor: { height: '14px', width: '40%' },
    gridKeybind: { height: '24px', width: '24px', borderRadius: '4px' },
    // List Style
    listCard: {
        display: 'flex', alignItems: 'center', gap: '15px', padding: '10px 15px',
        background: 'var(--card-bg)', borderRadius: '8px',
        border: '1px solid rgba(255, 255, 255, 0.1)', width: '100%', minHeight: '50px',
        opacity: 0.7,
    },
    listToggle: { height: '24px', width: '46px', borderRadius: '24px', flexShrink: 0, marginRight:'5px' },
    listName: { height: '18px', flexGrow: 1, marginRight:'10px' },
    listAuthor: { height: '14px', width: '120px', flexShrink: 0, marginRight:'10px' },
    listActions: { display: 'flex', gap: '5px', flexShrink: 0 },
    listActionBtn: { height: '24px', width: '24px', borderRadius: '4px' },
};

function ModCardSkeleton({ viewMode = 'grid' }) {
    if (viewMode === 'list') {
        return (
            <div style={styles.listCard}>
                <div className="skeleton-line" style={styles.listToggle}></div>
                <div className="skeleton-line" style={styles.listName}></div>
                <div className="skeleton-line" style={styles.listAuthor}></div>
                <div style={styles.listActions}>
                    <div className="skeleton-line" style={styles.listActionBtn}></div>
                    <div className="skeleton-line" style={styles.listActionBtn}></div>
                    <div className="skeleton-line" style={styles.listActionBtn}></div>
                </div>
            </div>
        );
    }

    // Grid View
    return (
        <div style={styles.gridCard}>
            <div className="skeleton-line" style={styles.gridImage}></div>
            <div style={styles.gridHeader}>
                <div className="skeleton-line" style={styles.gridTitle}></div>
                <div className="skeleton-line" style={styles.gridToggle}></div>
            </div>
            <div className="skeleton-line" style={styles.gridDesc}></div>
            <div className="skeleton-line" style={styles.gridDesc2}></div>
            <div style={styles.gridFooter}>
                <div className="skeleton-line" style={styles.gridAuthor}></div>
                <div className="skeleton-line" style={styles.gridKeybind}></div>
            </div>
        </div>
    );
}
export default ModCardSkeleton;