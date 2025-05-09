import React from 'react';
import { useNavigate } from 'react-router-dom';

function PlaceholderPage({ title }) {
   const navigate = useNavigate();
   // Simple history back or fallback to home
   const goBack = () => (window.history.length > 2 ? navigate(-1) : navigate('/'));

  return (
    <div className="fadeIn">
      <div className="page-header">
        <h1 className="page-title">
             <i
                className="fas fa-arrow-left fa-fw"
                onClick={goBack}
                title="返回"
                style={{ cursor: 'pointer', marginRight: '15px' }}
                role="button"
                tabIndex={0}
                onKeyPress={(e) => e.key === 'Enter' && goBack()}
             ></i>
            {title}
        </h1>
         {/* Placeholder for Search bar on these pages too if needed */}
         <div className="search-bar-container" style={{ visibility:'hidden' }}> {/* Keep layout consistent but hide */}
              <div className="search-bar">
                 <i className="fas fa-search"></i>
                 <input type="text" placeholder={`搜索 ${title}...`} disabled/>
             </div>
         </div>
      </div>
      <p className="placeholder-text">该部分（{title}）正在开发中。</p>
      <p className="placeholder-text" style={{marginTop:'10px'}}>管理{title.toLowerCase()}模组的功能将在后续添加。</p>
    </div>
  );
}

export default PlaceholderPage;