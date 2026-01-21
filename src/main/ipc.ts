import { app, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import exifr from 'exifr';

type SaveProjectPayload = {
  projectPath: string;
  data: unknown;
};

type ExportPayload = {
  baseDir: string;
  exportDir: string;
  size: '5' | '6';
  items: Array<{
    relativePath: string;
    filename: string;
    meta: { date: string | null; location: string; description: string };
  }>;
};

type ScanResult = {
  id: string;
  filename: string;
  relativePath: string;
  fileUrl: string;
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);
const EXPORT_SIZE_PX = {
  '5': { width: 1500, height: 1050 },
  '6': { width: 1800, height: 1200 },
} as const;

function formatExportFolderName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  return `ImgStamp导出-${yyyy}${mm}${dd}-${hh}${min}`;
}

async function ensureUniqueDir(basePath: string): Promise<string> {
  let candidate = basePath;
  let counter = 1;
  while (true) {
    try {
      await fs.access(candidate);
      candidate = `${basePath}-${counter}`;
      counter += 1;
    } catch {
      break;
    }
  }
  await fs.mkdir(candidate, { recursive: true });
  return candidate;
}

async function scanImages(baseDir: string): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  const walk = async (dir: string) => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) {
        continue;
      }
      results.push({
        id: randomUUID(),
        filename: entry.name,
        relativePath: path.relative(baseDir, fullPath),
        fileUrl: pathToFileURL(fullPath).toString(),
      });
    }
  };

  await walk(baseDir);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

function formatExifDate(value: Date | string | number | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildPreviewSvg(
  date: string | null,
  location: string,
  description: string,
  width: number,
  height: number,
  textAreaTop: number,
) {
  const padding = Math.max(24, Math.round(width * 0.04));
  const fontSize = Math.round(width * 0.028);
  const textY = textAreaTop + padding + fontSize;
  const safe = (value: string) =>
    value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const dateText = date ? safe(date) : '';
  const locationText = location ? safe(location) : '';
  const descText = description ? safe(description) : '';
  const line = [dateText, locationText, descText].filter(Boolean).join(' · ');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">\n  <style>\n    .label { font-family: "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; fill: #111827; font-size: ${fontSize}px; }\n  </style>\n  <text class="label" x="${padding}" y="${textY}">${line}</text>\n</svg>`;
}

async function buildStampedImage(
  sourcePath: string,
  meta: { date: string | null; location: string; description: string },
  size: { width: number; height: number },
  options: { includeText: boolean; format: 'jpeg' | 'png'; quality?: number },
) {
  const textAreaHeight = options.includeText ? Math.round(size.height * 0.18) : 0;
  const imageAreaHeight = size.height - textAreaHeight;

  const base = sharp({
    create: {
      width: size.width,
      height: size.height,
      channels: 3,
      background: '#ffffff',
    },
  });

  const resized = await sharp(sourcePath)
    .resize(size.width, imageAreaHeight, { fit: 'contain', background: '#ffffff' })
    .toBuffer();

  const overlays = [{ input: resized, top: 0, left: 0 }];
  if (options.includeText) {
    const svg = buildPreviewSvg(
      meta.date,
      meta.location,
      meta.description,
      size.width,
      size.height,
      imageAreaHeight,
    );
    overlays.push({ input: Buffer.from(svg), top: 0, left: 0 });
  }

  const output = base.composite(overlays);
  if (options.format === 'png') {
    return output.png().toBuffer();
  }
  return output.jpeg({ quality: options.quality ?? 90 }).toBuffer();
}

async function buildPreviewImage(
  sourcePath: string,
  meta: { date: string | null; location: string; description: string },
  options: { size: '5' | '6'; mode: 'final' | 'original' },
) {
  const exportSize = EXPORT_SIZE_PX[options.size] ?? EXPORT_SIZE_PX['5'];
  const previewWidth = 900;
  const scale = previewWidth / exportSize.width;
  const previewSize = {
    width: previewWidth,
    height: Math.round(exportSize.height * scale),
  };

  return buildStampedImage(sourcePath, meta, previewSize, {
    includeText: options.mode === 'final',
    format: 'jpeg',
    quality: 85,
  });
}

async function getThumbnailPath(
  baseDir: string,
  relativePath: string,
  size: number,
): Promise<{ sourcePath: string; thumbPath: string }> {
  const cacheDir = path.join(app.getPath('userData'), 'imgstamp-cache');
  await fs.mkdir(cacheDir, { recursive: true });
  const key = createHash('sha1').update(`${baseDir}|${relativePath}|${size}|v2`).digest('hex');
  const thumbPath = path.join(cacheDir, `${key}.jpg`);
  const sourcePath = path.join(baseDir, relativePath);
  return { sourcePath, thumbPath };
}

async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `${path.basename(filePath)}.tmp`);
  const payload = JSON.stringify(data, null, 2);

  await fs.writeFile(tempPath, payload, 'utf-8');
  await fs.rm(filePath, { force: true });
  await fs.rename(tempPath, filePath);
}

