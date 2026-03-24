import { app } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

type LogLevel = 'INFO' | 'ERROR';

function resolveLogPath(): string {
  return path.join(app.getPath('userData'), 'imgstamp.log');
}

function stringifyDetail(detail?: unknown): string {
  if (detail === undefined) {
    return '';
  }
  try {
    return JSON.stringify(detail, (_key, value) => {
      if (value instanceof Error) {
        return {
          name: value.name,
          message: value.message,
          stack: value.stack,
        };
      }
      return value;
    });
  } catch {
    return String(detail);
  }
}

async function writeLog(level: LogLevel, message: string, detail?: unknown): Promise<void> {
  const line = `[${new Date().toISOString()}] [${level}] ${message}`;
  const suffix = stringifyDetail(detail);
  const payload = suffix ? `${line} ${suffix}\n` : `${line}\n`;
  try {
    await fs.mkdir(path.dirname(resolveLogPath()), { recursive: true });
    await fs.appendFile(resolveLogPath(), payload, 'utf-8');
  } catch (error) {
    console.error('写入日志失败', error);
  }
}

export function logInfo(message: string, detail?: unknown): void {
  void writeLog('INFO', message, detail);
}

export function logError(message: string, detail?: unknown): void {
  void writeLog('ERROR', message, detail);
}

export function getLogPath(): string {
  return resolveLogPath();
}
