import React from 'react';
import './OntologyGallery.css';

// 替换为 AI 对话（嵌入本地 RAGflow 服务）
export default function OntologyGallery() {
    // 优先使用环境变量（可在生产中通过构建时注入），回退到 http://localhost/
    const RAGFLOW_URL = process.env.REACT_APP_RAGFLOW_URL || 'http://localhost/';
    const embedRef = React.useRef(null);
    const [isFull, setIsFull] = React.useState(false);

    const toggleFull = async () => {
        try {
            const el = embedRef.current;
            if (!el) return;
            if (!document.fullscreenElement) {
                if (el.requestFullscreen) await el.requestFullscreen();
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                setIsFull(true);
            } else {
                if (document.exitFullscreen) await document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
                setIsFull(false);
            }
        } catch (e) {
            console.warn('Fullscreen toggle failed', e);
        }
    };

    return (
        <div className="ontology-page">
            <div className="ontology-header">
                <h2>AI 对话（RAGflow）</h2>
                <div className="ontology-actions">
                    <button className="open-full" onClick={toggleFull}>{isFull ? '展开' : '展开'}</button>
                    <a className="open-new" href={RAGFLOW_URL} target="_blank" rel="noreferrer">在新窗口打开</a>
                </div>
            </div>

            <div className="ragflow-embed" ref={embedRef}>
                <iframe title="RAGflow UI" src={RAGFLOW_URL} frameBorder="0" sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-modals" />
                <div className="embed-fallback">

                </div>
            </div>
        </div>
    );
}
