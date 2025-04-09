import React from 'react';

const styles = {
    card: {
        backgroundColor: 'var(--card-bg)', borderRadius: '12px', overflow: 'hidden',
        border: '1px solid rgba(255, 255, 255, 0.05)', display: 'flex', flexDirection: 'column',
        opacity: 0.7,
    },
    image: { height: '220px', width: '100%', marginBottom: '15px' },
    content: { padding: '0 15px 15px 15px', textAlign: 'center' },
    name: { height: '20px', width: '70%', margin: '0 auto 10px auto' },
    details: { height: '16px', width: '50%', margin: '0 auto' },
};

function EntityCardSkeleton() {
    return (
        <div style={styles.card}>
            <div className="skeleton-line" style={styles.image}></div>
            <div style={styles.content}>
                <div className="skeleton-line" style={styles.name}></div>
                <div className="skeleton-line" style={styles.details}></div>
            </div>
        </div>
    );
}
export default EntityCardSkeleton;