import React from 'react';
import { motion } from 'framer-motion';

const ModStatsDashboard = ({ 
  totalMods = 0, 
  enabledMods = 0, 
  recentlyAdded = 0, 
  favoriteCount = 0,
  typeBreakdown = [] // Array of {type, count} objects
}) => {
  // Calculate percentages
  const enabledPercentage = totalMods > 0 ? Math.round((enabledMods / totalMods) * 100) : 0;
  const disabledCount = totalMods - enabledMods;
  
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="mod-stats-dashboard"
      style={{
        background: 'rgba(30, 30, 40, 0.6)',
        backdropFilter: 'blur(10px)',
        borderRadius: '12px',
        padding: '20px',
        marginTop: '25px',
        marginBottom: '0',
        boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
        border: '1px solid rgba(255, 255, 255, 0.1)'
      }}
    >
      <h3 className="dashboard-title" style={{ 
        fontSize: '18px', 
        marginBottom: '20px',
        fontWeight: '600',
        color: 'rgba(255, 255, 255, 0.9)',
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
      }}>
        <i className="fas fa-chart-pie" style={{ color: 'var(--primary)' }}></i>
        Mod Statistics
      </h3>
      
      <div className="stats-grid" style={{ 
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '20px'
      }}>
        {/* Total Mods Card */}
        <StatCard 
          icon="fas fa-box-archive"
          iconColor="var(--primary)"
          title="Total Mods"
          value={totalMods}
          footer={`${recentlyAdded} added recently`}
        />
        
        {/* Enabled Status Card */}
        <StatCard 
          icon="fas fa-toggle-on"
          iconColor="#4ade80"
          title="Enabled"
          value={enabledMods}
          footer={`${enabledPercentage}% of total mods`}
        />
        
        {/* Disabled Status Card */}
        <StatCard 
          icon="fas fa-toggle-off"
          iconColor="#ff9800"
          title="Disabled"
          value={disabledCount}
          footer={`${100 - enabledPercentage}% of total mods`}
        />
      </div>
    </motion.div>
  );
};

// Helper function for type colors
const getTypeColor = (type) => {
  const typeColors = {
    'Appearance': '#8b5cf6',
    'Texture': '#3b82f6',
    'Animation': '#ec4899',
    'Effect': '#f59e0b',
    'Sound': '#10b981',
    'Model': '#6366f1',
    // Add more type colors as needed
  };
  
  return typeColors[type] || '#6b7280'; // Default gray
};

// Stat Card Component
const StatCard = ({ icon, iconColor, title, value, footer }) => {
  return (
    <motion.div 
      whileHover={{ scale: 1.03, transition: { duration: 0.2 } }}
      className="stat-card"
      style={{
        background: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        transition: 'all 0.3s ease',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <i className={icon} style={{ fontSize: '18px', color: iconColor }}></i>
        <span style={{ marginLeft: '10px', fontSize: '14px', color: 'rgba(255, 255, 255, 0.8)' }}>
          {title}
        </span>
      </div>
      
      <div style={{ 
        fontSize: '28px', 
        fontWeight: '700', 
        margin: '5px 0', 
        color: 'white' 
      }}>
        {value}
      </div>
      
      {footer && (
        <div style={{ 
          fontSize: '13px', 
          color: 'rgba(255, 255, 255, 0.6)', 
          marginTop: 'auto'
        }}>
          {footer}
        </div>
      )}
    </motion.div>
  );
};

// Type Chip Component
const TypeChip = ({ type, count, color }) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '8px 12px',
      backgroundColor: `${color}30`, // 30 is hex for 18% opacity
      borderLeft: `3px solid ${color}`,
      borderRadius: '6px',
      transition: 'all 0.2s ease'
    }}>
      <span style={{ 
        fontSize: '13px', 
        fontWeight: '500',
        color: 'rgba(255, 255, 255, 0.9)'
      }}>
        {type}
      </span>
      
      <span style={{ 
        fontSize: '13px', 
        fontWeight: '600',
        color: color,
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        borderRadius: '4px',
        padding: '1px 6px',
      }}>
        {count}
      </span>
    </div>
  );
};

export default ModStatsDashboard;