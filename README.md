# 岭南传统诗歌知识库 — 本地开发说明

下面说明如何配置后端与前端，使前端使用 Neo4j 内部 id 作为节点主键、如何通过 .env 指定要连接的 Neo4j database，以及如何运行本项目。

## 后端（backend）配置

1. 在 `backend/.env` 中设置以下变量（仓库中有 `backend/.env.example` 作为示例）：

```
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASS=your_neo4j_password_here
# 可选：指定具体要使用的 Neo4j database 名称（Neo4j 4.x/5.x 支持多 database）
NEO4J_DATABASE=neo4j
PORT=3001
```

说明：后端代码会使用 `NEO4J_DATABASE`（若设置）在 `driver.session({ database: NEO4J_DATABASE })` 中打开 session，这样你可以指定想要连接的 database（例如 `neo4j`、`system` 或自定义的 database 名称）。如果未设置 `NEO4J_DATABASE`，driver 会使用服务器的默认 database。

2. 安装依赖并启动后端：

```powershell
cd backend
npm install
npm start
```

后端启动时会读取 `.env` 中的配置并连接 Neo4j。若连接失败，请确认 Neo4j 服务在 `NEO4J_URI` 可达并且用户名/密码正确。

## 前端（frontend）配置

1. 前端可通过 `frontend/.env`（或 `frontend/.env.local`）控制渲染器和（可选）Neo4j 客户端配置：

```
REACT_APP_GRAPH_RENDERER=force   # 可选值：force（默认）、neovis（占位）
# 若使用 neovis 或直接浏览器连接 Neo4j（不推荐在生产中），可以填入下面变量（请注意安全风险）
REACT_APP_NEO4J_URI=bolt://localhost:7687
REACT_APP_NEO4J_USER=neo4j
REACT_APP_NEO4J_PASS=your_neo4j_password_here
```

修改 `REACT_APP_GRAPH_RENDERER` 后需要重启前端开发服务器以使配置生效。

2. 安装依赖并启动前端：

```powershell
cd frontend
npm install
npm start
```

开发服务器通常在 `http://localhost:3000`。

## 关于节点 id 与渲染逻辑

- 后端现在返回的 `nodes` 使用 Neo4j 内部 id（数字）作为 `nodes[].id`（若节点无内部 id 则回退到 label 字符串）。前端已更新：所有内部查找与连边匹配均以 `id`（数字）为准，`label` 仅用于显示。
- 为了减少标签重叠，前端采用了碰撞检测与力导向参数（使用 `d3-force`），并提供“按度数缩放节点”的可选开关。默认不启用度数缩放；可在图控件中打开以便识别重要节点。

## API 说明（快速）

- GET /knowledgeGraph?search=...&limit=200&skip=0
	- 返回图谱（默认最多返回 200 条匹配，除非你传 limit），节点 id 使用 Neo4j 内部 id。
- GET /knowledgeGraph/node/:nodeId?depth=1&limit=200
	- 返回以指定节点（nodeId 为 Neo4j 内部 id）为中心的子图，`depth` 指 hop 数。

示例：
```powershell
curl "http://localhost:3001/knowledgeGraph/node/123?depth=2&limit=500"
```

## 后续改进建议

- 若图谱非常大，建议在后端实现更细粒度的子图查询（按关系类型过滤、按 hop 分层加载、基于游标的分页），并在前端实现按需加载与增量渲染。
- 在生产环境不要把 Neo4j 密码放在前端 `.env`；若必须使用 neovis 或浏览器端直连，建议通过后端 proxy 暴露受控的查询接口。

---
