import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';

type PhotoMeta = {
  date: string | null;
  location: string;
  description: string;
  exifDate: string | null;
};

type PhotoItem = {
  id: string;
  filename: string;
  relativePath: string;
  fileUrl: string;
  thumbnailUrl?: string;
  selected: boolean;
  meta: PhotoMeta;
};

type ProjectData = {
  version: string;
  name: string;
  baseDir: string | null;
  exportSize: '5' | '5L' | '6' | '6L';
  photos: Array<{
    id: string;
    filename: string;
    relativePath: string;
    selected: boolean;
    meta: PhotoMeta;
  }>;
};

type PageItem = number | 'ellipsis';

type PreviewMode = 'final' | 'original';
type ExportDialogState = {
  title: string;
  exported: number;
  failed: number;
  total: number;
  outputDir?: string;
  note?: string;
};

const buildPageItems = (totalPages: number, currentIndex: number): PageItem[] => {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const currentPage = currentIndex + 1;
  const pages = new Set<number>();
  pages.add(1);
  pages.add(2);
  pages.add(totalPages);
  pages.add(currentPage);
  pages.add(currentPage - 1);
  pages.add(currentPage + 1);

  const sorted = Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  const result: PageItem[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const page = sorted[i];
    const prev = sorted[i - 1];
    if (prev && page - prev > 1) {
      result.push('ellipsis');
    }
    result.push(page);
  }

  return result;
};

const EXPORT_SIZE_META: Record<
  '5' | '5L' | '6' | '6L',
  { label: string; ratio: string; cm: string }
> = {
  '5': { label: '5寸', ratio: '10:7', cm: '12.7 × 8.9' },
  '5L': { label: '大5寸', ratio: '4:3', cm: '12.7 × 9.5' },
  '6': { label: '6寸', ratio: '3:2', cm: '15.2 × 10.2' },
  '6L': { label: '大6寸', ratio: '4:3', cm: '15.2 × 11.4' },
};

