// frontend/src/components/KnowledgeGraph.js
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { forceCollide, forceManyBody, forceLink } from 'd3-force';
import ForceGraph2D from 'react-force-graph-2d';

function KnowledgeGraph({ graphData, onNodeClick, searchTerm }) {
    const [nodeLimit, setNodeLimit] = useState(50);
    const [showAllNodes, setShowAllNodes] = useState(false);
    const [selectedNode, setSelectedNode] = useState(null);
    const [hoveredNode, setHoveredNode] = useState(null);
    const [highlightNodes, setHighlightNodes] = useState(new Set());
    const [highlightLinks, setHighlightLinks] = useState(new Set());
    const [useDegreeScaling, setUseDegreeScaling] = useState(true); // 默认开启大小缩放
    const [showAllLabels, setShowAllLabels] = useState(false);
    
    const fgRef = useRef();
    const containerRef = useRef();
    const canvasRef = useRef();
    const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

    // 🎨 莫兰迪色系/学术风格配色，比默认的高饱和度色更耐看
    const colorList = [
        '#5470c6', // 靛蓝
        '#91cc75', // 草绿
        '#fac858', // 姜黄
        '#ee6666', // 茜红
        '#73c0de', // 天蓝
        '#3ba272', // 墨绿
        '#fc8452', // 橘红
        '#9a60b4', // 紫罗兰
        '#ea7ccc'  // 桃红
    ];

    // 动态生成节点类型和颜色的映射
    const nodeColors = useMemo(() => {
        if (!graphData) return { 'unknown': '#cccccc' };

        const types = new Set();
        graphData.nodes.forEach(node => {
            if (node.type) types.add(node.type);
        });

        const colorMap = {};
        Array.from(types).forEach((type, index) => {
            colorMap[type] = colorList[index % colorList.length];
        });
        colorMap['unknown'] = '#cccccc';

        return colorMap;
    }, [graphData]);

    // 计算每个节点的度
    const degreeMap = useMemo(() => {
        const map = {};
        if (!graphData) return map;
        graphData.links.forEach(link => {
            const src = typeof link.source === 'object' ? link.source.id : link.source;
            const tgt = typeof link.target === 'object' ? link.target.id : link.target;
            map[src] = (map[src] || 0) + 1;
            map[tgt] = (map[tgt] || 0) + 1;
        });
        return map;
    }, [graphData]);

    // 处理节点数量限制
    const limitedGraphData = useMemo(() => {
        if (!graphData) return { nodes: [], links: [] };
        if (showAllNodes) return graphData;
        
        // 简单截取前N个节点 (实际项目中建议按度数排序后再截取，显示重要节点)
        const sortedNodes = [...graphData.nodes].sort((a, b) => (degreeMap[b.id]||0) - (degreeMap[a.id]||0));
        const limitedNodes = sortedNodes.slice(0, nodeLimit);
        
        const nodeIds = new Set(limitedNodes.map(n => n.id));
        const limitedLinks = graphData.links.filter(link => {
            const src = typeof link.source === 'object' ? link.source.id : link.source;
            const tgt = typeof link.target === 'object' ? link.target.id : link.target;
            return nodeIds.has(src) && nodeIds.has(tgt);
        });

        return {
            nodes: limitedNodes,
            links: limitedLinks
        };
    }, [graphData, nodeLimit, showAllNodes, degreeMap]);

    // ✨ 核心逻辑：处理高亮
    const updateHighlight = useCallback(() => {
        setHighlightNodes(highlightNodes);
        setHighlightLinks(highlightLinks);
    }, [highlightNodes, highlightLinks]);

    const handleNodeHover = (node) => {
        setHoveredNode(node);
        highlightNodes.clear();
        highlightLinks.clear();

        if (node) {
            highlightNodes.add(node.id);
            // 找到所有邻居
            limitedGraphData.links.forEach(link => {
                const srcId = typeof link.source === 'object' ? link.source.id : link.source;
                const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
                
                if (srcId === node.id) {
                    highlightLinks.add(link);
                    highlightNodes.add(tgtId);
                } else if (tgtId === node.id) {
                    highlightLinks.add(link);
                    highlightNodes.add(srcId);
                }
            });
        }
        updateHighlight();
    };

    const handleLinkHover = (link) => {
        highlightNodes.clear();
        highlightLinks.clear();

        if (link) {
            highlightLinks.add(link);
            highlightNodes.add(typeof link.source === 'object' ? link.source.id : link.source);
            highlightNodes.add(typeof link.target === 'object' ? link.target.id : link.target);
        }
        updateHighlight();
    };

    const handleNodeClick = (node) => {
        setSelectedNode(node);
        // 聚焦动画
        if (fgRef.current) {
            fgRef.current.centerAt(node.x, node.y, 1000);
            fgRef.current.zoom(2, 1000);
        }
        
        if (onNodeClick) {
            const arg = (node && node.neo4jId !== undefined && node.neo4jId !== null) ? node.neo4jId : node.label;
            onNodeClick(arg);
        }
    };

    // 配置力导向参数
    useEffect(() => {
        if (!fgRef.current) return;
        const charge = -150; 
        const linkDist = 80; 
        
        // 增加碰撞体积，防止文字重叠
        const collideRadius = (d) => {
            const base = 10;
            const deg = degreeMap[d.id] || 0;
            return useDegreeScaling ? base + deg * 2.5 : base + 2;
        };

        try {
            fgRef.current.d3Force('charge', forceManyBody().strength(charge));
            fgRef.current.d3Force('link', forceLink().id(d => d.id).distance(linkDist));
            fgRef.current.d3Force('collide', forceCollide().radius(collideRadius).strength(0.8));
        } catch (e) {
            console.warn('Failed to set d3 forces', e);
        }
    }, [limitedGraphData, useDegreeScaling, degreeMap]);

    // 当 searchTerm 改变时，尝试找到匹配节点并聚焦（中心化并放大）
    useEffect(() => {
        if (!searchTerm || !limitedGraphData.nodes || limitedGraphData.nodes.length === 0) return;
        const q = String(searchTerm).toLowerCase().trim();
        if (q === '') return;

        const match = limitedGraphData.nodes.find(n => {
            const label = (n.label || '').toString().toLowerCase();
            const name = (n.properties && (n.properties.name || n.properties.title) || '').toString().toLowerCase();
            return label.includes(q) || name.includes(q);
        });

        if (match && fgRef.current) {
            const tryCenter = (attemptsLeft = 3) => {
                const x = match.x, y = match.y;
                if (typeof x === 'number' && typeof y === 'number') {
                    try {
                        fgRef.current.centerAt(x, y, 800);
                        fgRef.current.zoom(2, 800);
                        setSelectedNode(match);
                    } catch (e) {
                        console.warn('Center attempt failed', e);
                    }
                } else if (attemptsLeft > 0) {
                    // 节点位置尚未稳定，稍后再试
                    setTimeout(() => tryCenter(attemptsLeft - 1), 300);
                }
            };
            tryCenter();
        }
    }, [searchTerm, limitedGraphData]);

    // 计算并监听画布尺寸，避免直接使用 window.innerWidth 导致溢出
    useEffect(() => {
        const updateSize = () => {
            const el = canvasRef.current;
            if (!el) return;
            const rect = el.getBoundingClientRect();
            setCanvasSize({ width: Math.floor(rect.width), height: Math.floor(rect.height) });
        };

        updateSize();
        const ro = new ResizeObserver(() => updateSize());
        if (canvasRef.current) ro.observe(canvasRef.current);
        window.addEventListener('resize', updateSize);

        return () => {
            window.removeEventListener('resize', updateSize);
            try { if (ro && canvasRef.current) ro.unobserve(canvasRef.current); } catch (e) {}
        };
    }, []);

    if (!graphData) {
        return <div style={{padding: 20, textAlign: 'center', color: '#666'}}>正在加载岭南诗歌图谱数据...</div>;
    }

    return (
        <div className="graph-container" ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <div className="graph-inner" style={{ background: '#fff', borderRadius: 8, padding: 12, boxShadow: '0 6px 18px rgba(10,30,60,0.04)' }}>
                {/* 搜索栏（放在图谱上方，便于查询） */}
                <div style={{ marginBottom: 12 }}>
                    {/* 如果 App 需要，可以把 SearchBar 传入作为 children 或使用 prop，当前保留外层 App 中的 SearchBar */}
                </div>

                <div ref={canvasRef} style={{ width: '100%', height: '72vh' }}>
            
            {/* 控制面板 */}
            <div className="graph-controls" style={{
                position: 'absolute', 
                top: 10, 
                left: 10, 
                zIndex: 9, 
                background: 'rgba(255,255,255,0.95)', 
                padding: '12px', 
                borderRadius: '8px', 
                boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '14px'
            }}>
                <div style={{fontWeight: 'bold', marginBottom: 4, color: '#333'}}>图谱控制器</div>
                <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
                    <span>节点数量: {limitedGraphData.nodes.length}</span>
                    <input
                        type="range"
                        min="10"
                        max={Math.min(200, graphData.nodes.length)} // 限制最大滑动范围，防止卡顿
                        value={nodeLimit}
                        onChange={(e) => setNodeLimit(Number(e.target.value))}
                        style={{width: 100}}
                    />
                </div>
                
                <div style={{display: 'flex', gap: 10, flexWrap: 'wrap'}}>
                   <label style={{cursor: 'pointer', display: 'flex', alignItems: 'center'}}>
                        <input type="checkbox" checked={showAllNodes} onChange={(e)=>setShowAllNodes(e.target.checked)} />
                        <span style={{marginLeft: 4}}>显示全部</span>
                    </label>
                    <label style={{cursor: 'pointer', display: 'flex', alignItems: 'center'}}>
                        <input type="checkbox" checked={useDegreeScaling} onChange={(e)=>setUseDegreeScaling(e.target.checked)} />
                        <span style={{marginLeft: 4}}>大小缩放</span>
                    </label>
                    <label style={{cursor: 'pointer', display: 'flex', alignItems: 'center'}}>
                        <input type="checkbox" checked={showAllLabels} onChange={(e)=>setShowAllLabels(e.target.checked)} />
                        <span style={{marginLeft: 4}}>强制显示文字</span>
                    </label>
                </div>
            </div>

            {/* 绘图区域 */}
            <ForceGraph2D
                ref={fgRef}
                graphData={limitedGraphData}
                
                // 画布配置
                backgroundColor="#fafafa" // 浅灰背景，比纯白护眼
                width={canvasSize.width}
                height={canvasSize.height}
                
                // 节点配置
                nodeLabel="label"
                nodeRelSize={6}
                
                // 连线配置
                linkWidth={link => highlightLinks.has(link) ? 2 : 1}
                linkDirectionalArrowLength={3.5}
                linkDirectionalArrowRelPos={1}
                
                // 交互事件
                onNodeClick={handleNodeClick}
                onNodeHover={handleNodeHover}
                onLinkHover={handleLinkHover}
                onBackgroundClick={() => {
                    setSelectedNode(null);
                    setHoveredNode(null);
                    setHighlightNodes(new Set());
                    setHighlightLinks(new Set());
                }}

                // 🎨 自定义节点绘制
                nodeCanvasObject={(node, ctx, globalScale) => {
                    // 1. 确定大小
                    const baseSize = 4;
                    const deg = degreeMap[node.id] || 0;
                    const size = useDegreeScaling ? (baseSize + Math.sqrt(deg) * 3) : 6;

                    // 2. 确定是否高亮/变暗
                    // 如果有 hover 状态，且当前节点不在高亮集合中，则变暗
                    let isDimmed = false;
                    if (highlightNodes.size > 0 && !highlightNodes.has(node.id)) {
                        isDimmed = true;
                    }
                    // 如果有选中节点，且当前节点不是选中节点，也可能需要逻辑处理，这里优先处理hover
                    
                    const isSelected = selectedNode === node;
                    const isHovered = hoveredNode === node;

                    // 3. 绘制节点主体
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
                    
                    // 颜色处理
                    const color = nodeColors[node.type] || nodeColors['unknown'];
                    ctx.fillStyle = isDimmed ? '#e0e0e0' : color; // 变暗时用灰色
                    
                    // 阴影效果 (仅高亮时)
                    if (isHovered || isSelected) {
                        ctx.shadowColor = color;
                        ctx.shadowBlur = 10;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    
                    ctx.fill();
                    
                    // 4. 绘制描边 (Stroke)
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // 选中状态加个圈
                    if (isSelected) {
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, size + 2, 0, 2 * Math.PI);
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#333';
                        ctx.stroke();
                    }

                    // 5. 绘制文字标签
                    // 策略：高亮时、选中时、或者全局开关打开时显示，且仅当节点未变暗时
                    const shouldShowLabel = showAllLabels || isHovered || isSelected || highlightNodes.has(node.id);
                    
                    if (shouldShowLabel && !isDimmed) {
                        const label = node.label;
                        const fontSize = Math.max(10, 14 / globalScale); // 保持文字清晰
                        ctx.font = `${fontSize}px "Microsoft YaHei", Sans-Serif`;
                        
                        const textWidth = ctx.measureText(label).width;
                        const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

                        // 文字背景
                        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                        if (isSelected) ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
                        
                        ctx.fillRect(
                            node.x - bckgDimensions[0] / 2, 
                            node.y + size + 2, 
                            bckgDimensions[0], 
                            bckgDimensions[1]
                        );

                        // 文字颜色
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = '#000';
                        ctx.fillText(label, node.x, node.y + size + 2 + bckgDimensions[1] / 2);
                    }
                }}

                // 🎨 自定义连线绘制
                linkCanvasObject={(link, ctx, globalScale) => {
                    const isDimmed = highlightNodes.size > 0 && !highlightLinks.has(link);
                    
                    // 1. 绘制线条
                    const start = link.source;
                    const end = link.target;
                    
                    if (typeof start !== 'object' || typeof end !== 'object') return;

                    ctx.beginPath();
                    ctx.moveTo(start.x, start.y);
                    ctx.lineTo(end.x, end.y);
                    
                    if (isDimmed) {
                        ctx.strokeStyle = 'rgba(200,200,200,0.2)'; // 极淡的颜色
                        ctx.lineWidth = 1;
                    } else {
                        ctx.strokeStyle = '#999';
                        ctx.lineWidth = highlightLinks.has(link) ? 1.5 : 1;
                    }
                    ctx.stroke();

                    // 2. 绘制连线文字
                    // 策略：只有当 鼠标悬停在相关节点/连线 上时，才显示连线文字！拒绝满屏乱码
                    const shouldShowLabel = showAllLabels || highlightLinks.has(link);

                    if (shouldShowLabel && !isDimmed) {
                        const text = link.type;
                        const midX = (start.x + end.x) / 2;
                        const midY = (start.y + end.y) / 2;
                        
                        const fontSize = Math.max(8, 10 / globalScale);
                        ctx.font = `${fontSize}px Sans-Serif`;
                        const textWidth = ctx.measureText(text).width;

                        // 文字背景
                        ctx.fillStyle = 'rgba(255,255,255,0.8)';
                        ctx.fillRect(
                            midX - textWidth / 2 - 2, 
                            midY - fontSize / 2 - 2, 
                            textWidth + 4, 
                            fontSize + 4
                        );

                        ctx.fillStyle = '#666';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(text, midX, midY);
                    }
                }}
            />

                </div>
            </div>

            {/* 右下角图例 */}
            <div className="legend" style={{
                position: 'absolute', 
                bottom: 20, 
                right: 20, 
                background: 'rgba(255,255,255,0.9)', 
                padding: 10, 
                borderRadius: 8,
                border: '1px solid #eee',
                maxHeight: 200,
                overflowY: 'auto'
            }}>
                <div style={{fontSize: 12, marginBottom: 5, color: '#999'}}>实体类型</div>
                {Object.entries(nodeColors).map(([type, color]) => (
                    <div key={type} style={{display: 'flex', alignItems: 'center', margin: '4px 0'}}>
                        <span style={{width: 12, height: 12, backgroundColor: color, borderRadius: '50%', marginRight: 8}}></span>
                        <span style={{fontSize: 12, color: '#333'}}>{type === 'unknown' ? '其他' : type}</span>
                    </div>
                ))}
            </div>

            {/* 选中节点的详情面板 (简单的浮窗展示) */}
            {selectedNode && (
                <div style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 260,
                    background: 'white',
                    boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
                    padding: 20,
                    borderRadius: 8,
                    maxHeight: '80%',
                    overflowY: 'auto',
                    zIndex: 10
                }}>
                    <button 
                        onClick={() => setSelectedNode(null)}
                        style={{float: 'right', border: 'none', background: 'none', cursor: 'pointer', fontSize: 16}}
                    >×</button>
                    <h3 style={{margin: '0 0 10px 0', color: nodeColors[selectedNode.type]}}>{selectedNode.label}</h3>
                    <div style={{fontSize: 12, color: '#666', marginBottom: 10}}>类型: {selectedNode.type}</div>
                    
                    <div style={{borderTop: '1px solid #eee', paddingTop: 10}}>
                        {Object.entries(selectedNode.properties || {}).map(([key, value]) => (
                            <div key={key} style={{marginBottom: 6, fontSize: 13}}>
                                <span style={{fontWeight: 'bold', color: '#555'}}>{key}: </span>
                                <span style={{wordBreak: 'break-all'}}>{String(value)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export default KnowledgeGraph;