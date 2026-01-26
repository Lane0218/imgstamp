import { app, BrowserWindow, Menu } from 'electron';

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
          label: '关于',
          click: () =>
            sendToRenderer(mainWindow, 'menu:about', {
              title: '关于',
              subtitle: 'ImgStamp',
              lines: [
                `版本 ${app.getVersion()}`,
                'ImgStamp：一款个人离线照片整理工具，用于批量为精选照片添加白边与日期/地点/描述标注并导出成品图',
                '开发者：Lane',
                '邮箱：laneljc@qq.com',
                '项目主页：https://github.com/Lane0218/imgstamp',
                '个人主页：https://www.laneljc.cn/',
              ],
            }),
        },
        {
          label: '快捷键',
          click: () =>
            sendToRenderer(mainWindow, 'menu:shortcuts', {
              title: '快捷键',
              subtitle: '常用快捷键',
              lines: [
                'Ctrl/Cmd + O：新建项目（打开文件夹）',
                'Ctrl/Cmd + Shift + O：打开项目',
                'Ctrl/Cmd + S：保存项目',
                'Ctrl/Cmd + Enter：开始导出',
                '← / →：切换选中图片',
                'Space：标记/取消标记选中',
              ],
            }),
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
