// frontend/src/components/KnowledgeGraph.js
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { forceCollide, forceManyBody, forceLink } from 'd3-force';
import ForceGraph2D from 'react-force-graph-2d';

function KnowledgeGraph({ graphData, onNodeClick }) {
    const [nodeLimit, setNodeLimit] = useState(50);
    const [showAllNodes, setShowAllNodes] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [centerNode, setCenterNode] = useState(null);
    const [useDegreeScaling, setUseDegreeScaling] = useState(false);
    const [showAllLabels, setShowAllLabels] = useState(false);

    // 预定义的颜色列表
    const colorList = [
        '#ff7f0e', // 橙色
        '#1f77b4', // 蓝色
        '#2ca02c', // 绿色
        '#d62728', // 红色
        '#9467bd', // 紫色
        '#8c564b', // 棕色
        '#e377c2', // 粉色
        '#7f7f7f', // 灰色
        '#bcbd22', // 黄绿色
        '#17becf'  // 青色
    ];

    // 动态生成节点类型和颜色的映射
    const nodeColors = useMemo(() => {
        if (!graphData) return { 'unknown': '#7f7f7f' };

        const types = new Set();
        graphData.nodes.forEach(node => {
            if (node.type) types.add(node.type);
        });

        const colorMap = {};
        Array.from(types).forEach((type, index) => {
            colorMap[type] = colorList[index % colorList.length];
        });
        colorMap['unknown'] = '#7f7f7f';

        return colorMap;
    }, [graphData]);

    // 计算每个节点的度（用于决定大小）
    const degreeMap = useMemo(() => {
        const map = {};
        if (!graphData) return map;
        graphData.links.forEach(link => {
            map[link.source] = (map[link.source] || 0) + 1;
            map[link.target] = (map[link.target] || 0) + 1;
        });
        return map;
    }, [graphData]);

    const fgRef = useRef();

    // 处理节点数量限制
    const limitedGraphData = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };
        if (showAllNodes) return graphData;
        
        const limitedNodes = graphData.nodes.slice(0, nodeLimit);
        const limitedLinks = graphData.links.filter(link => 
            limitedNodes.some(node => node.id === link.source) &&
            limitedNodes.some(node => node.id === link.target)
        );

        return {
            nodes: limitedNodes,
            links: limitedLinks
        };
    }, [graphData, nodeLimit, showAllNodes]);

    // 获取相连节点
    const getConnectedNodes = (nodeId) => {
        if (!graphData) return [];
        return graphData.links
            .filter(link => link.source === nodeId || link.target === nodeId)
            .map(link => {
                const connectedId = link.source === nodeId ? link.target : link.source;
                return {
                    node: graphData.nodes.find(n => n.id === connectedId),
                    relation: link.type
                };
            });
    };

    // 获取节点与中心节点的关系
    const getNodeRelationToCenter = (nodeId) => {
        if (!graphData || !centerNode) return null;
        
        // 查找所有与中心节点相关的关系
        const relations = graphData.links.filter(link => 
            (link.source === nodeId && link.target === centerNode.id) || 
            (link.source === centerNode.id && link.target === nodeId)
        );
        
        if (relations.length === 0) return null;
        
        // 返回所有关系的描述
        return relations.map(relation => {
            const direction = relation.source === nodeId ? '被' : '';
            return `${direction}${relation.type}`;
        }).join('、');
    };

    const handleNodeClick = (node) => {
        setSelectedNode(node);
        setCenterNode(node);
        if (onNodeClick) {
            // 优先使用 neo4j 内部 id 调用以节点为中心的接口；若不存在则使用标签作为搜索词
            const arg = (node && node.neo4jId !== undefined && node.neo4jId !== null) ? node.neo4jId : node.label;
            onNodeClick(arg);
        }
    };

    // 当 centerNode 变化时，让画布聚焦到该节点（如果模拟已经更新了坐标）
    useEffect(() => {
        if (!centerNode || !fgRef.current) return;
        // 有时节点坐标未立刻可用，延迟执行
        setTimeout(() => {
            try {
                if (centerNode.x !== undefined && centerNode.y !== undefined) {
                    fgRef.current.centerAt(centerNode.x, centerNode.y, 400);
                    fgRef.current.zoom(1.4);
                } else {
                    // 退化为 fit
                    fgRef.current.zoomToFit(400);
                }
            } catch (e) {
                // 忽略错误
            }
        }, 150);
    }, [centerNode]);

    // 配置力导向布局（碰撞、斥力、连边长度），当数据或缩放策略改变时更新
    useEffect(() => {
        if (!fgRef.current) return;

        // 基本参数
        const charge = -120; // 节点间斥力
        const linkDist = 60; // 基础连边长度
        const collideRadius = (d) => {
            const base = 8;
            const deg = degreeMap[d.id] || 0;
            return useDegreeScaling ? base + deg * 2 : base + 2;
        };

        try {
            fgRef.current.d3Force('charge', forceManyBody().strength(charge));
            fgRef.current.d3Force('link', forceLink().id(d => d.id).distance(() => linkDist));
            fgRef.current.d3Force('collide', forceCollide().radius(collideRadius).strength(0.9));
        } catch (e) {
            // 如果 d3-force 未正确加载，忽略
            console.warn('Failed to set d3 forces', e);
        }
    }, [limitedGraphData, useDegreeScaling, degreeMap]);

    if (!graphData) {
        return <p>正在加载图谱数据...</p>;
    }

    return (
        <div className="graph-container">
            <div className="graph-controls">
                <div className="node-count">
                    显示节点: {limitedGraphData.nodes.length} / {graphData.nodes.length}
                </div>
                <div className="node-limit-control">
                    <input
                        type="range"
                        min="10"
                        max={graphData.nodes.length}
                        value={nodeLimit}
                        onChange={(e) => setNodeLimit(Number(e.target.value))}
                    />
                    <span>{nodeLimit} 个节点</span>
                    <button 
                        onClick={() => setShowAllNodes(!showAllNodes)}
                        className="toggle-button"
                    >
                        {showAllNodes ? '限制节点数量' : '显示所有节点'}
                    </button>
                    <label style={{marginLeft:12, display:'flex', alignItems:'center', gap:8}}>
                        <input type="checkbox" checked={useDegreeScaling} onChange={(e)=>setUseDegreeScaling(e.target.checked)} />
                        <span>按度数缩放节点</span>
                    </label>
                    <label style={{marginLeft:12, display:'flex', alignItems:'center', gap:8}}>
                        <input type="checkbox" checked={showAllLabels} onChange={(e)=>setShowAllLabels(e.target.checked)} />
                        <span>显示所有标签</span>
                    </label>
                </div>
            </div>
            <ForceGraph2D
                ref={fgRef}
                graphData={limitedGraphData}
                nodeLabel="label"
                linkLabel="type"
                nodeColor={node => nodeColors[node.type] || nodeColors['unknown']}
                nodeRelSize={8}
                linkWidth={1}
                linkColor={() => '#999'}
                width={Math.min(1100, window.innerWidth - 380)}
                height={Math.min(800, window.innerHeight - 180)}
                onNodeClick={handleNodeClick}
                onNodeHover={node => setHoveredNode(node)}
                warmupTicks={10}
                cooldownTicks={30}
                nodeCanvasObject={(node, ctx, globalScale) => {
                    // 根据 degree scaling 开关决定大小
                    const size = useDegreeScaling ? (4 + (degreeMap[node.id] || 0) * 2) : 6;

                    // 节点圆
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
                    ctx.fillStyle = nodeColors[node.type] || nodeColors['unknown'];
                    ctx.fill();

                    // 边框用于高亮选中或 hover
                    if (selectedNode && selectedNode.id === node.id) {
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#333';
                        ctx.stroke();
                    }

                    // 仅在选中/悬停或用户选择显示所有标签时绘制标签，减少密集区域的干扰
                    const shouldShowLabel = showAllLabels || (hoveredNode && hoveredNode.id === node.id) || (selectedNode && selectedNode.id === node.id);
                    if (shouldShowLabel) {
                        const label = node.label;
                        const fontSize = Math.max(10, 12 / globalScale);
                        ctx.font = `${fontSize}px Sans-Serif`;
                        const textWidth = ctx.measureText(label).width;
                        const padding = 6;
                        const rectWidth = textWidth + padding * 2;
                        const rectHeight = fontSize + 6;

                        ctx.fillStyle = 'rgba(255,255,255,0.9)';
                        ctx.fillRect(node.x - rectWidth / 2, node.y + size + 6, rectWidth, rectHeight);

                        ctx.fillStyle = '#111';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(label, node.x, node.y + size + 6 + rectHeight / 2);
                    }
                }}
                // 在边上绘制关系类型文字
                linkCanvasObject={(link, ctx, globalScale) => {
                    if (!link.source || !link.target) return;
                    const source = (typeof link.source === 'object') ? link.source : limitedGraphData.nodes.find(n => n.id === link.source);
                    const target = (typeof link.target === 'object') ? link.target : limitedGraphData.nodes.find(n => n.id === link.target);
                    if (!source || !target || source.x == null || target.x == null) return;

                    const midX = (source.x + target.x) / 2;
                    const midY = (source.y + target.y) / 2;
                    const text = link.type || '';
                    const fontSize = Math.max(9, 10 / globalScale);
                    ctx.font = `${fontSize}px Sans-Serif`;
                    ctx.fillStyle = 'rgba(0,0,0,0.6)';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    // 背景小矩形
                    const padding = 4;
                    const textWidth = ctx.measureText(text).width;
                    ctx.fillStyle = 'rgba(255,255,255,0.8)';
                    ctx.fillRect(midX - textWidth/2 - padding, midY - fontSize/2 - 2, textWidth + padding*2, fontSize + 4);
                    ctx.fillStyle = 'rgba(0,0,0,0.7)';
                    ctx.fillText(text, midX, midY);
                }}
                linkDirectionalArrowLength={4}
                linkDirectionalArrowRelPos={1}
                linkDirectionalParticles={0}
            />
            <div className="node-details">
                {hoveredNode && (
                    <div className="hover-details">
                        <h3>{hoveredNode.label}</h3>
                        <div className="properties">
                            {Object.entries(hoveredNode.properties || {}).map(([key, value]) => (
                                <div key={key} className="property">
                                    <span className="property-key">{key}:</span>
                                    <span className="property-value">
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                {selectedNode && (
                    <div className="selected-details">
                        <h3>{selectedNode.label}</h3>
                        <div className="properties">
                            {Object.entries(selectedNode.properties || {}).map(([key, value]) => (
                                <div key={key} className="property">
                                    <span className="property-key">{key}:</span>
                                    <span className="property-value">
                                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
            <div className="legend">
                {Object.entries(nodeColors).map(([type, color]) => (
                    <div key={type} className="legend-item">
                        <span className="color-box" style={{backgroundColor: color}}></span>
                        <span className="type-label">{type}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

export default KnowledgeGraph;