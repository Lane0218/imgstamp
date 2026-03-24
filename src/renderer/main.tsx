import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Launcher } from './Launcher';

const container = document.getElementById('root');

if (!container) {
  throw new Error('找不到 root 容器');
}

const view = new URLSearchParams(window.location.search).get('view');
const RootComponent = view === 'launcher' ? Launcher : App;

const setupRendererDiagnostics = async () => {
  if (!window.imgstamp) {
    return;
  }
  const debugMode = await window.imgstamp.isDebugMode();
  if (!debugMode) {
    return;
  }

  const sendMemorySnapshot = async () => {
    const performanceWithMemory = performance as Performance & {
      memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };
    await window.imgstamp.diagnosticLog('renderer heartbeat', {
      view,
      url: window.location.href,
      visibilityState: document.visibilityState,
      memory: performanceWithMemory.memory
        ? {
            usedJSHeapSize: performanceWithMemory.memory.usedJSHeapSize,
            totalJSHeapSize: performanceWithMemory.memory.totalJSHeapSize,
            jsHeapSizeLimit: performanceWithMemory.memory.jsHeapSizeLimit,
          }
        : null,
    });
  };

  window.addEventListener('error', (event) => {
    void window.imgstamp.diagnosticLog('renderer error', {
      message: event.message,
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    void window.imgstamp.diagnosticLog('renderer unhandledrejection', {
      reason:
        event.reason instanceof Error
          ? {
              name: event.reason.name,
              message: event.reason.message,
              stack: event.reason.stack,
            }
          : event.reason,
    });
  });

  await window.imgstamp.diagnosticLog('renderer debug mode enabled', { view });
  void sendMemorySnapshot();
  window.setInterval(() => {
    void sendMemorySnapshot();
  }, 30_000);
};

void setupRendererDiagnostics();

createRoot(container).render(<RootComponent />);
