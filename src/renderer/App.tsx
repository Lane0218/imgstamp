import { useEffect, useMemo, useState } from 'react';
import './index.css';

type ProjectData = {
  version: string;
  name: string;
  photos: unknown[];
};

export function App() {
  const [columns, setColumns] = useState(2);
  const [statusMessage, setStatusMessage] = useState('就绪');
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<ProjectData>({
    version: '1.0',
    name: '未命名项目',
    photos: [],
  });
  const [exportSize, setExportSize] = useState<'5' | '6'>('5');
  const thumbnails = [
    { id: 1, name: 'IMG_0001.JPG', status: '完整' },
    { id: 2, name: 'IMG_0002.JPG', status: '缺失' },
    { id: 3, name: 'IMG_0003.JPG', status: '完整' },
    { id: 4, name: 'IMG_0004.JPG', status: '缺失' },
    { id: 5, name: 'IMG_0005.JPG', status: '完整' },
    { id: 6, name: 'IMG_0006.JPG', status: '完整' },
  ];

  const apiAvailable = useMemo(() => Boolean(window.imgstamp), []);

  useEffect(() => {
    if (!window.imgstamp) {
      return;
    }

    const handleOpenDirectory = async () => {
      try {
        const dir = await window.imgstamp.openDirectory();
        if (dir) {
          setStatusMessage(`已选择目录: ${dir}`);
        }
      } catch (error) {
        setStatusMessage('打开文件夹失败');
        console.error(error);
      }
    };

    const handleOpenProject = async () => {
      try {
        const path = await window.imgstamp.openProjectFile();
        if (!path) {
          return;
        }
        const data = await window.imgstamp.loadProject(path);
        setProjectPath(path);
        setProjectData(data as ProjectData);
        setStatusMessage(`已打开项目: ${path}`);
      } catch (error) {
        setStatusMessage('打开项目失败');
        console.error(error);
      }
    };

    const handleSaveProject = async () => {
      try {
        let targetPath = projectPath;
        if (!targetPath) {
          targetPath = await window.imgstamp.saveProjectFile();
        }
        if (!targetPath) {
          return;
        }
        await window.imgstamp.saveProject(targetPath, projectData);
        setProjectPath(targetPath);
        setStatusMessage(`已保存项目: ${targetPath}`);
      } catch (error) {
        setStatusMessage('保存项目失败');
        console.error(error);
      }
    };

    const handleExport = () => {
      setStatusMessage('导出流程暂未实现');
    };

    const handleSetSize = (size: '5' | '6') => {
      setExportSize(size);
      setStatusMessage(`已切换导出尺寸: ${size} 寸`);
    };

    const unsubOpenDirectory = window.imgstamp.onMenuOpenDirectory(handleOpenDirectory);
    const unsubOpenProject = window.imgstamp.onMenuOpenProject(handleOpenProject);
    const unsubSaveProject = window.imgstamp.onMenuSaveProject(handleSaveProject);
    const unsubExport = window.imgstamp.onMenuExport(handleExport);
    const unsubSetSize = window.imgstamp.onMenuSetSize(handleSetSize);

    return () => {
      unsubOpenDirectory();
      unsubOpenProject();
      unsubSaveProject();
      unsubExport();
      unsubSetSize();
    };
  }, [projectData, projectPath]);

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
            <span>尺寸: {exportSize} 寸</span>
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
        <div>{apiAvailable ? statusMessage : '预加载未就绪'}</div>
      </footer>
    </div>
  );
}
