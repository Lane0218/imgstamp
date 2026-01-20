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
      <header className="topbar">
        <div className="topbar__left">
          <div className="brand">ImgStamp</div>
          <div className="topbar__group">
            <button className="btn">打开文件夹</button>
            <button className="btn">保存项目</button>
            <button className="btn">打开项目</button>
          </div>
        </div>
        <div className="topbar__center">
          <label className="field field--inline">
            <span>目标尺寸</span>
            <select>
              <option>5 寸 (12.7x8.9cm)</option>
              <option>6 寸 (15.2x10.2cm)</option>
            </select>
          </label>
        </div>
        <div className="topbar__right">
          <button className="btn btn--primary">导出成品</button>
        </div>
      </header>

      <div className="content">
        <aside className="panel panel--left">
          <div className="panel__header">
            <div>
              <strong>资源管理器</strong>
            </div>
            <div className="view-switch">
              <button
                className={`btn btn--ghost icon-btn ${columns === 1 ? 'is-active' : ''}`}
                onClick={() => setColumns(1)}
                aria-label="单列"
              >
                <span className="layout-icon layout-icon--1">
                  <span />
                </span>
              </button>
              <button
                className={`btn btn--ghost icon-btn ${columns === 2 ? 'is-active' : ''}`}
                onClick={() => setColumns(2)}
                aria-label="两列"
              >
                <span className="layout-icon layout-icon--2">
                  <span />
                  <span />
                </span>
              </button>
              <button
                className={`btn btn--ghost icon-btn ${columns === 3 ? 'is-active' : ''}`}
                onClick={() => setColumns(3)}
                aria-label="三列"
              >
                <span className="layout-icon layout-icon--3">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              <button
                className={`btn btn--ghost icon-btn ${columns === 4 ? 'is-active' : ''}`}
                onClick={() => setColumns(4)}
                aria-label="四列"
              >
                <span className="layout-icon layout-icon--4">
                  <span />
                  <span />
                  <span />
                  <span />
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
            <div className="preview-canvas">
              <div className="preview-placeholder">预览生成中...</div>
            </div>
            <div className="preview-toolbar">
              <button className="btn btn--ghost">放大</button>
              <button className="btn btn--ghost">缩小</button>
              <button className="btn btn--ghost">查看原图</button>
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
