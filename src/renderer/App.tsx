import { useState } from 'react';
import './index.css';

export function App() {
  const [columns, setColumns] = useState(2);
  const thumbnails = [
    { id: 1, name: 'IMG_0001.JPG', status: '完整' },
    { id: 2, name: 'IMG_0002.JPG', status: '缺失' },
    { id: 3, name: 'IMG_0003.JPG', status: '完整' },
    { id: 4, name: 'IMG_0004.JPG', status: '缺失' },
    { id: 5, name: 'IMG_0005.JPG', status: '完整' },
    { id: 6, name: 'IMG_0006.JPG', status: '完整' },
  ];

  return (
    <div className="app">
      <div className="content">
        <aside className="panel panel--left">
          <div className="panel__header">
            <div>
              <strong>资源管理器</strong>
            </div>
            <div className="view-switch">
              <button
                className="btn btn--ghost icon-btn"
                onClick={() => setColumns((prev) => (prev === 4 ? 1 : prev + 1))}
                aria-label="切换列数"
                title={`当前 ${columns} 列，点击切换`}
              >
                <span
                  className="layout-icon"
                  style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
                >
                  {Array.from({ length: columns }).map((_, index) => (
                    <span key={index} />
                  ))}
                </span>
              </button>
            </div>
          </div>

          <div className="stats">
            <span>总计: 200 张</span>
            <span>已选: 120 张</span>
            <span>待完善: 18 张</span>
          </div>

          <div className="thumb-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {thumbnails.map((item) => (
              <div className="thumb-card" key={item.id}>
                <div
                  className={`thumb-status-dot ${
                    item.status === '完整' ? 'thumb-status-dot--ok' : 'thumb-status-dot--warn'
                  }`}
                />
                <div className="thumb-image" />
                <div className="thumb-name">{item.name}</div>
              </div>
            ))}
          </div>
        </aside>

        <section className="panel panel--center">
          <div className="panel__header">
            <div>
              <strong>实时预览</strong>
            </div>
          </div>
          <div className="preview-area">
            <div className="preview-toolbar">
              <button className="icon-control" aria-label="放大">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <button className="icon-control" aria-label="缩小">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <button className="icon-control" aria-label="查看原图">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>
            <div className="preview-canvas">
              <div className="preview-placeholder">预览生成中...</div>
            </div>
          </div>
        </section>

        <aside className="panel panel--right">
          <div className="panel__header">
            <div>
              <strong>属性编辑</strong>
            </div>
          </div>
          <div className="meta">
            <div className="meta__title">IMG_0001.JPG</div>
            <div className="meta__sub">已选中 1 张图片</div>
          </div>
          <div className="form">
            <label className="field">
              <span>拍摄日期</span>
              <input type="date" />
              <div className="field-actions">
                <button className="btn btn--ghost">复位到 EXIF</button>
              </div>
            </label>
            <label className="field">
              <span>拍摄地点</span>
              <input type="text" placeholder="例如：上海市" />
            </label>
            <label className="field">
              <span>描述</span>
              <input type="text" placeholder="记录当下的心情或事件（限单行）..." />
            </label>
          </div>
          <div className="form-actions">
            <button className="btn">复制上一张信息</button>
            <button className="btn btn--ghost" disabled>
              应用到所有选中
            </button>
          </div>
        </aside>
      </div>

      <footer className="status-bar">
        <div>总计: 200 张 | 已选: 120 张 | 待完善: 18 张</div>
        <div>就绪</div>
      </footer>
    </div>
  );
}
