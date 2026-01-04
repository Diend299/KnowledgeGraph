import React from 'react';
import './Home.css';

function Home({ onNavigate }) {
    return (
        <div className="home-container">
            <div className="home-content">
                <h1>岭南传统诗歌知识库</h1>
                <p>探索岭南地区丰富的诗歌文化遗产</p>
                <div className="feature-grid">
                    <div className="feature-item" onClick={() => onNavigate && onNavigate('poems')} role="button" tabIndex={0}>
                        <h3>诗词原文</h3>
                        <p>浏览完整的诗词作品</p>
                    </div>
                    <div className="feature-item" onClick={() => onNavigate && onNavigate('ontology')} role="button" tabIndex={0}>
                        <h3>AI对话</h3>
                        <p>和AI一起探索岭南诗歌</p>
                    </div>
                    <div className="feature-item" onClick={() => onNavigate && onNavigate('knowledgeGraph')} role="button" tabIndex={0}>
                        <h3>知识图谱</h3>
                        <p>探索诗歌知识关联</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home; 