// Enhanced Library Stats Component
import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

// Component for animated counter
const AnimatedCounter = ({ value, duration = 1000, prefix = '', suffix = '' }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    let start = 0;
    const end = parseInt(value);
    if (start === end) return;
    
    const incrementTime = (duration / end) * 1.1;
    const timer = setInterval(() => {
      start += 1;
      setCount(start);
      if (start >= end) clearInterval(timer);
    }, incrementTime);
    
    return () => clearInterval(timer);
  }, [value, duration]);
  
  return (
    <span className="animated-counter">
      {prefix}{count}{suffix}
    </span>
  );
};

// Main component for enhanced stats display
const EnhancedLibraryStats = ({ stats, loading, error }) => {
  // For category chart data
  const getCategoryData = () => {
    if (!stats || !stats.category_counts) return [];
    
    return Object.entries(stats.category_counts)
      .sort(([, countA], [, countB]) => countB - countA)
      .slice(0, 5) // Limit to top 5 categories
      .map(([name, count]) => ({
        name: name.length > 15 ? name.substring(0, 12) + '...' : name,
        value: count,
        fullName: name // Store full name for tooltip
      }));
  };
  
  // For pie chart data
  const getPieData = () => {
    if (!stats) return [];
    return [
      { name: '已启用', value: stats.enabled_mods },
      { name: '已禁用', value: stats.disabled_mods }
    ];
  };
  
  const COLORS = ['#4ade80', '#64748b']; // Success green, muted gray
  const CATEGORY_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6'];
  
  if (loading) {
    return <div className="stats-loading-placeholder">
      <div className="skeleton-line"></div>
      <div className="skeleton-circle"></div>
      <div className="skeleton-line" style={{ width: '70%' }}></div>
      <div className="skeleton-line" style={{ width: '60%' }}></div>
    </div>;
  }
  
  if (error) {
    return <div className="stats-error">
      <i className="fas fa-exclamation-circle" style={{ fontSize: '24px', marginBottom: '10px' }}></i>
      <p>{error}</p>
    </div>;
  }
  
  if (!stats) return null;
  
  const pieData = getPieData();
  const categoryData = getCategoryData();
  
  return (
    <div className="enhanced-stats-container">
      {/* Stats Overview */}
      <div className="stats-overview">
        <div className="stat-card total-mods">
          <i className="fas fa-cubes stat-icon"></i>
          <div className="stat-info">
            <span className="stat-label">模组总数</span>
            <span className="stat-value"><AnimatedCounter value={stats.total_mods} /></span>
          </div>
        </div>
        
        <div className="stats-row">
          <div className="stat-card enabled">
            <i className="fas fa-check-circle stat-icon"></i>
            <div className="stat-info">
              <span className="stat-label">已启用</span>
              <span className="stat-value"><AnimatedCounter value={stats.enabled_mods} /></span>
            </div>
          </div>
          
          <div className="stat-card disabled">
            <i className="fas fa-times-circle stat-icon"></i>
            <div className="stat-info">
              <span className="stat-label">已禁用</span>
              <span className="stat-value"><AnimatedCounter value={stats.disabled_mods} /></span>
            </div>
          </div>
        </div>
        
        {stats.uncategorized_mods > 0 && (
          <div className="stat-card uncategorized">
            <i className="fas fa-exclamation-triangle stat-icon"></i>
            <div className="stat-info">
              <span className="stat-label">未分类</span>
              <span className="stat-value"><AnimatedCounter value={stats.uncategorized_mods} /></span>
            </div>
          </div>
        )}
      </div>
      
      {/* Charts Section */}
      <div className="stats-charts">
        {/* Enabled/Disabled Pie Chart */}
        <div className="chart-container pie-chart">
          <h4 className="chart-title">启用 vs 禁用</h4>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
                animationDuration={800}
                animationBegin={300}
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value, name) => [`${value} 模组`, name]}
                contentStyle={{ 
                  background: 'rgba(30, 41, 59, 0.9)', 
                  border: 'none', 
                  borderRadius: '4px',
                  color: 'white'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            {pieData.map((entry, index) => (
              <div key={`legend-${index}`} className="legend-item">
                <div className="legend-color" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                <span>{entry.name}: {entry.value}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Category Bar Chart */}
        {categoryData.length > 0 && (
          <div className="chart-container category-chart">
            <h4 className="chart-title">热门分类</h4>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 10 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={100} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name, props) => [`${value} mods`, props.payload.fullName]}
                  contentStyle={{ 
                    background: 'rgba(30, 41, 59, 0.9)', 
                    border: 'none', 
                    borderRadius: '4px',
                    color: 'white'
                  }}
                />
                <Bar 
                  dataKey="value" 
                  animationDuration={1200}
                  animationBegin={500}
                  radius={[0, 4, 4, 0]}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedLibraryStats;