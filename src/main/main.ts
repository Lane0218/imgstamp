import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { registerIpcHandlers } from './ipc';
import { buildAppMenu, setWindowTitle } from './menu';

let mainWindow: BrowserWindow | null = null;
let launcherWindow: BrowserWindow | null = null;
let pendingLaunchPayload: LaunchPayload | null = null;

type LaunchPayload =
  | { type: 'create'; name: string; baseDir: string; projectPath: string }
  | { type: 'open-project'; projectPath: string };

const loadRenderer = (window: BrowserWindow, view: 'main' | 'launcher') => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    const base = devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`;
    window.loadURL(`${base}?view=${view}`);
    return;
  }
  const rendererIndex = path.join(__dirname, '../renderer/index.html');
  window.loadFile(rendererIndex, { query: { view } });
};

const getWindowIcon = () => {
  const iconName =
    process.platform === 'darwin' ? 'icon.icns' : process.platform === 'win32' ? 'icon.ico' : 'icon.png';
  const candidates = [
    path.resolve(__dirname, '../../assets', iconName),
    path.resolve(__dirname, '../../../assets', iconName),
    path.join(process.resourcesPath, 'assets', iconName),
    path.join(app.getAppPath(), 'assets', iconName),
    path.join(process.cwd(), 'assets', iconName),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    return undefined;
  }
  const image = nativeImage.createFromPath(found);
  return image.isEmpty() ? undefined : image;
};

const createMainWindow = () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadRenderer(window, 'main');
  window.on('closed', () => {
    mainWindow = null;
  });
  return window;
};

const createLauncherWindow = () => {
  const window = new BrowserWindow({
    width: 900,
    height: 560,
    minWidth: 820,
    minHeight: 520,
    title: 'ImgStamp',
    icon: getWindowIcon(),
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  loadRenderer(window, 'launcher');
  window.setMenu(null);
  window.on('closed', () => {
    launcherWindow = null;
  });
  return window;
};

const sendLaunchPayload = (payload: LaunchPayload) => {
  if (!mainWindow) {
    return;
  }
  if (payload.type === 'create') {
    mainWindow.webContents.send('launcher:create-project', {
      name: payload.name,
      baseDir: payload.baseDir,
      projectPath: payload.projectPath,
    });
  } else {
    mainWindow.webContents.send('launcher:open-project', payload.projectPath);
  }
};

const openMainWindow = (payload: LaunchPayload) => {
  pendingLaunchPayload = payload;
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.show();
    mainWindow.focus();
    if (mainWindow.webContents.isLoading()) {
      mainWindow.webContents.once('did-finish-load', () => sendLaunchPayload(payload));
    } else {
      sendLaunchPayload(payload);
    }
  } else {
    mainWindow = createMainWindow();
    mainWindow.webContents.once('did-finish-load', () => sendLaunchPayload(payload));
    buildAppMenu(mainWindow);
    setWindowTitle(mainWindow, payload.type === 'create' ? payload.name : '未命名项目');
  }

  if (launcherWindow) {
    launcherWindow.close();
    launcherWindow = null;
  }
};

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.imgstamp.app');
  }
  registerIpcHandlers();
  launcherWindow = createLauncherWindow();

  ipcMain.handle(
    'launcher:create-project',
    async (_event, payload: { name: string; baseDir: string; projectPath: string }) => {
      if (!payload?.baseDir || !payload?.projectPath) {
        throw new Error('参数不能为空');
      }
      openMainWindow({
        type: 'create',
        name: payload.name || '未命名项目',
        baseDir: payload.baseDir,
        projectPath: payload.projectPath,
      });
      return true;
    },
  );

  ipcMain.handle('launcher:open-project', async (_event, projectPath: string) => {
    if (!projectPath) {
      throw new Error('projectPath 不能为空');
    }
    openMainWindow({ type: 'open-project', projectPath });
    return true;
  });

  ipcMain.handle('launcher:get-payload', async () => {
    const payload = pendingLaunchPayload;
    pendingLaunchPayload = null;
    return payload;
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      launcherWindow = createLauncherWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
