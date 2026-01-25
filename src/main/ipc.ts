import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import exifr from 'exifr';
import { setWindowTitle } from './menu';

type SaveProjectPayload = {
  projectPath: string;
  data: unknown;
};

type ExportPayload = {
  baseDir: string;
  exportDir: string;
  size: '5' | '5L' | '6' | '6L';
  items: Array<{
    relativePath: string;
    filename: string;
    meta: { date: string | null; location: string; description: string };
  }>;
};

type RecentProject = {
  name: string;
  kind: 'folder' | 'project';
  path: string;
  baseDir: string;
  lastOpenedAt: number;
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
  '5L': { width: 1500, height: 1125 },
  '6': { width: 1800, height: 1200 },
  '6L': { width: 1800, height: 1350 },
} as const;
const LAYOUT_RATIOS = {
  nonText: 0,
} as const;
const TYPOGRAPHY_RATIOS = {
  font: 0.0225,
  paddingX: 0,
  paddingY: 0,
} as const;
const TEXT_ASCENT_RATIO = 0.8;
const TEXT_IMAGE_GAP_MIN_RATIO = 0.3;
const TEXT_BORDER_RATIO = 2.5;
const TEXT_EDGE_SAFE_RATIO = 1.5;
const RECENT_LIMIT = 10;
const RECENT_FILE = path.join(app.getPath('userData'), 'recent-projects.json');

type LayoutMode = 'bottom' | 'right';
type Layout = {
  mode: LayoutMode;
  margins: { top: number; right: number; bottom: number; left: number };
  imageArea: { x: number; y: number; width: number; height: number };
  textArea: { x: number; y: number; width: number; height: number };
};
type SourceInfo = { width: number; height: number };
type Typography = { fontSize: number; paddingX: number; paddingY: number };
type Bounds = { x: number; y: number; width: number; height: number };
type TextRun = { text: string; script: 'cjk' | 'latin' };

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

async function readSourceInfo(sourcePath: string): Promise<SourceInfo | null> {
  try {
    const metadata = await sharp(sourcePath).metadata();
    if (metadata.width && metadata.height) {
      return { width: metadata.width, height: metadata.height };
    }
  } catch {
    // ignore metadata errors
  }
  return null;
}

function resolveCanvasSize(
  baseSize: { width: number; height: number },
  sourceInfo: SourceInfo | null,
): { width: number; height: number } {
  if (!sourceInfo) {
    return baseSize;
  }
  if (sourceInfo.height > sourceInfo.width) {
    return { width: baseSize.height, height: baseSize.width };
  }
  return baseSize;
}

function resolveLayoutMode(includeText: boolean, sourceInfo: SourceInfo | null): LayoutMode {
  if (!includeText || !sourceInfo) {
    return 'bottom';
  }
  const ratio = sourceInfo.height / sourceInfo.width;
  return ratio >= 1.8 ? 'right' : 'bottom';
}

function resolveImageRect(
  sourceInfo: SourceInfo,
  layout: Layout,
  fontSize: number,
): Bounds {
  const requiredBorderRatio = Math.max(
    TEXT_BORDER_RATIO,
    TEXT_IMAGE_GAP_MIN_RATIO + 1 + TEXT_EDGE_SAFE_RATIO,
  );
  const textBorder = Math.ceil(fontSize * requiredBorderRatio);
  const canvasWidth = layout.imageArea.width;
  const canvasHeight = layout.imageArea.height;
  const maxWidth =
    layout.mode === 'right' ? Math.max(1, canvasWidth - textBorder) : canvasWidth;
  const maxHeight =
    layout.mode === 'bottom' ? Math.max(1, canvasHeight - textBorder) : canvasHeight;
  const scale = Math.min(maxWidth / sourceInfo.width, maxHeight / sourceInfo.height);
  const width = Math.round(sourceInfo.width * scale);
  const height = Math.round(sourceInfo.height * scale);
  let x = Math.round((canvasWidth - width) / 2);
  let y = Math.round((canvasHeight - height) / 2);

  if (layout.mode === 'bottom') {
    const bottomMargin = canvasHeight - (y + height);
    if (bottomMargin < textBorder) {
      y -= textBorder - bottomMargin;
    }
  }

  if (layout.mode === 'right') {
    const rightMargin = canvasWidth - (x + width);
    if (rightMargin < textBorder) {
      x -= textBorder - rightMargin;
    }
  }

  return {
    x: layout.imageArea.x + x,
    y: layout.imageArea.y + y,
    width,
    height,
  };
}

