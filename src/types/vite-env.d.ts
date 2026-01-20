/// <reference types="vite/client" />

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

type ImgStampApi = {
  openDirectory: () => Promise<string | null>;
  saveProject: (projectPath: string, data: unknown) => Promise<boolean>;
  loadProject: (projectPath: string) => Promise<unknown>;
};

interface Window {
  imgstamp: ImgStampApi;
}
