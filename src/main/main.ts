import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { registerIpcHandlers } from './ipc';
import { getLogPath, logError, logInfo } from './logger';
import { buildAppMenu, setWindowTitle } from './menu';

let mainWindow: BrowserWindow | null = null;
let launcherWindow: BrowserWindow | null = null;
let pendingLaunchPayload: LaunchPayload | null = null;
const isDev = !app.isPackaged;

type LaunchPayload =
  | { type: 'create'; name: string; baseDir: string; projectPath: string }
  | { type: 'open-project'; projectPath: string };

const loadRenderer = (window: BrowserWindow, view: 'main' | 'launcher') => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  logInfo('加载渲染页面', { view, hasDevServerUrl: Boolean(devServerUrl) });
  if (devServerUrl) {
    const base = devServerUrl.endsWith('/') ? devServerUrl : `${devServerUrl}/`;
    window.loadURL(`${base}?view=${view}`);
    return;
  }
  const rendererIndex = path.join(__dirname, '../renderer/index.html');
  window.loadFile(rendererIndex, { query: { view } });
};

const bindDevToolsShortcut = (window: BrowserWindow) => {
  if (!isDev) {
    return;
  }
  window.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && !input.alt && !input.control && !input.meta && !input.shift) {
      event.preventDefault();
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools({ mode: 'detach' });
      }
    }
  });
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
  logInfo('创建主窗口');
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
  bindDevToolsShortcut(window);
  window.on('unresponsive', () => {
    logError('主窗口无响应');
  });
  window.on('responsive', () => {
    logInfo('主窗口恢复响应');
  });
  window.on('closed', () => {
    logInfo('主窗口关闭');
    mainWindow = null;
  });
  return window;
};

const createLauncherWindow = () => {
  logInfo('创建启动窗口');
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
  bindDevToolsShortcut(window);
  window.setMenu(null);
  window.on('unresponsive', () => {
    logError('启动窗口无响应');
  });
  window.on('responsive', () => {
    logInfo('启动窗口恢复响应');
  });
  window.on('closed', () => {
    logInfo('启动窗口关闭');
    launcherWindow = null;
  });
  return window;
};

const sendLaunchPayload = (payload: LaunchPayload) => {
  if (!mainWindow) {
    logError('发送启动载荷失败，主窗口不存在', payload);
    return;
  }
  logInfo('发送启动载荷到主窗口', payload);
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
  logInfo('请求打开主窗口', payload);
  pendingLaunchPayload = payload;
  if (mainWindow) {
    logInfo('复用现有主窗口', { isLoading: mainWindow.webContents.isLoading() });
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
    mainWindow.webContents.on('did-finish-load', () => {
      logInfo('主窗口 did-finish-load');
    });
    buildAppMenu(mainWindow);
    setWindowTitle(mainWindow, payload.type === 'create' ? payload.name : '未命名项目');
  }

  if (launcherWindow) {
    logInfo('关闭启动窗口');
    launcherWindow.close();
    launcherWindow = null;
  }
};

app.whenReady().then(() => {
  logInfo('应用 ready', { logPath: getLogPath(), isPackaged: app.isPackaged });
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.imgstamp.app');
  }
  registerIpcHandlers();
  launcherWindow = createLauncherWindow();

  ipcMain.handle(
    'launcher:create-project',
    async (_event, payload: { name: string; baseDir: string; projectPath: string }) => {
      logInfo('收到 launcher:create-project', payload);
      if (!payload?.baseDir || !payload?.projectPath) {
        logError('launcher:create-project 参数缺失', payload);
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
    logInfo('收到 launcher:open-project', { projectPath });
    if (!projectPath) {
      logError('launcher:open-project 参数缺失');
      throw new Error('projectPath 不能为空');
    }
    openMainWindow({ type: 'open-project', projectPath });
    return true;
  });

  ipcMain.handle('launcher:get-payload', async () => {
    const payload = pendingLaunchPayload;
    pendingLaunchPayload = null;
    logInfo('主窗口获取启动载荷', payload);
    return payload;
  });

  app.on('activate', () => {
    logInfo('应用 activate');
    if (BrowserWindow.getAllWindows().length === 0) {
      launcherWindow = createLauncherWindow();
    }
  });

  app.on('render-process-gone', (_event, webContents, details) => {
    logError('渲染进程退出', {
      reason: details.reason,
      exitCode: details.exitCode,
      url: webContents.getURL(),
    });
  });

  app.on('child-process-gone', (_event, details) => {
    logError('子进程退出', details);
  });
}).catch((error) => {
  logError('应用启动失败', error);
});

app.on('window-all-closed', () => {
  logInfo('所有窗口已关闭');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (error) => {
  logError('未捕获异常', error);
});

process.on('unhandledRejection', (reason) => {
  logError('未处理 Promise 拒绝', reason);
});