function getTypography(canvas: { width: number; height: number }): Typography {
  return {
    fontSize: Math.round(canvas.height * TYPOGRAPHY_RATIOS.font),
    paddingX: Math.round(canvas.width * TYPOGRAPHY_RATIOS.paddingX),
    paddingY: Math.round(canvas.height * TYPOGRAPHY_RATIOS.paddingY),
  };
}

function estimateTextLength(text: string, fontSize: number): number {
  if (!text) {
    return 0;
  }
  let units = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === ' ') {
      units += 0.3;
    } else if (char === '|' || char === '｜') {
      units += 0.4;
    } else if (char === '-' || char === '·' || char === '—') {
      units += 0.4;
    } else if ((code >= 0x30 && code <= 0x39) || (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)) {
      units += 0.6;
    } else if (
      (code >= 0x4e00 && code <= 0x9fff) ||
      (code >= 0x3040 && code <= 0x30ff) ||
      (code >= 0xac00 && code <= 0xd7af)
    ) {
      units += 1.0;
    } else {
      units += 0.7;
    }
  }
  return units * fontSize;
}

function escapeSvgText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function isCjkCode(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x3040 && code <= 0x30ff) ||
    (code >= 0xac00 && code <= 0xd7af) ||
    (code >= 0x3000 && code <= 0x303f)
  );
}

function splitTextRuns(text: string): TextRun[] {
  if (!text) {
    return [];
  }
  const runs: TextRun[] = [];
  let buffer = '';
  let currentScript: TextRun['script'] | null = null;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    const script: TextRun['script'] = isCjkCode(code) ? 'cjk' : 'latin';
    if (currentScript && script !== currentScript) {
      runs.push({ text: buffer, script: currentScript });
      buffer = '';
    }
    currentScript = script;
    buffer += char;
  }
  if (buffer && currentScript) {
    runs.push({ text: buffer, script: currentScript });
  }
  return runs;
}

function buildStyledText(text: string): string {
  return splitTextRuns(text)
    .map((run) => `<tspan class="${run.script}">${escapeSvgText(run.text)}</tspan>`)
    .join('');
}

