import { contextBridge, ipcRenderer } from 'electron';

const api = {
  openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  saveProject: (projectPath: string, data: unknown) =>
    ipcRenderer.invoke('project:save', { projectPath, data }),
  loadProject: (projectPath: string) =>
    ipcRenderer.invoke('project:load', projectPath),
};

contextBridge.exposeInMainWorld('imgstamp', api);
