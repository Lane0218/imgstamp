/// <reference types="vite/client" />

declare namespace NodeJS {
  interface ProcessEnv {
    VITE_DEV_SERVER_URL?: string;
  }
}

type ImgStampApi = {
  getRecentProjects: () => Promise<
    Array<{
      name: string;
      kind: 'folder' | 'project';
      path: string;
      baseDir: string;
      lastOpenedAt: number;
    }>
  >;
  addRecentProject: (entry: {
    name: string;
    kind: 'folder' | 'project';
    path: string;
    baseDir: string;
  }) => Promise<boolean>;
  launcherCreateProject: (payload: { name: string; baseDir: string; projectPath: string }) => Promise<boolean>;
  launcherOpenProject: (projectPath: string) => Promise<boolean>;
  getLaunchPayload: () => Promise<
    | { type: 'create'; name: string; baseDir: string; projectPath: string }
    | { type: 'open-project'; projectPath: string }
    | null
  >;
  openDirectory: () => Promise<string | null>;
  openExportDirectory: () => Promise<string | null>;
  openPath: (targetPath: string) => Promise<string>;
  scanImages: (baseDir: string) => Promise<
    Array<{
      id: string;
      filename: string;
      relativePath: string;
      fileUrl: string;
    }>
  >;
  getThumbnail: (baseDir: string, relativePath: string, size: number) => Promise<string>;
  readExifDate: (baseDir: string, relativePath: string) => Promise<string | null>;
  getPreview: (
    baseDir: string,
    relativePath: string,
    meta: { date: string | null; location: string; description: string },
    options: { size: '5' | '5L' | '6' | '6L'; mode: 'final' | 'original' },
  ) => Promise<string>;
  openProjectFile: () => Promise<string | null>;
  saveProjectFile: (defaultName?: string) => Promise<string | null>;
  saveProject: (projectPath: string, data: unknown) => Promise<boolean>;
  loadProject: (projectPath: string) => Promise<unknown>;
  startExport: (
    baseDir: string,
    exportDir: string,
    items: Array<{
      relativePath: string;
      filename: string;
      meta: { date: string | null; location: string; description: string };
    }>,
    size: '5' | '5L' | '6' | '6L',
  ) => Promise<{ exported: number; failed: number; total: number; outputDir: string }>;
  onMenuOpenDirectory: (callback: () => void) => () => void;
  onMenuOpenProject: (callback: () => void) => () => void;
  onMenuSaveProject: (callback: () => void) => () => void;
  onMenuExport: (callback: () => void) => () => void;
  onMenuSetSize: (callback: (size: '5' | '5L' | '6' | '6L') => void) => () => void;
  onMenuAbout: (
    callback: (payload: { title: string; subtitle?: string; lines: string[] }) => void,
  ) => () => void;
  onMenuShortcuts: (
    callback: (payload: { title: string; subtitle?: string; lines: string[] }) => void,
  ) => () => void;
  onExportProgress: (
    callback: (payload: { current: number; total: number; filename: string }) => void,
  ) => () => void;
  onLauncherCreateProject: (callback: (payload: { name: string; baseDir: string; projectPath: string }) => void) => () => void;
  onLauncherOpenProject: (callback: (projectPath: string) => void) => () => void;
  setWindowTitle: (projectName: string) => Promise<void>;
};

interface Window {
  imgstamp: ImgStampApi;
}
