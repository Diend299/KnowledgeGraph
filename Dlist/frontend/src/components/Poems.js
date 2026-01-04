import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Poems.css';

const API_BASE_URL = process.env.NODE_ENV === 'development' ? 'http://localhost:3001' : window.location.origin;

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, q) {
    if (!q || !text) return text;
    const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'));
    return parts.map((part, i) => (
        part.toLowerCase() === q.toLowerCase() ? <mark key={i}>{part}</mark> : <span key={i}>{part}</span>
    ));
}

export default function Poems() {
    const [query, setQuery] = useState('');
    const [poems, setPoems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pageSize, setPageSize] = useState(50);
    const [skip, setSkip] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        // initial load
        fetchPoems('', true);
    }, [pageSize]);

    const fetchPoems = async (q = '', replace = false) => {
        setLoading(true);
        try {
            if (replace) {
                // 清空当前结果并重置分页，确保检索为全新结果集
                setPoems([]);
                setSkip(0);
            }
            const res = await axios.get(`${API_BASE_URL}/poems`, { params: { search: q || '', limit: pageSize, skip: replace ? 0 : skip } });
            const newPoems = res.data && res.data.poems ? res.data.poems : [];
            if (replace) {
                setPoems(newPoems);
                setSkip(newPoems.length);
            } else {
                setPoems(prev => [...prev, ...newPoems]);
                setSkip(prev => prev + newPoems.length);
            }
            setHasMore(newPoems.length === pageSize);
        } catch (err) {
            console.error('Error fetching poems:', err && err.stack ? err.stack : err);
        } finally {
            setLoading(false);
        }
    };

    const onSearch = (e) => {
        e.preventDefault();
        // start from beginning when searching
        setSkip(0);
        fetchPoems(query, true);
    };

    const loadMore = () => {
        if (loading || !hasMore) return;
        fetchPoems(query, false);
    };

    const onPageSizeChange = (e) => {
        const v = parseInt(e.target.value, 10) || 50;
        setPageSize(v);
        setSkip(0);
    };

    const renderPoet = (p) => {
        // prefer explicit poet field, then properties.author/name
        if (!p) return '';
        // 优先使用后端返回的 poem.author 字段（用户指定）
        if (typeof p.author === 'string' && p.author.trim() !== '') return p.author;
        if (typeof p.poet === 'string' && p.poet.trim() !== '') return p.poet;
        if (p.properties && (p.properties.author || p.properties.name)) return p.properties.author || p.properties.name;
        return '';
    };

    const renderDynasty = (p) => {
        if (!p) return '';
        if (p.dynasty && typeof p.dynasty === 'string' && p.dynasty.trim() !== '') return p.dynasty;
        if (p.properties && p.properties.dynasty) return p.properties.dynasty;
        return '';
    };

    const renderTime = (p) => {
        if (!p) return '';
        if (p.properties && p.properties.time) return p.properties.time;
        if (p.time) return p.time;
        return '';
    };

    return (
        <div className="poems-page">
            <div className="poems-search">
                <form onSubmit={onSearch}>
                    <input value={query} placeholder="按诗题/作者/正文检索诗歌" onChange={e => setQuery(e.target.value)} />
                    <button type="submit">检索</button>
                    <label className="page-size">
                        每页:
                        <select value={pageSize} onChange={onPageSizeChange}>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                            <option value={200}>200</option>
                        </select>
                    </label>
                </form>
            </div>

            <div className="poems-list">
                {loading && <div className="loading">正在加载……</div>}
                {!loading && poems.length === 0 && <div className="empty">未找到诗歌。</div>}
                {poems.map((p, idx) => (
                    <article className="poem-card" id={`poem-${p.id || idx}`} key={p.id || idx}>
                        <header className="poem-header">
                            <h3 className="poem-title">{p.title ? <>{highlightText(p.title, query)}</> : '（无题）'}</h3>
                            <div className="poem-meta">
                                {renderPoet(p) && <span className="poet">{highlightText(renderPoet(p), query)}</span>}
                                {renderDynasty(p) && <span className="dynasty">【{highlightText(renderDynasty(p), query)}】</span>}
                                {renderTime(p) && (
                                    <span className="poem-anchor"> · <a href={`#poem-${p.id || idx}`}>{highlightText(renderTime(p), query)}</a></span>
                                )}
                            </div>
                        </header>
                        <section className="poem-body">
                            <div style={{ whiteSpace: 'pre-wrap' }}>{p.text ? highlightText(p.text, query) : '（无正文）'}</div>
                        </section>
                        {p.image && (
                            <div className="poem-image-wrap">
                                <img src={p.image} alt={p.title || 'image'} />
                            </div>
                        )}
                    </article>
                ))}

                {hasMore && !loading && (
                    <div className="load-more-wrap">
                        <button className="load-more" onClick={loadMore}>加载更多</button>
                    </div>
                )}
            </div>
        </div>
    );
}
