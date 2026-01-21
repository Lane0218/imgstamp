import { BrowserWindow, Menu } from 'electron';

type ExportSize = '5' | '5L' | '6' | '6L';

let currentSize: ExportSize = '5L';

function sendToRenderer(mainWindow: BrowserWindow | null, channel: string, payload?: unknown) {
  if (!mainWindow) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

export function setWindowTitle(mainWindow: BrowserWindow | null, projectName: string): void {
  if (!mainWindow) {
    return;
  }
  const title = projectName ? `ImgStamp - ${projectName}` : 'ImgStamp';
  mainWindow.setTitle(title);
}

export function buildAppMenu(mainWindow: BrowserWindow | null): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '打开文件夹',
          accelerator: 'CmdOrCtrl+O',
          click: () => sendToRenderer(mainWindow, 'menu:open-directory'),
        },
        {
          label: '打开项目',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => sendToRenderer(mainWindow, 'menu:open-project'),
        },
        {
          label: '保存项目',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToRenderer(mainWindow, 'menu:save-project'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '导出',
      submenu: [
        {
          label: '目标尺寸',
          submenu: [
            {
              label: '5 寸 (12.7x8.9cm)',
              type: 'radio',
              checked: currentSize === '5',
              click: () => {
                currentSize = '5';
                sendToRenderer(mainWindow, 'menu:set-size', currentSize);
                buildAppMenu(mainWindow);
              },
            },
            {
              label: '大 5 寸 (12.7x9.5cm)',
              type: 'radio',
              checked: currentSize === '5L',
              click: () => {
                currentSize = '5L';
                sendToRenderer(mainWindow, 'menu:set-size', currentSize);
                buildAppMenu(mainWindow);
              },
            },
            {
              label: '6 寸 (15.2x10.2cm)',
              type: 'radio',
              checked: currentSize === '6',
              click: () => {
                currentSize = '6';
                sendToRenderer(mainWindow, 'menu:set-size', currentSize);
                buildAppMenu(mainWindow);
              },
            },
            {
              label: '大 6 寸 (15.2x11.4cm)',
              type: 'radio',
              checked: currentSize === '6L',
              click: () => {
                currentSize = '6L';
                sendToRenderer(mainWindow, 'menu:set-size', currentSize);
                buildAppMenu(mainWindow);
              },
            },
          ],
        },
        { type: 'separator' },
        {
          label: '导出成品',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToRenderer(mainWindow, 'menu:export'),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
