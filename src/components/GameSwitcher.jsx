// src/components/GameSwitcher.jsx
import React from 'react';
import { ask } from '@tauri-apps/api/dialog';

function GameSwitcher({ 
  availableGames, 
  activeGame, 
  onGameSwitch, 
  isLoading, 
  error,
  compact = false, // Compact mode for smaller spaces
  confirmMessage = "Switching the game requires an application restart (the app will close on confirmation).", // Customizable message
  isSetupMode = false // Different behavior for setup mode
}) {
  
  // Handle the logo click and confirmation
  const handleLogoClick = async (gameSlug) => {
    // Don't do anything if clicking the active game or if already switching
    if (gameSlug === activeGame || isLoading) return;
    
    const dialogTitle = isSetupMode ? "Confirm Game Change" : "Confirm Game Switch";
    const okLabel = isSetupMode ? "Change Game & Close" : "Switch and Close";
    const fullMessage = `${confirmMessage}\n\nSwitch to "${gameSlug.toUpperCase()}"?`;
    
    const confirmation = await ask(
      fullMessage,
      { title: dialogTitle, type: 'warning', okLabel, cancelLabel: 'Cancel' }
    );
    
    if (!confirmation) return;
    
    // Call the provided callback function
    onGameSwitch(gameSlug);
  };
  
  // Handle image loading errors
  const handleLogoError = (e) => {
    e.target.src = '/images/logos/default.png';
  };
  
  // Determine grid columns based on number of games
  const gridColumns = Math.min(availableGames.length, 4);
  const gridStyle = {
    gridTemplateColumns: compact 
      ? `repeat(auto-fit, minmax(80px, 1fr))` 
      : `repeat(${gridColumns}, 1fr)`
  };

  return (
    <div className="game-switcher-container">
      {availableGames.length === 0 ? (
        <div className="game-switcher-loading">
          <i className="fas fa-spinner fa-spin fa-fw"></i> Loading games...
        </div>
      ) : (
        <div className="game-switcher-grid" style={gridStyle}>
          {availableGames.map(gameSlug => (
            <div 
              key={gameSlug} 
              className={`game-logo-item ${gameSlug === activeGame ? 'active' : ''} ${isLoading ? 'disabled' : ''}`}
              onClick={() => handleLogoClick(gameSlug)}
              title={`Switch to ${gameSlug.toUpperCase()}`}
            >
              <div className="logo-wrapper">
                <img 
                  src={`/images/logos/${gameSlug}.png`} 
                  alt={gameSlug.toUpperCase()}
                  onError={handleLogoError}
                  className="game-logo-image"
                />
                {gameSlug === activeGame && <div className="active-indicator"></div>}
              </div>
              <span className="game-name">{gameSlug.toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}
      
      {error && <p className="game-switcher-error">{error}</p>}
      {isLoading && (
        <div className="game-switcher-loading-overlay">
          <i className="fas fa-spinner fa-spin fa-fw"></i> Switching...
        </div>
      )}
      
      <style jsx>{`
        .game-switcher-container {
          position: relative;
          width: 100%;
          overflow: hidden;
        }
        
        .game-switcher-grid {
          display: grid;
          gap: ${compact ? '10px' : '15px'};
          width: 100%;
        }
        
        .game-logo-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          cursor: pointer;
          transition: all 0.3s ease;
          border-radius: 12px;
          padding: ${compact ? '8px' : '12px'};
          background-color: rgba(0, 0, 0, 0.2);
          border: 2px solid transparent;
        }
        
        .game-logo-item:hover {
          transform: translateY(-4px);
          box-shadow: 0 6px 12px rgba(0, 0, 0, 0.2);
          background-color: rgba(0, 0, 0, 0.3);
        }
        
        .game-logo-item:active {
          transform: translateY(0px) scale(0.98);
        }
        
        .game-logo-item.active {
          border-color: var(--primary);
          background-color: rgba(var(--primary-rgb), 0.1);
        }
        
        .game-logo-item.disabled {
          pointer-events: none;
          opacity: 0.7;
        }
        
        .logo-wrapper {
          position: relative;
          width: ${compact ? '50px' : '70px'};
          height: ${compact ? '50px' : '70px'};
          margin-bottom: 8px;
          border-radius: 8px;
          overflow: hidden;
          background-color: rgba(255, 255, 255, 0.05);
        }
        
        .game-logo-image {
          width: 100%;
          height: 100%;
          object-fit: contain;
          transition: transform 0.3s ease;
        }
        
        .game-logo-item:hover .game-logo-image {
          transform: scale(1.1);
        }
        
        .active-indicator {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 4px;
          background: linear-gradient(90deg, var(--primary), var(--accent));
          animation: pulse 2s infinite;
        }
        
        .game-name {
          font-size: ${compact ? '12px' : '14px'};
          font-weight: 500;
          text-align: center;
          margin-top: 4px;
        }
        
        .game-switcher-error {
          color: var(--danger);
          margin-top: 10px;
          font-size: 12px;
          text-align: center;
        }
        
        .game-switcher-loading, .game-switcher-loading-overlay {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 14px;
          color: var(--light);
        }
        
        .game-switcher-loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background-color: rgba(0, 0, 0, 0.5);
          border-radius: 8px;
          backdrop-filter: blur(2px);
          z-index: 10;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default GameSwitcher;