async function detectContentBounds(
  buffer: Buffer,
  width: number,
  height: number,
): Promise<Bounds | null> {
  const maxSample = 320;
  const scale = Math.min(1, maxSample / Math.max(width, height));
  const sampleWidth = Math.max(1, Math.round(width * scale));
  const sampleHeight = Math.max(1, Math.round(height * scale));

  const { data, info } = await sharp(buffer)
    .removeAlpha()
    .resize(sampleWidth, sampleHeight, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels;
  const readPixel = (x: number, y: number) => {
    const idx = (y * sampleWidth + x) * channels;
    return [data[idx], data[idx + 1], data[idx + 2]];
  };

  const corners = [
    readPixel(0, 0),
    readPixel(sampleWidth - 1, 0),
    readPixel(0, sampleHeight - 1),
    readPixel(sampleWidth - 1, sampleHeight - 1),
  ];
  const avg = corners.reduce(
    (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
    [0, 0, 0],
  );
  const bg = [avg[0] / corners.length, avg[1] / corners.length, avg[2] / corners.length];
  const brightness = (bg[0] + bg[1] + bg[2]) / 3;
  const variance =
    corners.reduce(
      (acc, color) =>
        acc + Math.abs(color[0] - bg[0]) + Math.abs(color[1] - bg[1]) + Math.abs(color[2] - bg[2]),
      0,
    ) / corners.length;

  if (brightness < 230 || variance > 12) {
    return null;
  }

  const threshold = 60;
  let minX = sampleWidth;
  let minY = sampleHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const idx = (y * sampleWidth + x) * channels;
      const diff =
        Math.abs(data[idx] - bg[0]) +
        Math.abs(data[idx + 1] - bg[1]) +
        Math.abs(data[idx + 2] - bg[2]);
      if (diff > threshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const scaleX = width / sampleWidth;
  const scaleY = height / sampleHeight;
  const x = Math.max(0, Math.floor(minX * scaleX));
  const y = Math.max(0, Math.floor(minY * scaleY));
  const w = Math.min(width, Math.ceil((maxX - minX + 1) * scaleX));
  const h = Math.min(height, Math.ceil((maxY - minY + 1) * scaleY));

  const marginLeft = x;
  const marginRight = width - (x + w);
  const marginTop = y;
  const marginBottom = height - (y + h);
  const minInset = 0.02;
  const hasInset =
    marginLeft > width * minInset ||
    marginRight > width * minInset ||
    marginTop > height * minInset ||
    marginBottom > height * minInset;

  if (!hasInset) {
    return null;
  }

  return { x, y, width: w, height: h };
}

function buildLayout(
  canvas: { width: number; height: number },
  options: { includeText: boolean; mode: LayoutMode },
): Layout {
  const typography = getTypography(canvas);
  const requiredBorderRatio = Math.max(
    TEXT_BORDER_RATIO,
    TEXT_IMAGE_GAP_MIN_RATIO + 1 + TEXT_EDGE_SAFE_RATIO,
  );
  const textBorder = Math.ceil(typography.fontSize * requiredBorderRatio);
  const imageArea = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
  };
  const textArea = options.includeText
    ? options.mode === 'bottom'
      ? {
          x: 0,
          y: canvas.height - textBorder,
          width: canvas.width,
          height: textBorder,
        }
      : {
          x: canvas.width - textBorder,
          y: 0,
          width: textBorder,
          height: canvas.height,
        }
    : { x: 0, y: 0, width: 0, height: 0 };

  return {
    mode: options.mode,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    imageArea,
    textArea,
  };
}

function buildPreviewSvg(
  meta: { date: string | null; location: string; description: string },
  layout: Layout,
  canvas: { width: number; height: number },
  imageRect?: Bounds,
  contentRect?: Bounds,
) {
  const typography = getTypography(canvas);
  const fontSize = typography.fontSize;
  const isRight = layout.mode === 'right';
  const ascent = Math.round(fontSize * TEXT_ASCENT_RATIO);
  const descent = Math.max(1, fontSize - ascent);
  const minGap = Math.ceil(fontSize * TEXT_IMAGE_GAP_MIN_RATIO);
  const edgeSafe = Math.ceil(fontSize * TEXT_EDGE_SAFE_RATIO);
  const imageBase = imageRect ?? {
    x: layout.imageArea.x,
    y: layout.imageArea.y,
    width: layout.imageArea.width,
    height: layout.imageArea.height,
  };
  const contentBase = contentRect ?? imageBase;
  const dateText = meta.date ?? '';
  const locationText = meta.location ?? '';
  const descText = meta.description ?? '';
  const leftLine = [locationText, descText].filter(Boolean).join(' · ');
  const rightLine = dateText;

  if (isRight) {
    const maxAnchorX = canvas.width - edgeSafe - descent;
    const anchorX = Math.min(
      imageBase.x + imageBase.width + minGap + ascent,
      maxAnchorX,
    );
    const edgePadding = edgeSafe;
    const minTop = edgePadding;
    const maxBottom = canvas.height - edgePadding;
    const dateLine = rightLine;
    const metaLine = leftLine;
    const dateLength = estimateTextLength(meta.date ?? '', fontSize);
    const metaLength = estimateTextLength(
      [meta.location ?? '', meta.description ?? ''].filter(Boolean).join(' · '),
      fontSize,
    );
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), Math.max(min, max));
    const topMax = Math.max(minTop, maxBottom - dateLength);
    const bottomMin = Math.min(maxBottom, minTop + metaLength);
    let topY = clamp(contentBase.y + edgePadding, minTop, topMax);
    let bottomY = clamp(
      contentBase.y + contentBase.height - edgePadding,
      bottomMin,
      maxBottom,
    );
    if (dateLine && metaLine) {
      const minGapBetween = fontSize;
      const gap = bottomY - metaLength - (topY + dateLength);
      if (gap < minGapBetween) {
        topY = clamp(minTop, minTop, topMax);
        bottomY = clamp(maxBottom, bottomMin, maxBottom);
      }
    }
    const dateSvg = dateLine
      ? `<text class="label" x="${anchorX}" y="${topY}" text-anchor="end" dominant-baseline="middle" transform="rotate(-90 ${anchorX} ${topY})" xml:space="preserve">${buildStyledText(dateLine)}</text>`
      : '';
    const metaSvg = metaLine
      ? `<text class="label" x="${anchorX}" y="${bottomY}" text-anchor="start" dominant-baseline="middle" transform="rotate(-90 ${anchorX} ${bottomY})" xml:space="preserve">${buildStyledText(metaLine)}</text>`
      : '';
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">\n  <style>\n    .label { font-family: "FangSong", "FangSong_GB2312", "仿宋", "Microsoft YaHei", "Segoe UI", sans-serif; fill: #111827; font-size: ${fontSize}px; font-weight: 400; }\n    .latin { font-family: "Times New Roman", "Times", serif; }\n    .cjk { font-family: "FangSong", "FangSong_GB2312", "仿宋", "Microsoft YaHei", "Segoe UI", sans-serif; }\n  </style>\n  ${dateSvg}\n  ${metaSvg}\n</svg>`;
  }

  const bottomBounds = { left: contentBase.x, right: contentBase.x + contentBase.width };
  let leftX = Math.max(bottomBounds.left, edgeSafe);
  let rightX = Math.min(bottomBounds.right, canvas.width - edgeSafe);
  if (rightX < leftX) {
    leftX = edgeSafe;
    rightX = canvas.width - edgeSafe;
  }
  const desiredTop = imageBase.y + imageBase.height + minGap;
  const minBaseline = desiredTop + ascent;
  const maxBaseline = canvas.height - edgeSafe - descent;
  const textY = Math.min(minBaseline, maxBaseline);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">\n  <style>\n    .label { font-family: "FangSong", "FangSong_GB2312", "仿宋", "Microsoft YaHei", "Segoe UI", sans-serif; fill: #111827; font-size: ${fontSize}px; font-weight: 400; }\n    .latin { font-family: "Times New Roman", "Times", serif; }\n    .cjk { font-family: "FangSong", "FangSong_GB2312", "仿宋", "Microsoft YaHei", "Segoe UI", sans-serif; }\n  </style>\n  <text class="label" x="${leftX}" y="${textY}" xml:space="preserve">${buildStyledText(leftLine)}</text>\n  <text class="label" x="${rightX}" y="${textY}" text-anchor="end" xml:space="preserve">${buildStyledText(rightLine)}</text>\n</svg>`;
}

