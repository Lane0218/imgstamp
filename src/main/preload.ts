import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getRecentProjects: () => ipcRenderer.invoke('recent:list'),
  addRecentProject: (entry: {
    name: string;
    kind: 'folder' | 'project';
    path: string;
    baseDir: string;
  }) => ipcRenderer.invoke('recent:add', entry),
  launcherCreateProject: (payload: { name: string; baseDir: string }) =>
    ipcRenderer.invoke('launcher:create-project', payload),
  launcherOpenProject: (projectPath: string) =>
    ipcRenderer.invoke('launcher:open-project', projectPath),
  getLaunchPayload: () => ipcRenderer.invoke('launcher:get-payload'),
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  openExportDirectory: () => ipcRenderer.invoke('dialog:openExportDirectory'),
  openPath: (targetPath: string) => ipcRenderer.invoke('system:openPath', targetPath),
  scanImages: (baseDir: string) => ipcRenderer.invoke('image:scan', baseDir),
  getThumbnail: (baseDir: string, relativePath: string, size: number) =>
    ipcRenderer.invoke('image:thumbnail', baseDir, relativePath, size),
  readExifDate: (baseDir: string, relativePath: string) =>
    ipcRenderer.invoke('image:readExifDate', baseDir, relativePath),
  getPreview: (
    baseDir: string,
    relativePath: string,
    meta: { date: string | null; location: string; description: string },
    options: { size: '5' | '5L' | '6' | '6L'; mode: 'final' | 'original' },
  ) => ipcRenderer.invoke('image:preview', baseDir, relativePath, meta, options),
  openProjectFile: () => ipcRenderer.invoke('dialog:openProjectFile'),
  saveProjectFile: () => ipcRenderer.invoke('dialog:saveProjectFile'),
  saveProject: (projectPath: string, data: unknown) =>
    ipcRenderer.invoke('project:save', { projectPath, data }),
  loadProject: (projectPath: string) =>
    ipcRenderer.invoke('project:load', projectPath),
  startExport: (
    baseDir: string,
    exportDir: string,
    items: Array<{
      relativePath: string;
      filename: string;
      meta: { date: string | null; location: string; description: string };
    }>,
    size: '5' | '5L' | '6' | '6L',
  ) =>
    ipcRenderer.invoke('export:start', {
      baseDir,
      exportDir,
      size,
      items,
    }),
  onMenuOpenDirectory: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu:open-directory', listener);
    return () => ipcRenderer.removeListener('menu:open-directory', listener);
  },
  onMenuOpenProject: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu:open-project', listener);
    return () => ipcRenderer.removeListener('menu:open-project', listener);
  },
  onMenuSaveProject: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu:save-project', listener);
    return () => ipcRenderer.removeListener('menu:save-project', listener);
  },
  onMenuExport: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu:export', listener);
    return () => ipcRenderer.removeListener('menu:export', listener);
  },
  onMenuSetSize: (callback: (size: '5' | '5L' | '6' | '6L') => void) => {
    const listener = (_event: unknown, size: '5' | '5L' | '6' | '6L') => callback(size);
    ipcRenderer.on('menu:set-size', listener);
    return () => ipcRenderer.removeListener('menu:set-size', listener);
  },
  onLauncherCreateProject: (callback: (payload: { name: string; baseDir: string }) => void) => {
    const listener = (_event: unknown, payload: { name: string; baseDir: string }) =>
      callback(payload);
    ipcRenderer.on('launcher:create-project', listener);
    return () => ipcRenderer.removeListener('launcher:create-project', listener);
  },
  onLauncherOpenProject: (callback: (projectPath: string) => void) => {
    const listener = (_event: unknown, projectPath: string) => callback(projectPath);
    ipcRenderer.on('launcher:open-project', listener);
    return () => ipcRenderer.removeListener('launcher:open-project', listener);
  },
  onExportProgress: (
    callback: (payload: { current: number; total: number; filename: string }) => void,
  ) => {
    const listener = (
      _event: unknown,
      payload: { current: number; total: number; filename: string },
    ) => callback(payload);
    ipcRenderer.on('export:progress', listener);
    return () => ipcRenderer.removeListener('export:progress', listener);
  },
  setWindowTitle: (projectName: string) => ipcRenderer.invoke('app:setTitle', projectName),
};

contextBridge.exposeInMainWorld('imgstamp', api);
