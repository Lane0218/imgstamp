/// <reference types="vite/client" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

type ImgStampApi = {
  openDirectory: () => Promise<string | null>;
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
  openProjectFile: () => Promise<string | null>;
  saveProjectFile: () => Promise<string | null>;
  saveProject: (projectPath: string, data: unknown) => Promise<boolean>;
  loadProject: (projectPath: string) => Promise<unknown>;
  onMenuOpenDirectory: (callback: () => void) => () => void;
  onMenuOpenProject: (callback: () => void) => () => void;
  onMenuSaveProject: (callback: () => void) => () => void;
  onMenuExport: (callback: () => void) => () => void;
  onMenuSetSize: (callback: (size: '5' | '6') => void) => () => void;
};

interface Window {
  imgstamp: ImgStampApi;
}
