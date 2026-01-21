/// <reference types="vite/client" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

type ImgStampApi = {
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
    options: { size: '5' | '6'; mode: 'final' | 'original' },
  ) => Promise<string>;
  openProjectFile: () => Promise<string | null>;
  saveProjectFile: () => Promise<string | null>;
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
    size: '5' | '6',
  ) => Promise<{ exported: number; failed: number; total: number; outputDir: string }>;
  onMenuOpenDirectory: (callback: () => void) => () => void;
  onMenuOpenProject: (callback: () => void) => () => void;
  onMenuSaveProject: (callback: () => void) => () => void;
  onMenuExport: (callback: () => void) => () => void;
  onMenuSetSize: (callback: (size: '5' | '6') => void) => () => void;
  onExportProgress: (
    callback: (payload: { current: number; total: number; filename: string }) => void,
  ) => () => void;
};

interface Window {
  imgstamp: ImgStampApi;
}
