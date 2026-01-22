import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';

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

export function Launcher() {
  const [view, setView] = useState<'home' | 'create'>('home');
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [projectName, setProjectName] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const canCreate = projectName.trim().length > 0 && folderPath;

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
    setError(null);
    await window.imgstamp.launcherCreateProject({ name, baseDir: folderPath });
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
    const name = getNameFromPath(dropPath);
    await window.imgstamp.launcherCreateProject({ name, baseDir: dropPath });
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
          <div className="launcher__logo">IS</div>
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
              <div className="launcher-hint">拖入文件夹开始</div>
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