async function buildStampedImage(
  sourcePath: string,
  meta: { date: string | null; location: string; description: string },
  size: { width: number; height: number },
  options: { includeText: boolean; format: 'jpeg' | 'png'; quality?: number },
) {
  const sourceInfo = await readSourceInfo(sourcePath);
  const canvasSize = resolveCanvasSize(size, sourceInfo);
  const mode = resolveLayoutMode(options.includeText, sourceInfo);
  const layout = buildLayout(
    { width: canvasSize.width, height: canvasSize.height },
    { includeText: options.includeText, mode },
  );

  const base = sharp({
    create: {
      width: canvasSize.width,
      height: canvasSize.height,
      channels: 3,
      background: '#ffffff',
    },
  });

  let imageRect = layout.imageArea;
  let resized: Buffer;
  if (sourceInfo) {
    const typography = getTypography(canvasSize);
    imageRect = resolveImageRect(sourceInfo, layout, typography.fontSize);
    resized = await sharp(sourcePath)
      .resize(imageRect.width, imageRect.height, {
        fit: 'fill',
      })
      .toBuffer();
  } else {
    resized = await sharp(sourcePath)
      .resize(layout.imageArea.width, layout.imageArea.height, {
        fit: 'contain',
        background: '#ffffff',
      })
      .toBuffer();
  }

  const overlays = [{ input: resized, top: imageRect.y, left: imageRect.x }];
  if (options.includeText) {
    let contentRect: Bounds | null = null;
    try {
      const contentBounds = await detectContentBounds(
        resized,
        imageRect.width,
        imageRect.height,
      );
      if (contentBounds) {
        contentRect = {
          x: imageRect.x + contentBounds.x,
          y: imageRect.y + contentBounds.y,
          width: contentBounds.width,
          height: contentBounds.height,
        };
      }
    } catch {
      // ignore detection errors
    }
    const svg = buildPreviewSvg(meta, layout, {
      width: canvasSize.width,
      height: canvasSize.height,
    }, imageRect, contentRect ?? undefined);
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
  options: { size: '5' | '5L' | '6' | '6L'; mode: 'final' | 'original' },
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

function sanitizeFileName(name: string): string {
  const withoutInvalid = name.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '');
  const trimmed = withoutInvalid.trim();
  return trimmed || 'ImgStamp-未命名项目.json';
}

function normalizeProjectFileName(input?: string): string {
  if (!input) {
    return 'project.json';
  }
  const base = path.basename(input);
  const sanitized = sanitizeFileName(base);
  return sanitized.toLowerCase().endsWith('.json') ? sanitized : `${sanitized}.json`;
}

function getNameFromPath(targetPath: string): string {
  const parts = targetPath.split(/[/\\]+/);
  return parts[parts.length - 1] || targetPath;
}

async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const raw = await fs.readFile(RECENT_FILE, 'utf-8');
    const data = JSON.parse(raw) as RecentProject[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function upsertRecentProject(
  entry: Omit<RecentProject, 'lastOpenedAt'>,
): Promise<RecentProject[]> {
  const now = Date.now();
  const list = await readRecentProjects();
  const key = `${entry.kind}:${entry.path}`;
  const cleaned = list.filter((item) => `${item.kind}:${item.path}` !== key);
  const name = entry.name || getNameFromPath(entry.path);
  const baseDir = entry.baseDir || entry.path;
  const next = [{ ...entry, name, baseDir, lastOpenedAt: now }, ...cleaned].slice(0, RECENT_LIMIT);
  await writeJsonAtomic(RECENT_FILE, next);
  return next;
}

export function registerIpcHandlers(): void {
  ipcMain.handle('recent:list', async () => readRecentProjects());

  ipcMain.handle(
    'recent:add',
    async (
      _event,
      payload: { name: string; kind: 'folder' | 'project'; path: string; baseDir: string },
    ) => {
      if (!payload?.path || !payload?.kind) {
        throw new Error('参数不能为空');
      }
      await upsertRecentProject({
        name: payload.name,
        kind: payload.kind,
        path: payload.path,
        baseDir: payload.baseDir ?? payload.path,
      });
      return true;
    },
  );

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

  ipcMain.handle('app:setTitle', async (event, projectName: string) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    setWindowTitle(window, projectName || '未命名项目');
    return true;
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
      options: { size: '5' | '5L' | '6' | '6L'; mode: 'final' | 'original' },
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

  ipcMain.handle('dialog:saveProjectFileWithName', async (_event, defaultName?: string) => {
    const result = await dialog.showSaveDialog({
      filters: [{ name: '项目文件', extensions: ['json'] }],
      defaultPath: normalizeProjectFileName(defaultName),
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
