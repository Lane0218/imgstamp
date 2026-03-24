import { useEffect, useMemo, useState } from 'react';
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
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    setError(null);
    try {
      const path = await window.imgstamp.openProjectFile();
      if (!path) {
        return;
      }
      setIsSubmitting(true);
      await window.imgstamp.diagnosticLog('launcher open project file', { path });
      await window.imgstamp.launcherOpenProject(path);
    } catch (openError) {
      console.error(openError);
      setError(openError instanceof Error ? openError.message : '打开项目失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBrowseFolder = async () => {
    try {
      const dir = await window.imgstamp.openDirectory();
      if (!dir) {
        return;
      }
      setFolderPath(dir);
      if (!projectName) {
        setProjectName(getNameFromPath(dir));
      }
      setError(null);
    } catch (browseError) {
      console.error(browseError);
      setError(browseError instanceof Error ? browseError.message : '选择文件夹失败');
    }
  };

  const handlePickProjectFile = async () => {
    try {
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
    } catch (pickError) {
      console.error(pickError);
      setError(pickError instanceof Error ? pickError.message : '选择项目文件失败');
    }
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
    setIsSubmitting(true);
    try {
      await window.imgstamp.diagnosticLog('launcher create project', {
        name,
        baseDir: folderPath,
        projectPath: projectFilePath,
      });
      await window.imgstamp.launcherCreateProject({
        name,
        baseDir: folderPath,
        projectPath: projectFilePath,
      });
    } catch (createError) {
      console.error(createError);
      setError(createError instanceof Error ? createError.message : '创建项目失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenRecent = async (item: RecentProject) => {
    setError(null);
    setIsSubmitting(true);
    try {
      await window.imgstamp.diagnosticLog('launcher open recent', item);
      if (item.kind === 'project') {
        await window.imgstamp.launcherOpenProject(item.path);
        return;
      }
      throw new Error('最近目录项目暂不支持直接打开，请通过项目文件进入');
    } catch (openError) {
      console.error(openError);
      setError(openError instanceof Error ? openError.message : '打开最近项目失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="launcher">
      <aside className="launcher__sidebar">
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
                disabled={isSubmitting}
                onClick={() => handleOpenRecent(item)}
              >
                <div className="recent-item__name">{item.name}</div>
                <div className="recent-item__path">{item.path}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="launcher__main">
        <div className="launcher__hero">
          <div className="launcher__logo">
            <img src={logoUrl} alt="ImgStamp" />
          </div>
        </div>

        <div className="launcher-card">
          {view === 'home' ? (
            <>
              <div className="launcher-card__title">开始一个项目</div>
              <div className="launcher-actions">
                <button
                  className="btn btn--primary btn--hero btn--wide"
                  disabled={isSubmitting}
                  onClick={() => setView('create')}
                >
                  <span className="btn__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <rect x="3" y="4" width="18" height="14" rx="2" />
                      <path d="M12 8v6" />
                      <path d="M9 11h6" />
                    </svg>
                  </span>
                  <span className="btn__label">新建项目</span>
                </button>
                <button
                  className="btn btn--primary btn--primary-soft btn--hero btn--wide"
                  disabled={isSubmitting}
                  onClick={handleOpenProject}
                >
                  <span className="btn__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 6h6l2 2h8" />
                      <path d="M4 8h16a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
                    </svg>
                  </span>
                  <span className="btn__label">打开项目</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <button className="launcher-back" onClick={() => setView('home')} disabled={isSubmitting}>
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
                    <button className="btn" onClick={handleBrowseFolder} disabled={isSubmitting}>
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
                    <button className="btn" onClick={handlePickProjectFile} disabled={isSubmitting}>
                      浏览
                    </button>
                  </div>
                </label>
                {error ? <div className="launcher-error">{error}</div> : null}
                <div className="launcher-actions">
                  <button
                    className="btn btn--primary"
                    onClick={handleCreateProject}
                    disabled={!canCreate || isSubmitting}
                  >
                    {isSubmitting ? '处理中...' : '创建'}
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
