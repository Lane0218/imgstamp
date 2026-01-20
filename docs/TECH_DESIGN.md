# ImgStamp 技术设计文档 (TECH_DESIGN)

## 1. 技术栈选择

基于“易上手”、“Web生态”、“本地处理”的原则，选用以下技术栈：

- **应用框架**: Electron + electron-forge
- **前端框架**: React + TypeScript + Vite
- **UI 组件库**: Ant Design
- **状态管理**: Zustand (轻量级，适合本项目规模)
- **图片处理**: Sharp (Node.js 高性能图片处理库)
- **EXIF 读取**: exifr
- **数据存储**: 直接读写 JSON 文件（主进程负责读写 + 原子写入）

## 2. 架构概览

### 2.1 进程模型
- **Main Process (主进程)**:
    - 负责系统原生交互（文件选择对话框）。
    - 负责繁重的 I/O 操作（图片读取、EXIF 解析、最终图片生成）。
    - 管理应用生命周期和窗口。
- **Renderer Process (渲染进程)**:
    - 负责 UI 展示。
    - 处理用户输入（表单填写、选择照片）。
    - 通过 IPC (Inter-Process Communication) 与主进程通信。

### 2.2 IPC 通信设计
主要通信信道：
- `dialog:openDirectory`: 请求选择文件夹。
- `image:scan`: 扫描目录图片并返回列表。
- `image:readExif`: 读取指定图片的 EXIF 信息。
- `project:save`: 保存项目状态到 JSON（主进程原子写）。
- `project:load`: 读取项目 JSON（主进程读）。
- `export:start`: 开始批量导出任务。
- `export:progress`: 导出进度回调。

## 3. 核心模块设计

### 3.1 数据结构 (Project Schema)
项目文件 (`project.json`) 结构示例：

```json
{
  "version": "1.0",
  "name": "2023年度整理",
  "baseDir": "/Users/me/Photos/2023",
  "photos": [
    {
      "id": "uuid-v4",
      "filename": "IMG_001.JPG",
      "relativePath": "./IMG_001.JPG",
      "selected": true,
      "status": "ready", // incomplete, ready, exported
      "meta": {
        "date": "2023-01-20 10:00:00", // 本地时间字符串（不做时区转换）
        "location": "上海",
        "description": "春节聚餐"
      }
    }
  ]
}
```

### 3.2 图片导入流程
1. 用户点击“导入文件夹”。
2. 主进程遍历目录，过滤 `['.jpg', '.jpeg', '.png']`（忽略大小写）。
3. 主进程先返回基础图片列表，再通过队列异步读取 EXIF（主要关注 `DateTimeOriginal`）。
4. 若无 EXIF，`date` 字段留空。
5. 返回元数据列表给渲染进程，React 渲染列表。

### 3.3 图片生成流程 (基于 Sharp)
预览图生成流程：
1. **统一布局参数**：所有尺寸（边距/字号/文本位置）以最终导出尺寸为基准计算。
2. **缩放预览**：设定 `scale`（如 0.3~0.5），将导出尺寸与布局参数按比例缩小。
3. **合成预览**：使用 Sharp 按缩小尺寸生成预览图（流程与导出一致）。
4. **用途**：用于中间预览区与导出弹窗预览，保证与最终导出一致。

导出时的单个任务流程：
1. **读取**: `sharp(originalPath)`
2. **缩放/调整**: 根据目标尺寸（如 6寸 300dpi: 1800x1200）调整原图大小，保持比例，留出边框空间。
3. **合成**:
    - 创建一个纯白背景的 `sharp` 画布。
    - 将原图 composite 到画布中央。
    - 使用 SVG 模板生成文字层（包含日期、地点、描述；描述仅单行）。
    - 将 SVG 文字层 composite 到画布底部留白区。
4. **输出**: 保存为 JPG/PNG 到导出目录。

### 3.4 目录结构规划
```
imgstamp/
├── src/
│   ├── main/           # Electron 主进程代码
│   │   ├── main.ts
│   │   ├── ipc.ts      # IPC 处理逻辑
│   │   └── image-processor.ts # 图片处理核心逻辑 (Sharp)
│   ├── renderer/       # React 渲染进程代码
│   │   ├── components/ # UI 组件
│   │   ├── store/      # Zustand store
│   │   └── App.tsx
│   └── types/          # 共享类型定义
├── package.json
└── tsconfig.json
```

## 4. 关键技术难点与对策

### 4.1 性能问题
- **问题**: 数百张高清大图同时加载可能导致内存溢出或界面卡顿。
- **对策**:
    - 列表视图仅加载缩略图（Electron 可通过 nativeImage 生成缩略图，或 sharp 生成缓存）。
    - 导出任务使用队列机制（`p-queue`），限制并发数（如每次只处理 2-4 张）。

### 4.2 文字排版
- **问题**: Sharp 原生绘图 API 较弱，难以处理复杂的文字排版。
- **对策**: 使用 SVG 编写文字布局（单行描述，无需自动换行），然后 `Buffer.from(svgString)` 作为一个图层叠加到图片上。

### 4.3 HEIC 格式支持
- **说明**: 当前版本不支持 HEIC，仅支持 JPG/PNG。
