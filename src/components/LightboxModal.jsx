import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { X } from 'lucide-react';
import '../styles/LightboxModal.css';

function LightboxModal({ imageUrl, isOpen, onClose }) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setTimeout(() => setIsAnimating(true), 10);
    } else {
      setIsAnimating(false);
      const timer = setTimeout(() => setIsVisible(false), 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);
  
  if (!isVisible || !imageUrl) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return ReactDOM.createPortal(
    <div 
      className={`lightbox-backdrop ${isAnimating ? 'active' : ''}`} 
      onClick={handleBackdropClick}
    >
      <div className={`lightbox-content ${isAnimating ? 'active' : ''}`}>
        <button 
          className="lightbox-close" 
          onClick={onClose} 
          aria-label="Close"
        >
          <span className="close-icon">
            <X size={20} />
          </span>
          <span className="close-text">Close</span>
        </button>
        <div className="lightbox-image-container">
          <img 
            src={imageUrl} 
            alt="Enlarged preview" 
            className={`lightbox-image ${isAnimating ? 'active' : ''}`} 
          />
        </div>
        
        <div className="lightbox-controls">
          <div className="lightbox-counter">
            {/* Optional: Add image counter here if you have multiple images */}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default LightboxModal;