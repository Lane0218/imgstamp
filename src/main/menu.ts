import { app, BrowserWindow, Menu, dialog } from 'electron';

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
  const showMessage = (options: Electron.MessageBoxOptions) => {
    if (!mainWindow) {
      return;
    }
    void dialog.showMessageBox(mainWindow, options);
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '项目',
      submenu: [
        {
          label: '新建项目',
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
      label: '帮助',
      submenu: [
        {
          label: '关于 ImgStamp',
          click: () =>
            showMessage({
              type: 'info',
              title: '关于 ImgStamp',
              message: 'ImgStamp',
              detail: `版本 ${app.getVersion()}\n本地照片批量加白边与文字标注工具。`,
            }),
        },
        {
          label: '快捷键',
          click: () =>
            showMessage({
              type: 'info',
              title: '快捷键',
              message: '常用快捷键',
              detail:
                'Ctrl/Cmd + O：新建项目（打开文件夹）\n' +
                'Ctrl/Cmd + Shift + O：打开项目\n' +
                'Ctrl/Cmd + S：保存项目\n' +
                '← / →：切换选中图片\n' +
                'Space：标记/取消标记选中',
            }),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
