import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import logoUrl from './assets/logo.png';

type RecentProject = {
  name: string;
  kind: 'folder' | 'project';
  path: string;
  baseDir: string;
  lastOpenedAt: number;
};

const getNameFromPath = (filePath: string) => {
  const parts = filePath.split(/[/\\]+/);
  return parts[parts.length - 1] || filePath;
};

const buildProjectFileName = (name: string) => {
  const safe = name.trim() || '未命名项目';
  return `ImgStamp-${safe}.json`;
};

export function Launcher() {
  const [view, setView] = useState<'home' | 'create'>('home');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [projectName, setProjectName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [projectFilePath, setProjectFilePath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const canCreate = projectName.trim().length > 0 && folderPath && projectFilePath;

  useEffect(() => {
    let active = true;
    const loadRecent = async () => {
      try {
        const list = await window.imgstamp.getRecentProjects();
        if (active) {
          setRecentProjects(list ?? []);
        }
      } catch (loadError) {
        console.error(loadError);
      }
    };
    loadRecent();
    return () => {
      active = false;
    };
  }, []);

  const sortedRecent = useMemo(
    () => [...recentProjects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt),
    [recentProjects],
  );

  const handleOpenProject = async () => {
    const path = await window.imgstamp.openProjectFile();
    if (!path) {
      return;
    }
    setDropMessage(null);
    await window.imgstamp.launcherOpenProject(path);
  };

  const handleBrowseFolder = async () => {
    const dir = await window.imgstamp.openDirectory();
    if (!dir) {
      return;
    }
    setFolderPath(dir);
    if (!projectName) {
      setProjectName(getNameFromPath(dir));
    }
    setDropMessage(null);
    setError(null);
  };

  const handlePickProjectFile = async () => {
    const defaultName = buildProjectFileName(projectName || getNameFromPath(folderPath) || '');
    const filePath = await window.imgstamp.saveProjectFile(defaultName);
    if (!filePath) {
      return;
    }
    setProjectFilePath(filePath);
    if (!projectName) {
      const name = getNameFromPath(filePath).replace(/\.json$/i, '') || '未命名项目';
      setProjectName(name);
    }
    setError(null);
  };

  const handleCreateProject = async () => {
    const name = projectName.trim();
    if (!name) {
      setError('请输入项目名称');
      return;
    }
    if (!folderPath) {
      setError('请选择图片文件夹');
      return;
    }
    if (!projectFilePath) {
      setError('请选择项目文件保存位置');
      return;
    }
    setError(null);
    await window.imgstamp.launcherCreateProject({
      name,
      baseDir: folderPath,
      projectPath: projectFilePath,
    });
  };

  const handleOpenRecent = async (item: RecentProject) => {
    if (item.kind === 'project') {
      await window.imgstamp.launcherOpenProject(item.path);
      return;
    }
    const baseDir = item.baseDir || item.path;
    const name = item.name || getNameFromPath(baseDir);
    await window.imgstamp.launcherCreateProject({ name, baseDir });
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    const dropPath = file ? (file as unknown as { path?: string }).path : null;
    if (!dropPath) {
      return;
    }
    if (!dropPath.toLowerCase().endsWith('.json')) {
      setDropMessage('仅支持拖入项目 .json 文件');
      return;
    }
    setDropMessage(null);
    await window.imgstamp.launcherOpenProject(dropPath);
  };

  return (
    <div className="launcher">
      <aside className="launcher__sidebar">
        <div>
          <div className="launcher__brand">ImgStamp</div>
          <div className="launcher__brand-sub">照片整理与标注</div>
        </div>
        <div>
          <div className="launcher__section-title">最近项目</div>
          <div className="recent-list">
            {sortedRecent.length === 0 ? (
              <div className="recent-empty">暂无最近项目</div>
            ) : (
              sortedRecent.map((item) => (
                <button
                  type="button"
                  className="recent-item"
                  key={`${item.kind}:${item.path}`}
                  onClick={() => handleOpenRecent(item)}
                >
                  <div className="recent-item__name">{item.name}</div>
                  <div className="recent-item__path">{item.path}</div>
                </button>
              ))
            )}
          </div>
        </div>
      </aside>

      <main
        className={`launcher__main ${isDragOver ? 'launcher__main--drag' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        <div className="launcher__hero">
          <div className="launcher__logo">
            <img src={logoUrl} alt="ImgStamp" />
          </div>
          <div className="launcher__title">ImgStamp</div>
          <div className="launcher__subtitle">批量加白边与文字标注</div>
        </div>

        <div className="launcher-card">
          {view === 'home' ? (
            <>
              <div className="launcher-card__title">开始一个项目</div>
              <div className="launcher-actions">
                <button className="btn btn--primary" onClick={() => setView('create')}>
                  新建项目
                </button>
                <button className="btn" onClick={handleOpenProject}>
                  打开项目
                </button>
              </div>
              <div className="launcher-hint">拖入项目文件（.json）开始</div>
              {dropMessage ? <div className="launcher-drop">{dropMessage}</div> : null}
            </>
          ) : (
            <>
              <button className="launcher-back" onClick={() => setView('home')}>
                ← 返回
              </button>
              <div className="launcher-card__title">创建项目</div>
              <div className="launcher-form">
                <label className="field">
                  <span>项目名称</span>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(event) => {
                      setProjectName(event.target.value);
                      setError(null);
                    }}
                    placeholder="例如：2025 年春节照片"
                  />
                </label>
                <label className="field">
                  <span>图片文件夹</span>
                  <div className="launcher-row">
                    <input
                      type="text"
                      value={folderPath}
                      onChange={(event) => {
                        setFolderPath(event.target.value);
                        setError(null);
                      }}
                      placeholder="请选择包含图片的文件夹"
                    />
                    <button className="btn" onClick={handleBrowseFolder}>
                      浏览
                    </button>
                  </div>
                </label>
                <label className="field">
                  <span>项目文件</span>
                  <div className="launcher-row">
                    <input
                      type="text"
                      value={projectFilePath}
                      onChange={(event) => {
                        setProjectFilePath(event.target.value);
                        setError(null);
                      }}
                      placeholder="请选择项目文件保存位置"
                    />
                    <button className="btn" onClick={handlePickProjectFile}>
                      浏览
                    </button>
                  </div>
                </label>
                {error ? <div className="launcher-error">{error}</div> : null}
                <div className="launcher-actions">
                  <button
                    className="btn btn--primary"
                    onClick={handleCreateProject}
                    disabled={!canCreate}
                  >
                    创建
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
