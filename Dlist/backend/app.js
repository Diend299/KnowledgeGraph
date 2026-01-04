// backend/app.js
const express = require('express');
const cors = require('cors');
const neo4j = require('neo4j-driver');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

// 加载 .env（如果存在）
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

// CORS 配置
app.use(cors({
    origin: 'http://localhost:3000',  // 允许前端访问
    methods: ['GET', 'POST', 'OPTIONS'], // 允许的 HTTP 方法
    allowedHeaders: ['Content-Type', 'Authorization'], // 允许的 Headers
    credentials: true // 允许携带凭证
}));

app.use(bodyParser.json());

// 使用环境变量配置 Neo4j（可通过 backend/.env 设置）
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || '299877aA';
const NEO4J_DATABASE = process.env.NEO4J_DATABASE || undefined; // 可选，指定要访问的 Neo4j database 名称

let driver;
try {
    driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    console.log(`Neo4j driver initialized (${NEO4J_URI})`);
} catch (error) {
    console.error('Neo4j 连接失败:', error);
    process.exit(1);
}

// API 接口：获取知识图谱数据
app.get('/knowledgeGraph', async (req, res) => {
    const searchTerm = req.query.search;

    try {
        // 如果有 searchTerm，则按关键词查找相关的任意关系；
        // 否则优先从以诗人相关的关系中随机采样，避免总是返回同一簇
        let query;
        if (searchTerm && searchTerm.trim() !== '') {
            query = `
                MATCH (n)-[r]->(m)
                WHERE n.name CONTAINS $searchTerm OR n.title CONTAINS $searchTerm OR m.name CONTAINS $searchTerm OR m.title CONTAINS $searchTerm
                RETURN n, r, m, labels(n) as sourceLabels, labels(m) as targetLabels,
                       properties(n) as sourceProps, properties(m) as targetProps
            `;
        } else {
            // 从 Poet 相关的关系中采样：随机取若干关系，能更均匀覆盖不同诗人
            query = `
                MATCH (p:Poet)-[r]->(m)
                WITH p, r, m ORDER BY rand() LIMIT $limit
                RETURN p as n, r as r, m as m, labels(p) as sourceLabels, labels(m) as targetLabels,
                       properties(p) as sourceProps, properties(m) as targetProps
            `;
        }

        // 支持分页参数并规范化为非负整数
        let limit = req.query.limit !== undefined && req.query.limit !== '' ? Number(req.query.limit) : 200;
        let skip = req.query.skip !== undefined && req.query.skip !== '' ? Number(req.query.skip) : 0;

        if (isNaN(limit)) limit = 200;
        if (isNaN(skip)) skip = 0;

        // 保证为非负整数
        limit = Math.max(0, Math.floor(limit));
        skip = Math.max(0, Math.floor(skip));

        // 在原始 query 基础上加 LIMIT/SKIP（若 query 已包含 ORDER BY/随机化，则不会重复）
        const pagedQuery = `${query} SKIP $skip LIMIT $limit`;

        const session = driver.session({ database: NEO4J_DATABASE });
        try {
            // Neo4j driver requires integer parameters to be neo4j.int
            const params = { searchTerm: searchTerm || null, limit: neo4j.int(limit), skip: neo4j.int(skip) };
            // 调试日志：打印参数类型和值，以便排查 float/decimal 问题
            console.log('Running /knowledgeGraph with params:', Object.fromEntries(Object.entries(params).map(([k,v]) => [k, { value: v && v.toNumber ? v.toNumber() : v, type: typeof v }] )));
            const result = await session.run(pagedQuery, params);

            const nodes = [];
            const links = [];

            result.records.forEach(record => {
                // 原始节点对象（包含 identity）
                const rawN = record.get('n');
                const rawM = record.get('m');

                const node1Props = record.get('sourceProps');
                const node2Props = record.get('targetProps');
                const relation = record.get('r').type;

                // 获取节点标签作为类型
                const node1Type = record.get('sourceLabels')[0] || 'unknown';
                const node2Type = record.get('targetLabels')[0] || 'unknown';

                // 从 raw 对象中提取 neo4j 内部 id（若存在）
                const node1NeoId = rawN && rawN.identity ? rawN.identity.toInt() : null;
                const node2NeoId = rawM && rawM.identity ? rawM.identity.toInt() : null;

                const node1Label = (node1Props.name || node1Props.title || node1Props.genre || String(node1NeoId));
                const node2Label = (node2Props.name || node2Props.title || node2Props.genre || String(node2NeoId));

                // 使用 neo4j 内部 id 作为节点唯一 id（若不存在则回退到 label 字符串）
                const node1Id = node1NeoId !== null ? node1NeoId : node1Label;
                const node2Id = node2NeoId !== null ? node2NeoId : node2Label;

                if (!nodes.find(node => node.id === node1Id)) {
                    nodes.push({ 
                        id: node1Id,
                        label: node1Label,
                        type: node1Type,
                        group: node1Type,
                        properties: node1Props,
                        neo4jId: node1NeoId
                    });
                }

                if (!nodes.find(node => node.id === node2Id)) {
                    nodes.push({ 
                        id: node2Id,
                        label: node2Label,
                        type: node2Type,
                        group: node2Type,
                        properties: node2Props,
                        neo4jId: node2NeoId
                    });
                }

                links.push({ 
                    source: node1Id, 
                    target: node2Id, 
                    type: relation 
                });
            });

            const graphData = {
                nodes: nodes,
                links: links
            };

            res.json(graphData);
        } finally {
            await session.close();
        }
    } catch (error) {
        console.error('执行 Neo4j 查询出错:', error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});

// 获取以特定节点为中心的图谱数据（支持 depth 与 limit）
app.get('/knowledgeGraph/node/:nodeId', async (req, res) => {
    const nodeId = parseInt(req.params.nodeId);
    const depth = parseInt(req.query.depth) || 1; // hop 深度
    const limit = parseInt(req.query.limit) || 200;

    const session = driver.session({ database: NEO4J_DATABASE });
    try {
        // 验证 nodeId 有效
        if (isNaN(nodeId)) {
            return res.status(400).json({ error: 'Invalid nodeId' });
        }

        // 验证节点存在（传递为 neo4j.int 避免类型问题）
        const exists = await session.run(`MATCH (n) WHERE id(n) = $nodeId RETURN n LIMIT 1`, { nodeId: neo4j.int(nodeId) });
        if (exists.records.length === 0) {
            return res.status(404).json({ error: 'Node not found' });
        }

        // 收集深度范围内的去重节点 — depth 不能作为参数放在可变长度路径中，必须内联为字面值
        const nodesQuery = `
            MATCH (start) WHERE id(start) = $nodeId
            MATCH p=(start)-[*1..${depth}]-(m)
            UNWIND nodes(p) as nd
            RETURN DISTINCT nd
            LIMIT $limit
        `;

        const relsQuery = `
            MATCH (start) WHERE id(start) = $nodeId
            MATCH p=(start)-[*1..${depth}]-(m)
            UNWIND relationships(p) as rl
            RETURN DISTINCT rl
            LIMIT $limit
        `;

    const nodesResult = await session.run(nodesQuery, { nodeId: neo4j.int(nodeId), limit: neo4j.int(limit) });
    const relsResult = await session.run(relsQuery, { nodeId: neo4j.int(nodeId), limit: neo4j.int(limit) });

        const nodes = [];
        const links = [];

        nodesResult.records.forEach(rec => {
            const raw = rec.get('nd');
            const props = raw.properties || {};
            const labels = raw.labels || [];
            const neoId = raw.identity ? raw.identity.toInt() : null;
            const labelText = props.name || props.title || props.genre || String(neoId);
            const idVal = neoId !== null ? neoId : labelText;

            if (!nodes.find(n => n.id === idVal)) {
                nodes.push({ id: idVal, label: labelText, type: labels[0] || 'unknown', group: labels[0] || 'unknown', properties: props, neo4jId: neoId });
            }
        });

        relsResult.records.forEach(rec => {
            const raw = rec.get('rl');
            const relType = raw.type;
            // neo4j-driver 中 relationship 有 start 和 end
            const startId = raw.start && raw.start.toInt ? raw.start.toInt() : (raw.start || null);
            const endId = raw.end && raw.end.toInt ? raw.end.toInt() : (raw.end || null);

            if (startId !== null && endId !== null) {
                links.push({ source: startId, target: endId, type: relType });
            }
        });

        res.json({ nodes, links, description: `与节点 ${nodeId}（深度 ${depth}）相关的子图`, metadata: { nodeCount: nodes.length, linkCount: links.length } });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    } finally {
        await session.close();
    }
});

// 查询诗词原文（从 Neo4j 中检索诗节点及其作者、朝代、图片等属性）
app.get('/poems', async (req, res) => {
    const searchTerm = req.query.search || '';
    let limit = req.query.limit !== undefined && req.query.limit !== '' ? Number(req.query.limit) : 50;
    let skip = req.query.skip !== undefined && req.query.skip !== '' ? Number(req.query.skip) : 0;

    if (isNaN(limit)) limit = 50;
    if (isNaN(skip)) skip = 0;
    limit = Math.max(0, Math.floor(limit));
    skip = Math.max(0, Math.floor(skip));

    const session = driver.session({ database: NEO4J_DATABASE });
    try {
        // 严格以 Poem 节点为核心，避免使用意象/其它类型节点。
        // 搜索仅作用于 Poem 的属性：author/title/content/text/body/time
        const params = { skip: neo4j.int(skip), limit: neo4j.int(limit) };

        let baseQuery;
        if (searchTerm && searchTerm.trim() !== '') {
            const q = searchTerm.trim();
            baseQuery = `
                MATCH (poem:Poem)
                WHERE coalesce(poem.title,'') CONTAINS $q OR coalesce(poem.name,'') CONTAINS $q OR coalesce(poem.text,'') CONTAINS $q OR coalesce(poem.content,'') CONTAINS $q OR coalesce(poem.body,'') CONTAINS $q OR coalesce(poem.author,'') CONTAINS $q
                RETURN DISTINCT poem
            `;
            params.q = q;
        } else {
            baseQuery = `
                MATCH (poem:Poem)
                RETURN DISTINCT poem
            `;
        }

        // 随机化并分页
        baseQuery = baseQuery + " ORDER BY rand() SKIP $skip LIMIT $limit";
        console.log('Running /poems (strict Poem) with params:', { search: searchTerm || null, limit, skip });
        const result = await session.run(baseQuery, params);

        // 将结果去重并映射为前端需要的结构，仅使用 poem.node.properties
        const seen = new Map();
        result.records.forEach(rec => {
            const poemNode = rec.get('poem');
            const poemProps = poemNode ? poemNode.properties || {} : {};
            const idVal = poemNode && poemNode.identity ? poemNode.identity.toInt() : null;

            if (!seen.has(idVal)) {
                const author = poemProps.author || poemProps.name || '';
                const item = {
                    id: idVal,
                    author: author,
                    title: poemProps.title || poemProps.name || '',
                    text: poemProps.text || poemProps.content || poemProps.body || '',
                    dynasty: poemProps.dynasty || '',
                    time: poemProps.time || '',
                    image: poemProps.image || null,
                    properties: poemProps
                };
                seen.set(idVal, item);
            }
        });

        const poems = Array.from(seen.values());
        res.json({ poems, metadata: { count: poems.length, limit, skip } });
    } catch (error) {
        console.error('Error fetching poems:', error && error.stack ? error.stack : error);
        console.error('尝试从 Neo4j 获取诗歌失败，准备回退读取 output_poems 下的 JSON 文件');
        // 回退：读取 output_poems 文件夹下的 JSON 文件（如果有）并返回合并结果
        try {
            const fallbackDir = path.join(__dirname, '..', 'output_poems');
            const files = fs.existsSync(fallbackDir) ? fs.readdirSync(fallbackDir).filter(f => f.toLowerCase().endsWith('.json')) : [];
            const fallbackPoems = [];
            for (const f of files) {
                try {
                    const content = fs.readFileSync(path.join(fallbackDir, f), 'utf8');
                    const arr = JSON.parse(content);
                    if (Array.isArray(arr)) {
                    for (const item of arr) {
                        fallbackPoems.push({
                            id: item.id || item._id || null,
                            author: item.author || item.poet || item.author || '',
                            title: item.title || item.name || '',
                            text: item.content || item.text || item.body || '',
                            poet: item.author || item.poet || '',
                            dynasty: item.dynasty || '',
                            image: item.image || null,
                            properties: item
                        });
                    }
                    }
                } catch (e) {
                    console.warn('读取或解析 fallback JSON 文件失败:', f, e.message);
                }
            }

            if (fallbackPoems.length > 0) {
                return res.json({ poems: fallbackPoems.slice(0, limit), metadata: { fallback: true, count: fallbackPoems.length } });
            }
        } catch (e) {
            console.error('fallback 读取失败:', e);
        }

        res.status(500).json({ error: 'Failed to fetch poems' });
    } finally {
        await session.close();
    }
});

//  添加一个简单的健康检查路由
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// 诊断统计：返回诗人/诗歌/关系的简单统计（方便调试数据是否已导入）
app.get('/stats', async (req, res) => {
    const session = driver.session({ database: NEO4J_DATABASE });
    try {
        const poetCountResult = await session.run(`MATCH (p:Poet) RETURN count(p) as c`);
        const poemCountResult = await session.run(`MATCH (m:Poem) RETURN count(m) as c`);
        const wroteResult = await session.run(`MATCH (p:Poet)-[r:WROTE]->(m:Poem) RETURN p.name as poet, count(m) as cnt ORDER BY cnt DESC LIMIT 20`);

        const poets = poetCountResult.records[0].get('c').toInt();
        const poems = poemCountResult.records[0].get('c').toInt();

        const topWrote = wroteResult.records.map(r => ({ poet: r.get('poet'), count: r.get('cnt').toInt() }));

        res.json({ poets, poems, topWrote });
    } catch (err) {
        console.error('Error in /stats:', err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    } finally {
        await session.close();
    }
});

// 404 处理
app.use((req, res, next) => {
    res.status(404).send("Sorry can't find that!");
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

// 启动服务器
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});

// 调试接口：返回前若干个 Poem 节点的原始属性，便于确认属性名/数据是否正确
app.get('/poems/raw', async (req, res) => {
    const limit = Math.max(1, Math.min(200, parseInt(req.query.limit) || 20));
    const session = driver.session({ database: NEO4J_DATABASE });
    try {
        const q = `MATCH (p:Poem) RETURN p LIMIT $limit`;
        const result = await session.run(q, { limit: neo4j.int(limit) });
        const rows = result.records.map(r => {
            const node = r.get('p');
            return {
                id: node.identity ? node.identity.toInt() : null,
                labels: node.labels,
                properties: node.properties || {}
            };
        });
        res.json({ count: rows.length, rows });
    } catch (err) {
        console.error('/poems/raw error:', err && err.stack ? err.stack : err);
        res.status(500).json({ error: 'Failed to fetch raw poems', detail: err && err.message ? err.message : String(err) });
    } finally {
        await session.close();
    }
});