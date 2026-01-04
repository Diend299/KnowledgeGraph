// frontend/src/App.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import Neo4jRenderer from './components/Neo4jRenderer';
import Home from './components/Home';
import Poems from './components/Poems';
import OntologyGallery from './components/OntologyGallery';
import './App.css';
import './components/styles.css';

const API_BASE_URL = process.env.NODE_ENV === 'development' 
    ? 'http://localhost:3001'  // 本地开发环境
    : window.location.origin;  // 生产环境（ngrok）

function App() {
    const [graphData, setGraphData] = useState(null);
    const [description, setDescription] = useState('No description available.');
    const [metadata, setMetadata] = useState({});
    const [activePage, setActivePage] = useState('home');
    const [searchTermState, setSearchTermState] = useState('');
    const [depthState, setDepthState] = useState(1);

    useEffect(() => {
        if (activePage === 'knowledgeGraph') {
            fetchGraphData();
        }
    }, [activePage]);

    const fetchGraphData = async (searchTerm = '') => {
        try {
            const response = await axios.get(`${API_BASE_URL}/knowledgeGraph?search=${searchTerm}`);
            setGraphData(response.data);
            setDescription(response.data.description || 'No description available.');
            setMetadata(response.data.metadata || {});
        } catch (error) {
            console.error('Error fetching data:', error);
        }
    };

    const fetchNodeCenteredGraph = async (nodeId, depth = 1) => {
        try {
            const response = await axios.get(`${API_BASE_URL}/knowledgeGraph/node/${nodeId}`, { params: { depth } });
            setGraphData(response.data);
            setDescription(response.data.description || 'No description available.');
            setMetadata(response.data.metadata || {});
        } catch (error) {
            console.error('Error fetching node centered data:', error);
        }
    };

    const handleSearch = (searchTerm, depth = 1) => {
        setSearchTermState(searchTerm);
        setDepthState(depth);

        // 如果用户输入的是纯数字 ID，则直接以节点中心视图打开
        if (/^\d+$/.test(String(searchTerm).trim())) {
            fetchNodeCenteredGraph(Number(searchTerm), depth);
            return;
        }

        fetchGraphData(searchTerm);
    };

    const handleNodeClick = (arg) => {
        // 如果前端传入的是 neo4j 内部 id（数字），则调用按节点 id 获取中心图谱的接口
        if (typeof arg === 'number' || (typeof arg === 'string' && /^\d+$/.test(arg))) {
            fetchNodeCenteredGraph(Number(arg), depthState);
        } else {
            // 否则当做搜索词处理（并保留当前深度选择）
            fetchGraphData(arg);
        }
    };

    const handleNavigation = (page) => {
        setActivePage(page);
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <div className="header-content">
                    <h1>岭南传统诗歌知识库</h1>
                    <nav className="main-nav">
                        <ul>
                            <li>
                                <a 
                                    href="#" 
                                    className={activePage === 'home' ? 'active' : ''} 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleNavigation('home');
                                    }}
                                >
                                    首页
                                </a>
                            </li>
                            <li>
                                <a 
                                    href="#" 
                                    className={activePage === 'poems' ? 'active' : ''} 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleNavigation('poems');
                                    }}
                                >
                                    诗词原文
                                </a>
                            </li>
                            <li>
                                <a 
                                    href="#" 
                                    className={activePage === 'ontology' ? 'active' : ''} 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleNavigation('ontology');
                                    }}
                                >
                                    AI对话
                                </a>
                            </li>
                            <li>
                                <a 
                                    href="#" 
                                    className={activePage === 'knowledgeGraph' ? 'active' : ''} 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleNavigation('knowledgeGraph');
                                    }}
                                >
                                    知识图谱
                                </a>
                            </li>
                        </ul>
                    </nav>
                </div>
            </header>
            <div className="main-content">
                {activePage === 'home' && <Home onNavigate={handleNavigation} />}
                {activePage === 'knowledgeGraph' && (
                    <div className="page-content">
                        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 12}}>
                            <SearchBar onSearch={handleSearch} defaultDepth={depthState} />
                            <div style={{minWidth: 220, maxWidth: 360}}>
                                <div style={{background: '#fff', padding: 10, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.06)'}}>
                                    <div style={{fontWeight: 'bold', marginBottom: 6}}>Description</div>
                                    <div style={{fontSize: 13, color: '#555', marginBottom: 8}}>{description}</div>
                                    <div style={{display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between'}}>
                                        <div style={{fontSize: 12, color: '#333'}}>
                                            <div><strong>nodeCount:</strong> {metadata.nodeCount || metadata.nodes || '-'}</div>
                                            <div><strong>linkCount:</strong> {metadata.linkCount || metadata.links || '-'}</div>
                                        </div>
                                        <div style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                                            <label style={{fontSize: 12, color: '#333'}}>深度</label>
                                            <select value={depthState} onChange={(e)=>setDepthState(Number(e.target.value))} style={{padding: '4px 6px'}}>
                                                <option value={1}>1</option>
                                                <option value={2}>2</option>
                                                <option value={3}>3</option>
                                                <option value={4}>4</option>
                                                <option value={5}>5</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="graph-layout" style={{display: 'flex', gap: '16px', alignItems: 'flex-start'}}>
                            <div style={{flex: 1}}>
                                <Neo4jRenderer 
                                    graphData={graphData} 
                                    onNodeClick={handleNodeClick}
                                    searchTerm={searchTermState}
                                />
                            </div>
                        </div>
                    </div>
                )}
                {activePage === 'poems' && (
                    <div className="page-content">
                        <Poems />
                    </div>
                )}
                {activePage === 'ontology' && (
                    <div className="page-content">
                        <OntologyGallery />
                    </div>
                )}
            </div>
            <footer className="app-footer">
                <p>Copyright © 中山大学信息管理学院</p>
            </footer>
        </div>
    );
}

export default App;