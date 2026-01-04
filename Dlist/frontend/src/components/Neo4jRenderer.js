import React from 'react';
import KnowledgeGraph from './KnowledgeGraph';

// 简单的渲染器工厂：根据 REACT_APP_GRAPH_RENDERER 环境变量选择渲染组件
const renderer = process.env.REACT_APP_GRAPH_RENDERER || 'force';

function NeovisPlaceholder({ graphData, onNodeClick }) {
    // 占位组件，当需要集成 neovis.js 时可以在这里扩展
    return (
        <div style={{width: '100%'}}>
            <div style={{marginBottom: 12, color: '#444'}}>
                当前渲染器: <strong>{renderer}</strong>。若选择 <code>neovis</code>，请按照 README 配置后端 proxy 或在此处集成 neovis.js。
            </div>
            {/* 作为回退，仍然渲染默认力导向图，以保证功能可用 */}
            <KnowledgeGraph graphData={graphData} onNodeClick={onNodeClick} />
        </div>
    );
}

export default function Neo4jRenderer(props) {
    if (renderer === 'force') {
        return <KnowledgeGraph {...props} />;
    }

    // 其他渲染器（如 neovis）可以在这里扩展实现
    return <NeovisPlaceholder {...props} />;
}
