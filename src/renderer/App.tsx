import { useEffect, useMemo, useRef, useState } from 'react';
import './index.css';

type PhotoMeta = {
  date: string | null;
  location: string;
  description: string;
  exifDate: string | null;
  locationSkipped: boolean;
  descriptionSkipped: boolean;
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

type HelpDialogState = {
  title: string;
  subtitle?: string;
  lines: string[];
};

type ActionKey = 'date' | 'location' | 'description' | 'all';
type ActionTone = 'ok' | 'warn';
type ActionFeedback = { label: string; tone: ActionTone };

const ACTION_LABELS: Record<ActionKey, string> = {
  date: '应用日期',
  location: '应用地点',
  description: '应用描述',
  all: '应用全部',
};

const ACTION_FEEDBACK_DURATION = 2000;
const STATUS_FEEDBACK_DURATION = 2600;
const THUMB_FLASH_DURATION = 520;

const normalizeMeta = (meta?: Partial<PhotoMeta>): PhotoMeta => ({
  date: meta?.date ?? null,
  location: meta?.location ?? '湖南长沙',
  description: meta?.description ?? '',
  exifDate: meta?.exifDate ?? null,
  locationSkipped: Boolean(meta?.locationSkipped),
  descriptionSkipped: Boolean(meta?.descriptionSkipped),
});

const buildOutputMeta = (meta: PhotoMeta) => ({
  date: meta.date,
  location: meta.locationSkipped ? '' : meta.location,
  description: meta.descriptionSkipped ? '' : meta.description,
});

const isMetaComplete = (meta: PhotoMeta) =>
  Boolean(meta.date) &&
  (meta.locationSkipped || Boolean(meta.location)) &&
  (meta.descriptionSkipped || Boolean(meta.description));

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

const getNameFromPath = (filePath: string | null): string | null => {
  if (!filePath) {
    return null;
  }
  const parts = filePath.split(/[/\\]+/);
  const fileName = parts[parts.length - 1] || '';
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  return withoutExt || null;
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
  const [transientMessage, setTransientMessage] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('未命名项目');
  const [baseDir, setBaseDir] = useState<string | null>(null);
  const [exportSize, setExportSize] = useState<'5' | '5L' | '6' | '6L'>('5L');
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportDialog, setExportDialog] = useState<ExportDialogState | null>(null);
  const [helpDialog, setHelpDialog] = useState<HelpDialogState | null>(null);
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
  const [actionFeedback, setActionFeedback] = useState<Record<ActionKey, ActionFeedback | null>>({
    date: null,
    location: null,
    description: null,
    all: null,
  });
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const dirtyRef = useRef(false);
  const suppressDirtyRef = useRef(false);
  const autoSavingRef = useRef(false);
  const latestProjectRef = useRef<{
    baseDir: string | null;
    exportSize: '5' | '5L' | '6' | '6L';
    photos: PhotoItem[];
  }>({ baseDir: null, exportSize: '5L', photos: [] });
  const actionTimersRef = useRef<Partial<Record<ActionKey, number>>>({});
  const transientTimerRef = useRef<number | null>(null);
  const flashTimersRef = useRef<Map<string, { token: number; timeoutId: number }>>(new Map());
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
  const launchHandledRef = useRef(false);

  const apiAvailable = useMemo(() => Boolean(window.imgstamp), []);
  const statusText = apiAvailable ? (transientMessage ?? statusMessage) : '预加载未就绪';

  const pushTransientMessage = (message: string, duration = STATUS_FEEDBACK_DURATION) => {
    setTransientMessage(message);
    if (transientTimerRef.current) {
      window.clearTimeout(transientTimerRef.current);
    }
    transientTimerRef.current = window.setTimeout(() => {
      setTransientMessage(null);
      transientTimerRef.current = null;
    }, duration);
  };

  const flashActionButton = (key: ActionKey, tone: ActionTone, label: string) => {
    setActionFeedback((prev) => ({ ...prev, [key]: { label, tone } }));
    const timers = actionTimersRef.current;
    if (timers[key]) {
      window.clearTimeout(timers[key]);
    }
    timers[key] = window.setTimeout(() => {
      setActionFeedback((prev) => ({ ...prev, [key]: null }));
      timers[key] = undefined;
    }, ACTION_FEEDBACK_DURATION);
  };

  const flashThumbnails = (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }
    setFlashIds((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.add(id));
      return next;
    });
    ids.forEach((id) => {
      const token = Date.now() + Math.random();
      const timeoutId = window.setTimeout(() => {
        const current = flashTimersRef.current.get(id);
        if (!current || current.token !== token) {
          return;
        }
        flashTimersRef.current.delete(id);
        setFlashIds((prev) => {
          if (!prev.has(id)) {
            return prev;
          }
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, THUMB_FLASH_DURATION);
      flashTimersRef.current.set(id, { token, timeoutId });
    });
  };

  const getActionLabel = (key: ActionKey) => actionFeedback[key]?.label ?? ACTION_LABELS[key];
  const getActionClass = (key: ActionKey) =>
    actionFeedback[key]?.tone ? `btn--feedback-${actionFeedback[key]?.tone}` : '';
  const handleExportSizeChange = (size: '5' | '5L' | '6' | '6L') => {
    setExportSize(size);
    const label = EXPORT_SIZE_META[size]?.label ?? size;
    setStatusMessage(`已切换导出尺寸: ${label}`);
  };

  useEffect(() => {
    return () => {
      if (transientTimerRef.current) {
        window.clearTimeout(transientTimerRef.current);
      }
      Object.values(actionTimersRef.current).forEach((timerId) => {
        if (timerId) {
          window.clearTimeout(timerId);
        }
      });
      flashTimersRef.current.forEach((entry) => {
        window.clearTimeout(entry.timeoutId);
      });
      flashTimersRef.current.clear();
    };
  }, []);

  const handleExport = async () => {
    if (!window.imgstamp) {
      return;
    }
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

    const readyItems = candidates.filter((photo) => isMetaComplete(photo.meta));
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
          meta: buildOutputMeta(photo.meta),
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

  const beginProjectLoad = () => {
    suppressDirtyRef.current = true;
  };

  const finishProjectLoad = () => {
    dirtyRef.current = false;
    setTimeout(() => {
      suppressDirtyRef.current = false;
    }, 0);
  };

  useEffect(() => {
    latestProjectRef.current = { baseDir, exportSize, photos };
  }, [baseDir, exportSize, photos]);

  useEffect(() => {
    if (!projectPath || suppressDirtyRef.current) {
      return;
    }
    dirtyRef.current = true;
  }, [projectPath, projectName, baseDir, exportSize, photos]);

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
      selected: false,
      meta: normalizeMeta(),
    });

    const recordRecent = async (entry: {
      name: string;
      kind: 'folder' | 'project';
      path: string;
      baseDir: string;
    }) => {
      try {
        await window.imgstamp.addRecentProject(entry);
      } catch (error) {
        console.error(error);
      }
    };

    const loadDirectory = async (
      dir: string,
      options?: { projectName?: string; projectPath?: string },
    ) => {
      beginProjectLoad();
      try {
        const scanned = await window.imgstamp.scanImages(dir);
        const nextPhotos = scanned.map(toPhotoItem);
        const firstId = nextPhotos[0]?.id ?? null;
        const fallbackName = getNameFromPath(options?.projectPath || dir) || '未命名项目';
        const nextName = options?.projectName || fallbackName || '未命名项目';
        const recentName = options?.projectName || fallbackName || '未命名项目';
        setPhotos(nextPhotos);
        setCurrentPhotoId(firstId);
        setMultiSelectedIds(firstId ? [firstId] : []);
        setSelectionAnchorIndex(firstId ? 0 : null);
        setBaseDir(dir);
        setProjectPath(options?.projectPath ?? null);
        setProjectName(nextName);
        await window.imgstamp.setWindowTitle(nextName);
        setStatusMessage(options?.projectPath ? `已创建项目: ${nextName}` : `已导入目录: ${dir}`);
        if (options?.projectPath) {
          const projectToSave: ProjectData = {
            version: '1.0',
            name: nextName,
            baseDir: dir,
            exportSize,
            photos: nextPhotos.map((photo) => ({
              id: photo.id,
              filename: photo.filename,
              relativePath: photo.relativePath,
              selected: photo.selected,
              meta: photo.meta,
            })),
          };
          await window.imgstamp.saveProject(options.projectPath, projectToSave);
          await recordRecent({
            name: recentName,
            kind: 'project',
            path: options.projectPath,
            baseDir: dir,
          });
        } else {
          await recordRecent({
            name: recentName,
            kind: 'folder',
            path: dir,
            baseDir: dir,
          });
        }
      } catch (error) {
        setStatusMessage('打开文件夹失败');
        console.error(error);
      } finally {
        finishProjectLoad();
      }
    };

    const loadProjectByPath = async (projectPath: string) => {
      beginProjectLoad();
      try {
        const data = await window.imgstamp.loadProject(projectPath);
        const project = data as ProjectData;
        if (project?.baseDir) {
          const scanned = await window.imgstamp.scanImages(project.baseDir);
          const metaMap = new Map(project.photos.map((photo) => [photo.relativePath, photo]));
          const merged = scanned.map((item) => {
            const saved = metaMap.get(item.relativePath);
            return {
              ...item,
              selected: saved?.selected ?? false,
              meta: normalizeMeta(saved?.meta),
            };
          });
          const firstId = merged[0]?.id ?? null;
          setPhotos(merged);
          setCurrentPhotoId(firstId);
          setMultiSelectedIds(firstId ? [firstId] : []);
          setSelectionAnchorIndex(firstId ? 0 : null);
          setBaseDir(project.baseDir);
          const fallbackName = getNameFromPath(projectPath);
          const nextName = project.name || fallbackName || '未命名项目';
          setProjectName(nextName);
          setExportSize(project.exportSize ?? '5L');
          setProjectPath(projectPath);
          setStatusMessage(`已打开项目: ${projectPath}`);
          await window.imgstamp.setWindowTitle(nextName);
          await recordRecent({
            name: nextName,
            kind: 'project',
            path: projectPath,
            baseDir: project.baseDir,
          });
        } else {
          setStatusMessage('项目缺少基础目录');
        }
      } catch (error) {
        setStatusMessage('打开项目失败');
        console.error(error);
      } finally {
        finishProjectLoad();
      }
    };

    const handleLaunchPayload = async (
      payload:
        | { type: 'create'; name: string; baseDir: string; projectPath: string }
        | { type: 'open-project'; projectPath: string }
        | null,
    ) => {
      if (!payload || launchHandledRef.current) {
        return;
      }
      launchHandledRef.current = true;
      if (payload.type === 'create') {
        await loadDirectory(payload.baseDir, {
          projectName: payload.name,
          projectPath: payload.projectPath,
        });
      } else {
        await loadProjectByPath(payload.projectPath);
      }
    };

    const buildProjectFileName = (name: string) => `ImgStamp-${name || '未命名项目'}.json`;

    const handleOpenDirectory = async () => {
      const dir = await window.imgstamp.openDirectory();
      if (!dir) {
        return;
      }
      const defaultName = buildProjectFileName(getNameFromPath(dir) || '未命名项目');
      const projectPath = await window.imgstamp.saveProjectFile(defaultName);
      if (!projectPath) {
        setStatusMessage('已取消创建项目');
        return;
      }
      const nameFromPath = getNameFromPath(projectPath) || '未命名项目';
      await loadDirectory(dir, { projectName: nameFromPath, projectPath });
    };

    const handleOpenProject = async () => {
      const path = await window.imgstamp.openProjectFile();
      if (!path) {
        return;
      }
      await loadProjectByPath(path);
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
        dirtyRef.current = false;
        suppressDirtyRef.current = true;
        setTimeout(() => {
          suppressDirtyRef.current = false;
        }, 0);
        await window.imgstamp.setWindowTitle(nameFromPath);
        if (baseDir) {
          await recordRecent({
            name: nameFromPath,
            kind: 'project',
            path: targetPath,
            baseDir,
          });
        }
      } catch (error) {
        setStatusMessage('保存项目失败');
        console.error(error);
      }
    };

    const unsubOpenDirectory = window.imgstamp.onMenuOpenDirectory(handleOpenDirectory);
    const unsubOpenProject = window.imgstamp.onMenuOpenProject(handleOpenProject);
    const unsubSaveProject = window.imgstamp.onMenuSaveProject(handleSaveProject);
    const unsubExport = window.imgstamp.onMenuExport(handleExport);
    const unsubSetSize = window.imgstamp.onMenuSetSize(handleExportSizeChange);
    const unsubAbout = window.imgstamp.onMenuAbout((payload) => {
      setHelpDialog(payload);
    });
    const unsubShortcuts = window.imgstamp.onMenuShortcuts((payload) => {
      setHelpDialog(payload);
    });
    const unsubLauncherCreate = window.imgstamp.onLauncherCreateProject(async (payload) => {
      if (!payload?.baseDir) {
        return;
      }
      await handleLaunchPayload({
        type: 'create',
        name: payload.name,
        baseDir: payload.baseDir,
        projectPath: payload.projectPath,
      });
    });
    const unsubLauncherOpen = window.imgstamp.onLauncherOpenProject(async (projectPath) => {
      if (!projectPath) {
        return;
      }
      await handleLaunchPayload({ type: 'open-project', projectPath });
    });
    const unsubExportProgress = window.imgstamp.onExportProgress((payload) => {
      setStatusMessage(`正在导出 ${payload.current}/${payload.total}`);
      setExportProgress({ current: payload.current, total: payload.total });
    });

    window.imgstamp
      .getLaunchPayload()
      .then(handleLaunchPayload)
      .catch((error) => console.error(error));

    return () => {
      unsubOpenDirectory();
      unsubOpenProject();
      unsubSaveProject();
      unsubExport();
      unsubSetSize();
      unsubAbout();
      unsubShortcuts();
      unsubLauncherCreate();
      unsubLauncherOpen();
      unsubExportProgress();
    };
  }, [projectPath, projectName, baseDir, photos, exportSize, isExporting]);

  useEffect(() => {
    if (!window.imgstamp || !projectPath || isExporting) {
      return;
    }

    const interval = setInterval(async () => {
      if (autoSavingRef.current || !dirtyRef.current) {
        return;
      }
      const { baseDir: latestBaseDir, exportSize: latestSize, photos: latestPhotos } =
        latestProjectRef.current;
      if (!latestBaseDir) {
        return;
      }
      const nameFromPath = getNameFromPath(projectPath) || '未命名项目';
      const projectToSave: ProjectData = {
        version: '1.0',
        name: nameFromPath,
        baseDir: latestBaseDir,
        exportSize: latestSize,
        photos: latestPhotos.map((photo) => ({
          id: photo.id,
          filename: photo.filename,
          relativePath: photo.relativePath,
          selected: photo.selected,
          meta: photo.meta,
        })),
      };

      autoSavingRef.current = true;
      try {
        await window.imgstamp.saveProject(projectPath, projectToSave);
        dirtyRef.current = false;
        setStatusMessage('自动保存完成');
      } catch (error) {
        setStatusMessage('自动保存失败');
        console.error(error);
      } finally {
        autoSavingRef.current = false;
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [projectPath, isExporting]);

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
  const incompleteCount = selectedPhotos.filter((photo) => !isMetaComplete(photo.meta)).length;
  const allSelected = photos.length > 0 && selectedPhotos.length === photos.length;
  const canExport = Boolean(baseDir && selectedPhotos.length > 0 && incompleteCount === 0);
  const currentPhoto = photos.find((photo) => photo.id === currentPhotoId) ?? null;
  const locationSkipped = Boolean(currentPhoto?.meta.locationSkipped);
  const descriptionSkipped = Boolean(currentPhoto?.meta.descriptionSkipped);
  const currentIndex = currentPhotoId
    ? photos.findIndex((photo) => photo.id === currentPhotoId)
    : -1;
  const multiSelectedCount = multiSelectedIds.length;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < photos.length - 1;
  const canApplyToSelected = Boolean(currentPhoto && multiSelectedCount >= 2);
  const totalPages = Math.max(1, Math.ceil(photos.length / pageSize));
  const pageStart = pageIndex * pageSize;
  const visiblePhotos = photos.slice(pageStart, pageStart + pageSize);
  const pageItems = buildPageItems(totalPages, pageIndex);
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
          buildOutputMeta(currentPhoto.meta),
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
    currentPhoto?.meta.locationSkipped,
    currentPhoto?.meta.descriptionSkipped,
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

  const getCurrentIndex = () => {
    if (!currentPhotoId) {
      return -1;
    }
    return photos.findIndex((photo) => photo.id === currentPhotoId);
  };

  const selectPhotoAtIndex = (targetIndex: number) => {
    if (targetIndex < 0 || targetIndex >= photos.length) {
      return;
    }
    const target = photos[targetIndex];
    setCurrentPhotoId(target.id);
    setMultiSelectedIds([target.id]);
    setSelectionAnchorIndex(targetIndex);
    const nextPage = Math.floor(targetIndex / pageSize);
    if (nextPage !== pageIndex) {
      setPageIndex(nextPage);
    }
  };

  const handleSelectPrev = () => {
    const currentIndex = getCurrentIndex();
    if (currentIndex <= 0) {
      return;
    }
    selectPhotoAtIndex(currentIndex - 1);
  };

  const handleSelectNext = () => {
    const currentIndex = getCurrentIndex();
    if (currentIndex < 0 || currentIndex >= photos.length - 1) {
      return;
    }
    selectPhotoAtIndex(currentIndex + 1);
  };

  const handleResetExif = () => {
    if (!currentPhoto) {
      return;
    }
    updateCurrentMeta({ date: currentPhoto.meta.exifDate });
  };

  const applyMetaToSelected = (partial: Partial<PhotoMeta>) => {
    if (!currentPhoto || multiSelectedIds.length < 2) {
      return { changedIds: [], targetCount: 0 };
    }
    const diffKeys = (Object.keys(partial) as Array<keyof PhotoMeta>).filter(
      (key) => partial[key] !== undefined,
    );
    const changedIds = photos
      .filter((photo) => multiSelectedSet.has(photo.id))
      .filter((photo) => diffKeys.some((key) => photo.meta[key] !== partial[key]))
      .map((photo) => photo.id);

    if (changedIds.length === 0) {
      return { changedIds, targetCount: multiSelectedIds.length };
    }

    setPhotos((prev) =>
      prev.map((photo) =>
        multiSelectedSet.has(photo.id)
          ? {
              ...photo,
              meta: {
                ...photo.meta,
                ...partial,
              },
            }
          : photo,
      ),
    );
    return { changedIds, targetCount: multiSelectedIds.length };
  };

  const showApplyFeedback = (
    action: ActionKey,
    label: string,
    result: { changedIds: string[]; targetCount: number },
  ) => {
    if (result.targetCount === 0) {
      pushTransientMessage('请先多选图片');
      flashActionButton(action, 'warn', '请多选');
      return;
    }
    if (result.changedIds.length === 0) {
      pushTransientMessage('已一致，无需应用');
      flashActionButton(action, 'warn', '无变更');
      return;
    }
    const suffix =
      result.changedIds.length < result.targetCount ? '（其余已一致）' : '';
    pushTransientMessage(`已应用${label}到 ${result.changedIds.length} 张${suffix}`);
    flashActionButton(action, 'ok', '已应用');
    flashThumbnails(result.changedIds);
  };

  const handleToggleLocationSkipped = () => {
    if (!currentPhoto) {
      return;
    }
    const next = !currentPhoto.meta.locationSkipped;
    updateCurrentMeta({
      locationSkipped: next,
      location: next ? '' : currentPhoto.meta.location,
    });
  };

  const handleToggleDescriptionSkipped = () => {
    if (!currentPhoto) {
      return;
    }
    const next = !currentPhoto.meta.descriptionSkipped;
    updateCurrentMeta({
      descriptionSkipped: next,
      description: next ? '' : currentPhoto.meta.description,
    });
  };

  const handleApplyDateToSelected = () => {
    if (!currentPhoto) {
      return;
    }
    const result = applyMetaToSelected({ date: currentPhoto.meta.date });
    showApplyFeedback('date', '日期', result);
  };

  const handleApplyLocationToSelected = () => {
    if (!currentPhoto) {
      return;
    }
    const result = applyMetaToSelected({
      location: currentPhoto.meta.location,
      locationSkipped: currentPhoto.meta.locationSkipped,
    });
    showApplyFeedback('location', '地点', result);
  };

  const handleApplyDescriptionToSelected = () => {
    if (!currentPhoto) {
      return;
    }
    const result = applyMetaToSelected({
      description: currentPhoto.meta.description,
      descriptionSkipped: currentPhoto.meta.descriptionSkipped,
    });
    showApplyFeedback('description', '描述', result);
  };

  const handleApplyAllToSelected = () => {
    if (!currentPhoto) {
      return;
    }
    const result = applyMetaToSelected({
      date: currentPhoto.meta.date,
      location: currentPhoto.meta.location,
      locationSkipped: currentPhoto.meta.locationSkipped,
      description: currentPhoto.meta.description,
      descriptionSkipped: currentPhoto.meta.descriptionSkipped,
    });
    showApplyFeedback('all', '全部信息', result);
  };

  const toggleCurrentSelected = () => {
    if (!currentPhoto) {
      return;
    }
    setPhotos((prev) =>
      prev.map((photo) =>
        photo.id === currentPhoto.id ? { ...photo, selected: !photo.selected } : photo,
      ),
    );
  };

  const handleToggleSelectAll = () => {
    if (photos.length === 0) {
      return;
    }
    const nextSelected = !allSelected;
    setPhotos((prev) => prev.map((photo) => ({ ...photo, selected: nextSelected })));
  };

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
        return true;
      }
      return target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handleExport();
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleSelectPrev();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleSelectNext();
        return;
      }

      if (event.key === ' ' || event.code === 'Space') {
        event.preventDefault();
        toggleCurrentSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExport, handleSelectPrev, handleSelectNext, toggleCurrentSelected]);

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
              <button
                type="button"
                className={`thumb-legend__dot thumb-legend__dot--toggle ${
                  allSelected ? 'thumb-legend__dot--active' : ''
                }`}
                onClick={handleToggleSelectAll}
                disabled={photos.length === 0}
                aria-label={allSelected ? '取消全选' : '全选'}
                title={allSelected ? '取消全选' : '全选'}
              />
            </div>
          </div>

          <div
            className="thumb-grid"
            ref={gridRef}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {visiblePhotos.map((item, index) => {
              const isComplete = isMetaComplete(item.meta);
              const selectClass = item.selected
                ? isComplete
                  ? 'thumb-select thumb-select--ok'
                  : 'thumb-select thumb-select--warn'
                : 'thumb-select';
              const isMultiSelected = multiSelectedSet.has(item.id);
              const isActive = item.id === currentPhotoId;
              const isFlashing = flashIds.has(item.id);
              return (
                <button
                  type="button"
                  className={`thumb-cell ${isActive ? 'thumb-cell--active' : ''} ${
                    isMultiSelected ? 'thumb-cell--multi' : ''
                  } ${isFlashing ? 'thumb-cell--flash' : ''}`}
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
            <div className="panel__actions">
              <label className="size-select">
                <span className="size-select__label">尺寸</span>
                <select
                  className="size-select__control"
                  value={exportSize}
                  onChange={(event) =>
                    handleExportSizeChange(event.target.value as '5' | '5L' | '6' | '6L')
                  }
                >
                  {Object.entries(EXPORT_SIZE_META).map(([value, meta]) => (
                    <option key={value} value={value}>
                      {meta.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn btn--primary btn--compact"
                onClick={handleExport}
                disabled={!canExport || isExporting}
              >
                {isExporting ? '导出中...' : '导出成品'}
              </button>
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
          </div>
          <div className="preview-area">
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
            <div className="panel__actions">
              <button
                className="btn btn--ghost btn--icon"
                onClick={handleSelectPrev}
                disabled={!currentPhoto || !canGoPrev}
                aria-label="上一张"
                title="上一张"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                className="btn btn--ghost btn--icon"
                onClick={handleSelectNext}
                disabled={!currentPhoto || !canGoNext}
                aria-label="下一张"
                title="下一张"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
          <div className="meta">
            <div className="meta__title">{currentPhoto?.filename ?? '未选择图片'}</div>
            <div className="meta__sub">已选中 {multiSelectedCount} 张图片</div>
          </div>
          <div className="form">
            <label className="field">
              <span>拍摄日期</span>
              <div className="field-row">
                <input
                  type="date"
                  value={currentPhoto?.meta.date ?? ''}
                  onChange={(event) => updateCurrentMeta({ date: event.target.value || null })}
                  disabled={!currentPhoto}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label="复位到 EXIF"
                  title="复位到 EXIF"
                  onClick={handleResetExif}
                  disabled={!currentPhoto}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <polyline points="2 4 2 10 8 10" />
                    <path d="M4.5 15.5a8 8 0 1 0 1.9-8.3L2 10" />
                  </svg>
                </button>
              </div>
            </label>
            <label className="field">
              <span>拍摄地点</span>
              <div className="field-row">
                <input
                  type="text"
                  placeholder={locationSkipped ? '已标记为缺省' : '例如：上海市'}
                  value={locationSkipped ? '' : currentPhoto?.meta.location ?? ''}
                  onChange={(event) =>
                    updateCurrentMeta({ location: event.target.value, locationSkipped: false })
                  }
                  disabled={!currentPhoto || locationSkipped}
                />
                <button
                  type="button"
                  className={`field-toggle ${locationSkipped ? 'field-toggle--active' : ''}`}
                  aria-pressed={locationSkipped}
                  onClick={handleToggleLocationSkipped}
                  disabled={!currentPhoto}
                  title={locationSkipped ? '已标记为缺省，点击取消' : '点击标记为缺省'}
                >
                  缺省
                </button>
              </div>
            </label>
            <label className="field">
              <span>描述</span>
              <div className="field-row">
                <input
                  type="text"
                  placeholder={descriptionSkipped ? '已标记为缺省' : '记录当下的心情或事件...'}
                  value={descriptionSkipped ? '' : currentPhoto?.meta.description ?? ''}
                  onChange={(event) =>
                    updateCurrentMeta({
                      description: event.target.value,
                      descriptionSkipped: false,
                    })
                  }
                  disabled={!currentPhoto || descriptionSkipped}
                />
                <button
                  type="button"
                  className={`field-toggle ${descriptionSkipped ? 'field-toggle--active' : ''}`}
                  aria-pressed={descriptionSkipped}
                  onClick={handleToggleDescriptionSkipped}
                  disabled={!currentPhoto}
                  title={descriptionSkipped ? '已标记为缺省，点击取消' : '点击标记为缺省'}
                >
                  缺省
                </button>
              </div>
            </label>
          </div>
          <div className="form-actions">
            <div className="form-actions__row form-actions__row--top">
              <div className="form-actions__fields">
                <button
                  className={`btn btn--ghost ${getActionClass('date')}`}
                  onClick={handleApplyDateToSelected}
                  disabled={!canApplyToSelected}
                >
                  {getActionLabel('date')}
                </button>
                <button
                  className={`btn btn--ghost ${getActionClass('location')}`}
                  onClick={handleApplyLocationToSelected}
                  disabled={!canApplyToSelected}
                >
                  {getActionLabel('location')}
                </button>
                <button
                  className={`btn btn--ghost ${getActionClass('description')}`}
                  onClick={handleApplyDescriptionToSelected}
                  disabled={!canApplyToSelected}
                >
                  {getActionLabel('description')}
                </button>
              </div>
            </div>
            <div className="form-actions__row form-actions__row--bottom">
              <button
                className={`btn btn--primary btn--block ${getActionClass('all')}`}
                onClick={handleApplyAllToSelected}
                disabled={!canApplyToSelected}
              >
                {getActionLabel('all')}
              </button>
            </div>
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
        </div>
        <div className="status-bar__right">
          <div className="status-bar__text" aria-live="polite">
            {statusText}
          </div>
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
              <button
                className={exportDialog.outputDir ? 'btn btn--ghost' : 'btn btn--primary'}
                onClick={() => setExportDialog(null)}
              >
                知道了
              </button>
              {exportDialog.outputDir ? (
                <button
                  className="btn btn--primary"
                  autoFocus
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
            </div>
          </div>
        </div>
      ) : null}
      {helpDialog ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal modal--help"
            role="dialog"
            aria-modal="true"
            aria-label={helpDialog.title}
          >
            <div className="modal__title">{helpDialog.title}</div>
            {helpDialog.subtitle ? (
              <div className="modal__stats">{helpDialog.subtitle}</div>
            ) : null}
            <ul className="modal__list">
              {helpDialog.lines.map((line, index) => (
                <li key={`${line}-${index}`}>{line}</li>
              ))}
            </ul>
            <div className="modal__actions">
              <button className="btn btn--primary" onClick={() => setHelpDialog(null)} autoFocus>
                知道了
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