export function App() {
  const MIN_LEFT_WIDTH = 240;
  const MIN_CENTER_WIDTH = 520;
  const MIN_RIGHT_WIDTH = 320;
  const [statusMessage, setStatusMessage] = useState('就绪');
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('未命名项目');
  const [baseDir, setBaseDir] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState<'5' | '5L' | '6' | '6L'>('5L');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDialog, setExportDialog] = useState<ExportDialogState | null>(null);
  const [exportProgress, setExportProgress] = useState<{ current: number; total: number } | null>(
    null,
  );
  const [currentPhotoId, setCurrentPhotoId] = useState<string | null>(null);
  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);
  const [selectionAnchorIndex, setSelectionAnchorIndex] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(1);
  const [pageIndex, setPageIndex] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('original');
  const [zoom, setZoom] = useState(1);
  const [columnSizes, setColumnSizes] = useState({ left: MIN_LEFT_WIDTH, right: MIN_RIGHT_WIDTH });
  const contentRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const sizesInitialized = useRef(false);
  const gridColumnsRef = useRef(2);
  const [columns, setColumns] = useState(2);
  const dragRef = useRef<{
    side: 'left' | 'right';
    startX: number;
    startLeft: number;
    startRight: number;
  } | null>(null);

  const apiAvailable = useMemo(() => Boolean(window.imgstamp), []);

  useEffect(() => {
    if (!window.imgstamp) {
      return;
    }

    const getNameFromPath = (filePath: string | null) => {
      if (!filePath) {
        return null;
      }
      const parts = filePath.split(/[/\\]+/);
      const fileName = parts[parts.length - 1] || '';
      const withoutExt = fileName.replace(/\.[^/.]+$/, '');
      return withoutExt || null;
    };

    const toPhotoItem = (item: {
      id: string;
      filename: string;
      relativePath: string;
      fileUrl: string;
    }): PhotoItem => ({
      ...item,
      selected: false,
      meta: {
        date: null,
        location: '',
        description: '',
        exifDate: null,
      },
    });

    const handleOpenDirectory = async () => {
      try {
        const dir = await window.imgstamp.openDirectory();
        if (dir) {
          const scanned = await window.imgstamp.scanImages(dir);
          const nextPhotos = scanned.map(toPhotoItem);
          const firstId = nextPhotos[0]?.id ?? null;
          setPhotos(nextPhotos);
          setCurrentPhotoId(firstId);
          setMultiSelectedIds(firstId ? [firstId] : []);
          setSelectionAnchorIndex(firstId ? 0 : null);
          setBaseDir(dir);
          setProjectPath(null);
          setProjectName('未命名项目');
          await window.imgstamp.setWindowTitle('未命名项目');
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
              selected: saved?.selected ?? false,
              meta: saved?.meta ?? {
                date: null,
                location: '',
                description: '',
                exifDate: null,
              },
            };
          });
          const firstId = merged[0]?.id ?? null;
          setPhotos(merged);
          setCurrentPhotoId(firstId);
          setMultiSelectedIds(firstId ? [firstId] : []);
          setSelectionAnchorIndex(firstId ? 0 : null);
          setBaseDir(project.baseDir);
          const fallbackName = getNameFromPath(path);
          const nextName = project.name || fallbackName || '未命名项目';
          setProjectName(nextName);
          setExportSize(project.exportSize ?? '5L');
          setProjectPath(path);
          setStatusMessage(`已打开项目: ${path}`);
          await window.imgstamp.setWindowTitle(nextName);
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
        const nameFromPath = getNameFromPath(targetPath) || '未命名项目';
        const projectToSave: ProjectData = {
          version: '1.0',
          name: nameFromPath,
          baseDir,
          exportSize,
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
        setProjectName(nameFromPath);
        setStatusMessage(`已保存项目: ${targetPath}`);
        await window.imgstamp.setWindowTitle(nameFromPath);
      } catch (error) {
        setStatusMessage('保存项目失败');
        console.error(error);
      }
    };

    const handleExport = async () => {
      if (isExporting) {
        return;
      }
      if (!baseDir) {
        setStatusMessage('请先导入照片');
        return;
      }

      const candidates = photos.filter((photo) => photo.selected);
      if (candidates.length === 0) {
        setStatusMessage('请先选择要导出的照片');
        return;
      }

      const readyItems = candidates.filter(
        (photo) => photo.meta.date && photo.meta.location && photo.meta.description,
      );
      if (readyItems.length !== candidates.length) {
        setStatusMessage('所选照片信息未完善');
        return;
      }

      const exportDir = await window.imgstamp.openExportDirectory();
      if (!exportDir) {
        return;
      }

      setExportDialog(null);
      setExportProgress({ current: 0, total: readyItems.length });
      setIsExporting(true);
      setStatusMessage(`开始导出 0/${readyItems.length}`);
      try {
        const result = await window.imgstamp.startExport(
          baseDir,
          exportDir,
          readyItems.map((photo) => ({
            relativePath: photo.relativePath,
            filename: photo.filename,
            meta: {
              date: photo.meta.date,
              location: photo.meta.location,
              description: photo.meta.description,
            },
          })),
          exportSize,
        );

        const hasFailure = result.failed > 0;
        const title = hasFailure ? '导出完成（部分失败）' : '导出完成';
        setExportDialog({
          title,
          exported: result.exported,
          failed: result.failed,
          total: result.total,
          outputDir: result.outputDir,
        });
        setStatusMessage(
          hasFailure
            ? `导出完成: ${result.exported} 张，失败 ${result.failed} 张`
            : `导出完成: ${result.exported} 张`,
        );
      } catch (error) {
        setStatusMessage('导出失败');
        setExportDialog({
          title: '导出失败',
          exported: 0,
          failed: 0,
          total: 0,
          note: '请检查输出目录权限或图片是否损坏',
        });
        console.error(error);
      } finally {
        setIsExporting(false);
        setExportProgress(null);
      }
    };

    const handleSetSize = (size: '5' | '5L' | '6' | '6L') => {
      setExportSize(size);
      const label = EXPORT_SIZE_META[size]?.label ?? size;
      setStatusMessage(`已切换导出尺寸: ${label}`);
    };

    const unsubOpenDirectory = window.imgstamp.onMenuOpenDirectory(handleOpenDirectory);
    const unsubOpenProject = window.imgstamp.onMenuOpenProject(handleOpenProject);
    const unsubSaveProject = window.imgstamp.onMenuSaveProject(handleSaveProject);
    const unsubExport = window.imgstamp.onMenuExport(handleExport);
    const unsubSetSize = window.imgstamp.onMenuSetSize(handleSetSize);
    const unsubExportProgress = window.imgstamp.onExportProgress((payload) => {
      setStatusMessage(`正在导出 ${payload.current}/${payload.total}`);
      setExportProgress({ current: payload.current, total: payload.total });
    });

    return () => {
      unsubOpenDirectory();
      unsubOpenProject();
      unsubSaveProject();
      unsubExport();
      unsubSetSize();
      unsubExportProgress();
    };
  }, [projectPath, projectName, baseDir, photos, exportSize, isExporting]);

  useEffect(() => {
    setZoom(1);
  }, [currentPhotoId, previewMode]);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) {
      return;
    }

    const updateLayout = () => {
      const styles = getComputedStyle(grid);
      const rowHeight = parseFloat(styles.getPropertyValue('--thumb-row-height')) || 120;
      const gap = parseFloat(styles.getPropertyValue('--thumb-gap')) || 8;
      const minColWidth = parseFloat(styles.getPropertyValue('--thumb-min-width')) || 180;
      const paddingTop = parseFloat(styles.paddingTop) || 0;
      const paddingBottom = parseFloat(styles.paddingBottom) || 0;
      const availableWidth = grid.clientWidth;
      const rawColumns = Math.floor((availableWidth + gap) / (minColWidth + gap));
      const columnsCount = Math.min(4, Math.max(2, rawColumns));
      if (gridColumnsRef.current !== columnsCount) {
        gridColumnsRef.current = columnsCount;
        setColumns(columnsCount);
      }
      const availableHeight = Math.max(0, grid.clientHeight - paddingTop - paddingBottom);
      const rows = Math.max(1, Math.floor((availableHeight + gap) / (rowHeight + gap)));
      const nextPageSize = Math.max(1, rows * columnsCount);
      setPageSize(nextPageSize);
    };

    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(grid);
    updateLayout();

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(photos.length / pageSize));
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [photos.length, pageSize]);

  const getContentMetrics = () => {
    const container = contentRef.current;
    if (!container) {
      return null;
    }
    const styles = getComputedStyle(container);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const gap = parseFloat(styles.columnGap || styles.gap) || 0;
    const width = Math.max(0, container.clientWidth - paddingLeft - paddingRight - gap * 2);
    return { width };
  };

  useEffect(() => {
    const container = contentRef.current;
    if (!container) {
      return;
    }

    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const updateSizes = () => {
      const metrics = getContentMetrics();
      if (!metrics) {
        return;
      }
      setColumnSizes((prev) => {
        const maxSideTotal = Math.max(
          MIN_LEFT_WIDTH + MIN_RIGHT_WIDTH,
          metrics.width - MIN_CENTER_WIDTH,
        );
        let baseLeft = prev.left;
        let baseRight = prev.right;
        if (!sizesInitialized.current) {
          baseLeft = Math.round(metrics.width * 0.22);
          baseRight = Math.round(metrics.width * 0.25);
        }
        const nextLeft = clamp(baseLeft, MIN_LEFT_WIDTH, maxSideTotal - MIN_RIGHT_WIDTH);
        const nextRight = clamp(baseRight, MIN_RIGHT_WIDTH, maxSideTotal - nextLeft);
        sizesInitialized.current = true;
        if (prev.left === nextLeft && prev.right === nextRight) {
          return prev;
        }
        return { left: nextLeft, right: nextRight };
      });
    };

    const observer = new ResizeObserver(updateSizes);
    observer.observe(container);
    updateSizes();

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

    const handleMove = (event: MouseEvent) => {
      const dragState = dragRef.current;
      if (!dragState) {
        return;
      }
      const metrics = getContentMetrics();
      if (!metrics) {
        return;
      }
      const maxSideTotal = Math.max(
        MIN_LEFT_WIDTH + MIN_RIGHT_WIDTH,
        metrics.width - MIN_CENTER_WIDTH,
      );
      const delta = event.clientX - dragState.startX;
      if (dragState.side === 'left') {
        const nextLeft = clamp(
          dragState.startLeft + delta,
          MIN_LEFT_WIDTH,
          maxSideTotal - dragState.startRight,
        );
        setColumnSizes({ left: nextLeft, right: dragState.startRight });
      } else {
        const nextRight = clamp(
          dragState.startRight - delta,
          MIN_RIGHT_WIDTH,
          maxSideTotal - dragState.startLeft,
        );
        setColumnSizes({ left: dragState.startLeft, right: nextRight });
      }
    };

    const handleUp = () => {
      if (!dragRef.current) {
        return;
      }
      dragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, []);

  const handleSplitterDown = (side: 'left' | 'right') => (event: React.MouseEvent) => {
    event.preventDefault();
    dragRef.current = {
      side,
      startX: event.clientX,
      startLeft: columnSizes.left,
      startRight: columnSizes.right,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  useEffect(() => {
    const start = pageIndex * pageSize;
    const end = start + pageSize;
    const visibleIds = new Set(photos.slice(start, end).map((photo) => photo.id));
    if (currentPhotoId && visibleIds.has(currentPhotoId)) {
      return;
    }
    const nextId = photos[start]?.id ?? null;
    setCurrentPhotoId(nextId);
    setMultiSelectedIds(nextId ? [nextId] : []);
    setSelectionAnchorIndex(nextId ? start : null);
  }, [pageIndex, pageSize, photos, currentPhotoId]);

  const selectedPhotos = photos.filter((photo) => photo.selected);
  const incompleteCount = selectedPhotos.filter(
    (photo) => !photo.meta.date || !photo.meta.location || !photo.meta.description,
  ).length;
  const currentPhoto = photos.find((photo) => photo.id === currentPhotoId) ?? null;
  const totalPages = Math.max(1, Math.ceil(photos.length / pageSize));
  const pageStart = pageIndex * pageSize;
  const visiblePhotos = photos.slice(pageStart, pageStart + pageSize);
  const pageItems = buildPageItems(totalPages, pageIndex);
  const multiSelectedCount = multiSelectedIds.length;
  const multiSelectedSet = useMemo(() => new Set(multiSelectedIds), [multiSelectedIds]);

  useEffect(() => {
    if (!window.imgstamp || !baseDir) {
      return;
    }

    let cancelled = false;

    const loadThumbnails = async () => {
      const pending = visiblePhotos.filter((photo) => !photo.thumbnailUrl);
      if (pending.length === 0) {
        return;
      }

      try {
        const results = await Promise.all(
          pending.map(async (photo) => ({
            id: photo.id,
            url: await window.imgstamp.getThumbnail(baseDir, photo.relativePath, 256),
          })),
        );

        if (cancelled) {
          return;
        }

        const urlMap = new Map(results.map((item) => [item.id, item.url]));
        setPhotos((prev) =>
          prev.map((photo) => {
            const url = urlMap.get(photo.id);
            return url ? { ...photo, thumbnailUrl: url } : photo;
          }),
        );
      } catch (error) {
        console.error(error);
      }
    };

    loadThumbnails();

    return () => {
      cancelled = true;
    };
  }, [visiblePhotos, baseDir]);

  useEffect(() => {
    if (!window.imgstamp || !baseDir) {
      return;
    }

    let cancelled = false;

    const loadExifForVisible = async () => {
      const pending = visiblePhotos.filter((photo) => photo.meta.exifDate === null);
      if (pending.length === 0) {
        return;
      }

      try {
        const results = await Promise.all(
          pending.map(async (photo) => ({
            id: photo.id,
            date: await window.imgstamp.readExifDate(baseDir, photo.relativePath),
          })),
        );

        if (cancelled) {
          return;
        }

        const dateMap = new Map(results.map((item) => [item.id, item.date]));
        setPhotos((prev) =>
          prev.map((photo) => {
            const exifDate = dateMap.get(photo.id);
            if (exifDate === undefined) {
              return photo;
            }
            const nextMeta = { ...photo.meta, exifDate, date: photo.meta.date ?? exifDate };
            return { ...photo, meta: nextMeta };
          }),
        );
      } catch (error) {
        console.error(error);
      }
    };

    loadExifForVisible();

    return () => {
      cancelled = true;
    };
  }, [visiblePhotos, baseDir]);

  useEffect(() => {
    if (!window.imgstamp || !baseDir || !currentPhoto) {
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const url = await window.imgstamp.getPreview(
          baseDir,
          currentPhoto.relativePath,
          {
            date: currentPhoto.meta.date,
            location: currentPhoto.meta.location,
            description: currentPhoto.meta.description,
          },
          { size: exportSize, mode: previewMode },
        );
        if (!cancelled) {
          setPreviewUrl(url || null);
        }
      } catch (error) {
        console.error(error);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [
    baseDir,
    currentPhoto?.id,
    currentPhoto?.meta.date,
    currentPhoto?.meta.location,
    currentPhoto?.meta.description,
    exportSize,
    previewMode,
  ]);

  const updateCurrentMeta = (partial: Partial<PhotoMeta>) => {
    if (!currentPhoto) {
      return;
    }
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === currentPhoto.id ? { ...photo, meta: { ...photo.meta, ...partial } } : photo,
      ),
    );
  };

  const handleCopyPrev = () => {
    if (!currentPhoto) {
      return;
    }
    const currentIndex = photos.findIndex((photo) => photo.id === currentPhoto.id);
    if (currentIndex <= 0) {
      return;
    }
    const prevPhoto = photos[currentIndex - 1];
    updateCurrentMeta({
      date: prevPhoto.meta.date,
      location: prevPhoto.meta.location,
      description: prevPhoto.meta.description,
    });
  };

  const handleResetExif = () => {
    if (!currentPhoto) {
      return;
    }
    updateCurrentMeta({ date: currentPhoto.meta.exifDate });
  };

  const handleApplyToSelected = () => {
    if (!currentPhoto || multiSelectedIds.length < 2) {
      return;
    }
    const { date, location, description } = currentPhoto.meta;
    setPhotos((prev) =>
      prev.map((photo) =>
        multiSelectedSet.has(photo.id)
          ? {
              ...photo,
              meta: {
                ...photo.meta,
                date,
                location,
                description,
              },
            }
          : photo,
      ),
    );
  };

  const handleThumbnailClick = (
    event: React.MouseEvent<HTMLButtonElement>,
    index: number,
    id: string,
  ) => {
    const isCtrl = event.metaKey || event.ctrlKey;
    const isShift = event.shiftKey;

    if (isShift && selectionAnchorIndex !== null) {
      const start = Math.min(selectionAnchorIndex, index);
      const end = Math.max(selectionAnchorIndex, index);
      const ids = photos.slice(start, end + 1).map((photo) => photo.id);
      setMultiSelectedIds(ids);
      setCurrentPhotoId(id);
      return;
    }

    if (isCtrl) {
      const next = new Set(multiSelectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      if (next.size === 0) {
        next.add(id);
      }
      setMultiSelectedIds(Array.from(next));
      setCurrentPhotoId(id);
      setSelectionAnchorIndex(index);
      return;
    }

    setCurrentPhotoId(id);
    setMultiSelectedIds([id]);
    setSelectionAnchorIndex(index);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(2.5, Number((prev + 0.1).toFixed(2))));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0.5, Number((prev - 0.1).toFixed(2))));
  };

  const handleToggleOriginal = () => {
    setPreviewMode((prev) => (prev === 'final' ? 'original' : 'final'));
  };

  return (
    <div className="app">
      <div
        className="content"
        ref={contentRef}
        style={
          {
            '--left-width': `${columnSizes.left}px`,
            '--right-width': `${columnSizes.right}px`,
          } as React.CSSProperties
        }
      >
        <aside className="panel panel--left">
          <div className="panel__header">
            <div className="panel__title">资源管理器</div>
            <div className="thumb-legend" aria-label="状态图例">
              <span className="thumb-legend__item">
                <i className="thumb-legend__dot thumb-legend__dot--ok" aria-hidden="true" />
                完成
              </span>
              <span className="thumb-legend__item">
                <i className="thumb-legend__dot thumb-legend__dot--warn" aria-hidden="true" />
                待完善
              </span>
            </div>
          </div>

          <div
            className="thumb-grid"
            ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {visiblePhotos.map((item, index) => {
              const isComplete = Boolean(item.meta.date && item.meta.location && item.meta.description);
              const selectClass = item.selected
                ? isComplete
                  ? 'thumb-select thumb-select--ok'
                  : 'thumb-select thumb-select--warn'
                : 'thumb-select';
              const isMultiSelected = multiSelectedSet.has(item.id);
              const isActive = item.id === currentPhotoId;
              return (
                <button
                  type="button"
                  className={`thumb-cell ${isActive ? 'thumb-cell--active' : ''} ${
                    isMultiSelected ? 'thumb-cell--multi' : ''
                  }`}
                  key={item.id}
                  onClick={(event) => handleThumbnailClick(event, pageStart + index, item.id)}
                >
                  <div className="thumb-frame">
                    <button
                      type="button"
                      className={selectClass}
                      aria-label={
                        item.selected
                          ? isComplete
                            ? '已选中，信息完整'
                            : '已选中，信息不完整'
                          : '未选中'
                      }
                      aria-pressed={item.selected}
                      onClick={(event) => {
                        event.stopPropagation();
                        setPhotos((prev) =>
                          prev.map((photo) =>
                            photo.id === item.id ? { ...photo, selected: !photo.selected } : photo,
                          ),
                        );
                      }}
                    />
                    <img src={item.thumbnailUrl ?? item.fileUrl} alt={item.filename} loading="lazy" />
                  </div>
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
                aria-label="上一页"
              >
                &lt;
              </button>
              <div className="pager__list">
                {pageItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span className="pager__ellipsis" key={`ellipsis-${index}`}>
                      ...
                    </span>
                  ) : (
                    <button
                      key={item}
                      className={`pager__item ${item === pageIndex + 1 ? 'pager__item--active' : ''}`}
                      onClick={() => setPageIndex(item - 1)}
                    >
                      {item}
                    </button>
                  ),
                )}
              </div>
              <button
                className="btn btn--ghost"
                onClick={() => setPageIndex((prev) => Math.min(totalPages - 1, prev + 1))}
                disabled={pageIndex >= totalPages - 1}
                aria-label="下一页"
              >
                &gt;
              </button>
            </div>
          </div>
        </aside>

        <section className="panel panel--center">
          <div className="panel__header">
            <div className="panel__title">实时预览</div>
          </div>
          <div className="preview-area">
            <div className="preview-toolbar">
              <button className="icon-control" aria-label="放大" onClick={handleZoomIn}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="14" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <button className="icon-control" aria-label="缩小" onClick={handleZoomOut}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </button>
              <button
                className="icon-control"
                aria-label={previewMode === 'original' ? '切换到渲染预览' : '切换到原图预览'}
                title={previewMode === 'original' ? '切换到渲染预览' : '切换到原图预览'}
                onClick={handleToggleOriginal}
              >
                {previewMode === 'original' ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="11" rx="2" />
                    <circle cx="8" cy="8.5" r="1.5" />
                    <path d="M3 13l5-4.5 4 3.5 5-4.5 4 4" />
                    <line x1="6" y1="18" x2="18" y2="18" />
                    <line x1="6" y1="21" x2="14" y2="21" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="3" y="4" width="18" height="13" rx="2" />
                    <circle cx="8" cy="9" r="1.5" />
                    <path d="M3 15l5-5 4 4 5-5 4 4" />
                  </svg>
                )}
              </button>
            </div>
            <div className="preview-canvas">
              {previewUrl ? (
                <div className="preview-image" style={{ transform: `scale(${zoom})` }}>
                  <img src={previewUrl} alt="预览" />
                </div>
              ) : (
                <div className="preview-placeholder">预览生成中...</div>
              )}
            </div>
          </div>
        </section>

        <aside className="panel panel--right">
          <div className="panel__header">
            <div className="panel__title">属性编辑</div>
          </div>
          <div className="meta">
            <div className="meta__title">{currentPhoto?.filename ?? '未选择图片'}</div>
            <div className="meta__sub">已选中 {multiSelectedCount} 张图片</div>
          </div>
          <div className="form">
            <div className="form-group">
              <div className="form-group__title">拍摄信息</div>
              <label className="field">
                <span>拍摄日期</span>
                <input
                  type="date"
                  value={currentPhoto?.meta.date ?? ''}
                  onChange={(event) => updateCurrentMeta({ date: event.target.value || null })}
                  disabled={!currentPhoto}
                />
                <div className="field-actions">
                  <button
                    className="btn btn--ghost"
                    onClick={handleResetExif}
                    disabled={!currentPhoto}
                  >
                    复位到 EXIF
                  </button>
                </div>
              </label>
              <label className="field">
                <span>拍摄地点</span>
                <input
                  type="text"
                  placeholder="例如：上海市"
                  value={currentPhoto?.meta.location ?? ''}
                  onChange={(event) => updateCurrentMeta({ location: event.target.value })}
                  disabled={!currentPhoto}
                />
              </label>
            </div>
            <div className="form-group">
              <div className="form-group__title">描述</div>
              <label className="field">
                <span>描述</span>
                <input
                  type="text"
                  placeholder="记录当下的心情或事件（限单行）..."
                  value={currentPhoto?.meta.description ?? ''}
                  onChange={(event) => updateCurrentMeta({ description: event.target.value })}
                  disabled={!currentPhoto}
                />
              </label>
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn--primary" onClick={handleCopyPrev} disabled={!currentPhoto}>
              复制上一张信息
            </button>
            <button
              className="btn btn--ghost"
              onClick={handleApplyToSelected}
              disabled={!currentPhoto || multiSelectedCount < 2}
            >
              应用到所有选中
            </button>
          </div>
        </aside>
        <div
          className="splitter splitter--left"
          role="separator"
          aria-label="调整左侧宽度"
          onMouseDown={handleSplitterDown('left')}
        />
        <div
          className="splitter splitter--right"
          role="separator"
          aria-label="调整右侧宽度"
          onMouseDown={handleSplitterDown('right')}
        />
      </div>

      <footer className="status-bar">
        <div>
          总计: {photos.length} 张 | 已选: {selectedPhotos.length} 张 | 待完善: {incompleteCount} 张
          {` | 尺寸：${EXPORT_SIZE_META[exportSize].label} | 比例：${EXPORT_SIZE_META[exportSize].ratio} | 大小(cm)：${EXPORT_SIZE_META[exportSize].cm}`}
        </div>
        <div className="status-bar__right">
          <div className="status-bar__text">{apiAvailable ? statusMessage : '预加载未就绪'}</div>
          {exportProgress && isExporting ? (
            <div
              className="status-bar__progress"
              role="progressbar"
              aria-label="导出进度"
              aria-valuemin={0}
              aria-valuemax={exportProgress.total}
              aria-valuenow={exportProgress.current}
            >
              <div
                className="status-bar__progress-fill"
                style={{
                  width: `${Math.min(
                    100,
                    exportProgress.total > 0
                      ? Math.round((exportProgress.current / exportProgress.total) * 100)
                      : 0,
                  )}%`,
                }}
              />
            </div>
          ) : null}
        </div>
      </footer>
      {exportDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-label={exportDialog.title}>
            <div className="modal__title">{exportDialog.title}</div>
            <div className="modal__stats">
              成功 {exportDialog.exported} 张 · 失败 {exportDialog.failed} 张 · 总计{' '}
              {exportDialog.total} 张
            </div>
            {exportDialog.outputDir ? (
              <div className="modal__path">输出目录：{exportDialog.outputDir}</div>
            ) : null}
            {exportDialog.note ? <div className="modal__note">{exportDialog.note}</div> : null}
            <div className="modal__actions">
              {exportDialog.outputDir ? (
                <button
                  className="btn btn--ghost"
                  onClick={async () => {
                    if (!window.imgstamp || !exportDialog.outputDir) {
                      return;
                    }
                    try {
                      await window.imgstamp.openPath(exportDialog.outputDir);
                    } catch (error) {
                      setStatusMessage('打开输出目录失败');
                      console.error(error);
                    }
                  }}
                >
                  打开输出目录
                </button>
              ) : null}
              <button className="btn btn--primary" onClick={() => setExportDialog(null)}>
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