export function registerIpcHandlers(): void {
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('dialog:openExportDirectory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('system:openPath', async (_event, targetPath: string) => {
    if (!targetPath) {
      throw new Error('路径不能为空');
    }
    return shell.openPath(targetPath);
  });

  ipcMain.handle('image:scan', async (_event, baseDir: string) => {
    if (!baseDir) {
      throw new Error('baseDir 不能为空');
    }

    return scanImages(baseDir);
  });

  ipcMain.handle(
    'image:thumbnail',
    async (_event, baseDir: string, relativePath: string, size: number) => {
      if (!baseDir || !relativePath) {
        throw new Error('参数不能为空');
      }

      const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : 256;
      const { sourcePath, thumbPath } = await getThumbnailPath(baseDir, relativePath, safeSize);
      const outputMime = 'image/jpeg';

      try {
        const cached = await fs.readFile(thumbPath);
        return `data:${outputMime};base64,${cached.toString('base64')}`;
      } catch {
        // ignore
      }

      try {
        const buffer = await sharp(sourcePath)
          .resize(safeSize, safeSize, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toBuffer();
        await fs.writeFile(thumbPath, buffer);
        return `data:${outputMime};base64,${buffer.toString('base64')}`;
      } catch (error) {
        console.error(error);
        try {
          const ext = path.extname(sourcePath).toLowerCase();
          const fallbackMime = ext === '.png' ? 'image/png' : 'image/jpeg';
          const buffer = await fs.readFile(sourcePath);
          return `data:${fallbackMime};base64,${buffer.toString('base64')}`;
        } catch (readError) {
          console.error(readError);
          return '';
        }
      }
    },
  );

  ipcMain.handle('image:readExifDate', async (_event, baseDir: string, relativePath: string) => {
    if (!baseDir || !relativePath) {
      throw new Error('参数不能为空');
    }
    const sourcePath = path.join(baseDir, relativePath);
    try {
      const data = await exifr.parse(sourcePath, { translateValues: false });
      return formatExifDate(data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate);
    } catch (error) {
      console.error(error);
      return null;
    }
  });

  ipcMain.handle(
    'image:preview',
    async (
      _event,
      baseDir: string,
      relativePath: string,
      meta: { date: string | null; location: string; description: string },
      options: { size: '5' | '6'; mode: 'final' | 'original' },
    ) => {
      if (!baseDir || !relativePath) {
        throw new Error('参数不能为空');
      }
      const sourcePath = path.join(baseDir, relativePath);
      try {
        if (options.mode === 'original') {
          const ext = path.extname(sourcePath).toLowerCase();
          const mime = ext === '.png' ? 'image/png' : 'image/jpeg';
          const buffer = await fs.readFile(sourcePath);
          return `data:${mime};base64,${buffer.toString('base64')}`;
        }
        const buffer = await buildPreviewImage(sourcePath, meta, options);
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
      } catch (error) {
        console.error(error);
        return '';
      }
    },
  );

  ipcMain.handle('export:start', async (event, payload: ExportPayload) => {
    if (!payload?.baseDir || !payload?.exportDir) {
      throw new Error('参数不能为空');
    }

    const size = EXPORT_SIZE_PX[payload.size] ?? EXPORT_SIZE_PX['5'];
    const baseOutputDir = path.join(payload.exportDir, formatExportFolderName(new Date()));
    const outputRoot = await ensureUniqueDir(baseOutputDir);
    let exported = 0;
    let failed = 0;

    for (let index = 0; index < payload.items.length; index += 1) {
      const item = payload.items[index];
      const sourcePath = path.join(payload.baseDir, item.relativePath);
      const parsed = path.parse(item.relativePath);
      const ext = parsed.ext.toLowerCase();
      const outputDir = path.join(outputRoot, parsed.dir);
      const outputExt = ext === '.png' ? '.png' : '.jpg';
      const outputPath = path.join(outputDir, `${parsed.name}${outputExt}`);

      try {
        await fs.mkdir(outputDir, { recursive: true });
        const buffer = await buildStampedImage(sourcePath, item.meta, size, {
          includeText: true,
          format: outputExt === '.png' ? 'png' : 'jpeg',
        });
        await fs.writeFile(outputPath, buffer);
        exported += 1;
      } catch (error) {
        console.error(error);
        failed += 1;
      } finally {
        event.sender.send('export:progress', {
          current: index + 1,
          total: payload.items.length,
          filename: item.filename,
        });
      }
    }

    return { exported, failed, total: payload.items.length, outputDir: outputRoot };
  });

  ipcMain.handle('dialog:openProjectFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '项目文件', extensions: ['json'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return result.filePaths[0];
  });

  ipcMain.handle('dialog:saveProjectFile', async () => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: '项目文件', extensions: ['json'] }],
      defaultPath: 'project.json',
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    return result.filePath;
  });

  ipcMain.handle('project:save', async (_event, payload: SaveProjectPayload) => {
    if (!payload?.projectPath) {
      throw new Error('projectPath 不能为空');
    }

    await writeJsonAtomic(payload.projectPath, payload.data);
    return true;
  });

  ipcMain.handle('project:load', async (_event, projectPath: string) => {
    if (!projectPath) {
      throw new Error('projectPath 不能为空');
    }

    const raw = await fs.readFile(projectPath, 'utf-8');
    return JSON.parse(raw) as unknown;
  });
}
