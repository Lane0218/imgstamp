import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc';
import { buildAppMenu, setWindowTitle } from './menu';

if (started) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let launcherWindow: BrowserWindow | null = null;
let pendingLaunchPayload: LaunchPayload | null = null;

type LaunchPayload =
  | { type: 'create'; name: string; baseDir: string; projectPath: string }
  | { type: 'open-project'; projectPath: string };

const loadRenderer = (window: BrowserWindow, view: 'main' | 'launcher') => {
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    window.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?view=${view}`);
  } else {
    window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), {
      query: { view },
    });
  }
};

const createMainWindow = () => {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 1100,
    minHeight: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
