import { contextBridge, ipcRenderer } from 'electron';

const api = {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  scanImages: (baseDir: string) => ipcRenderer.invoke('image:scan', baseDir),
  getThumbnail: (baseDir: string, relativePath: string, size: number) =>
    ipcRenderer.invoke('image:thumbnail', baseDir, relativePath, size),
  readExifDate: (baseDir: string, relativePath: string) =>
    ipcRenderer.invoke('image:readExifDate', baseDir, relativePath),
  getPreview: (
    baseDir: string,
    relativePath: string,
    meta: { date: string | null; location: string; description: string },
    options: { size: '5' | '6'; mode: 'final' | 'original' },
  ) => ipcRenderer.invoke('image:preview', baseDir, relativePath, meta, options),
  openProjectFile: () => ipcRenderer.invoke('dialog:openProjectFile'),
  saveProjectFile: () => ipcRenderer.invoke('dialog:saveProjectFile'),
  saveProject: (projectPath: string, data: unknown) =>
    ipcRenderer.invoke('project:save', { projectPath, data }),
  loadProject: (projectPath: string) =>
    ipcRenderer.invoke('project:load', projectPath),
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
  onMenuSetSize: (callback: (size: '5' | '6') => void) => {
    const listener = (_event: unknown, size: '5' | '6') => callback(size);
    ipcRenderer.on('menu:set-size', listener);
    return () => ipcRenderer.removeListener('menu:set-size', listener);
  },
};

contextBridge.exposeInMainWorld('imgstamp', api);
