import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';

type PhotoMeta = {
  date: string | null;
  location: string;
  description: string;
};

type PhotoItem = {
  id: string;
  filename: string;
  relativePath: string;
  fileUrl: string;
  selected: boolean;
  meta: PhotoMeta;
};

type ProjectData = {
  version: string;
  name: string;
  baseDir: string | null;
  photos: Array<{
    id: string;
    filename: string;
    relativePath: string;
    selected: boolean;
    meta: PhotoMeta;
  }>;
};

export function App() {
  const [columns, setColumns] = useState(2);
  const [statusMessage, setStatusMessage] = useState('就绪');
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('未命名项目');
  const [baseDir, setBaseDir] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState<'5' | '6'>('5');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const apiAvailable = useMemo(() => Boolean(window.imgstamp), []);

  useEffect(() => {
    if (!window.imgstamp) {
      return;
    }

    const toPhotoItem = (item: {
      id: string;
      filename: string;
      relativePath: string;
      fileUrl: string;
    }): PhotoItem => ({
      ...item,
      selected: true,
      meta: {
        date: null,
        location: '',
        description: '',
      },
    });

    const handleOpenDirectory = async () => {
      try {
        const dir = await window.imgstamp.openDirectory();
        if (dir) {
          const scanned = await window.imgstamp.scanImages(dir);
          const nextPhotos = scanned.map(toPhotoItem);
          setPhotos(nextPhotos);
          setCurrentPhotoId(nextPhotos[0]?.id ?? null);
          setBaseDir(dir);
          setProjectPath(null);
          setStatusMessage(`已导入目录: ${dir}`);
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
        const project = data as ProjectData;
        if (project?.baseDir) {
          const scanned = await window.imgstamp.scanImages(project.baseDir);
          const metaMap = new Map(project.photos.map((photo) => [photo.relativePath, photo]));
          const merged = scanned.map((item) => {
            const saved = metaMap.get(item.relativePath);
            return {
              ...item,
              selected: saved?.selected ?? true,
              meta: saved?.meta ?? { date: null, location: '', description: '' },
            };
          });
          setPhotos(merged);
          setCurrentPhotoId(merged[0]?.id ?? null);
          setBaseDir(project.baseDir);
          setProjectName(project.name || '未命名项目');
          setProjectPath(path);
          setStatusMessage(`已打开项目: ${path}`);
        } else {
          setStatusMessage('项目缺少基础目录');
        }
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
        const projectToSave: ProjectData = {
          version: '1.0',
          name: projectName,
          baseDir,
          photos: photos.map((photo) => ({
            id: photo.id,
            filename: photo.filename,
            relativePath: photo.relativePath,
            selected: photo.selected,
            meta: photo.meta,
          })),
        };
        await window.imgstamp.saveProject(targetPath, projectToSave);
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
  }, [projectPath, projectName, baseDir, photos]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }

    const updatePageSize = () => {
      const styles = getComputedStyle(grid);
      const rowHeight = parseFloat(styles.getPropertyValue('--thumb-row-height')) || 120;
      const gap = parseFloat(styles.getPropertyValue('--thumb-gap')) || 12;
      const availableHeight = grid.clientHeight;
      const rows = Math.max(1, Math.floor((availableHeight + gap) / (rowHeight + gap)));
      const nextPageSize = Math.max(1, rows * columns);
      setPageSize(nextPageSize);
    };

    const observer = new ResizeObserver(() => updatePageSize());
    observer.observe(grid);
    updatePageSize();

    return () => {
      observer.disconnect();
    };
  }, [columns]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(photos.length / pageSize));
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [photos.length, pageSize]);

  useEffect(() => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    const visibleIds = new Set(photos.slice(start, end).map((photo) => photo.id));
    if (currentPhotoId && visibleIds.has(currentPhotoId)) {
      return;
    }
    setCurrentPhotoId(photos[start]?.id ?? null);
  }, [pageIndex, pageSize, photos, currentPhotoId]);

  const selectedPhotos = photos.filter((photo) => photo.selected);
  const incompleteCount = selectedPhotos.filter(
    (photo) => !photo.meta.date || !photo.meta.location || !photo.meta.description,
  ).length;
  const currentPhoto = photos.find((photo) => photo.id === currentPhotoId) ?? null;
  const totalPages = Math.max(1, Math.ceil(photos.length / pageSize));
  const pageStart = pageIndex * pageSize;
  const visiblePhotos = photos.slice(pageStart, pageStart + pageSize);

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
            <span>总计: {photos.length} 张</span>
            <span>已选: {selectedPhotos.length} 张</span>
            <span>待完善: {incompleteCount} 张</span>
            <span>尺寸: {exportSize} 寸</span>
          </div>

          <div
            className="thumb-grid"
            ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {visiblePhotos.map((item) => {
              const isComplete = Boolean(item.meta.date && item.meta.location && item.meta.description);
              const dotClass = item.selected
                ? isComplete
                  ? 'thumb-status-dot--ok'
                  : 'thumb-status-dot--warn'
                : 'thumb-status-dot--hidden';
              return (
                <button
                  type="button"
                  className={`thumb-card ${item.id === currentPhotoId ? 'thumb-card--active' : ''}`}
                  key={item.id}
                  onClick={() => setCurrentPhotoId(item.id)}
                >
                  <div className={`thumb-status-dot ${dotClass}`} />
                  <div className="thumb-image">
                    <img src={item.fileUrl} alt={item.filename} loading="lazy" />
                  </div>
                  <div className="thumb-name">{item.filename}</div>
                </button>
              );
            })}
          </div>

          <div className="pager">
            <div className="pager__group">
              <button
                className="btn btn--ghost"
                onClick={() => setPageIndex((prev) => Math.max(0, prev - 1))}
                disabled={pageIndex === 0}
              >
                上一页
              </button>
              <button
                className="btn btn--ghost"
                onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
                disabled={pageIndex >= totalPages - 1}
              >
                下一页
              </button>
            </div>
            <div>
              第 {pageIndex + 1} / {totalPages} 页
            </div>
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
            <div className="meta__title">{currentPhoto?.filename ?? '未选择图片'}</div>
            <div className="meta__sub">已选中 {selectedPhotos.length} 张图片</div>
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
        <div>
          总计: {photos.length} 张 | 已选: {selectedPhotos.length} 张 | 待完善: {incompleteCount} 张
        </div>
        <div>{apiAvailable ? statusMessage : '预加载未就绪'}</div>
      </footer>
    </div>
  );
}
