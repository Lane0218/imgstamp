import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Launcher } from './Launcher';

const container = document.getElementById('root');

if (!container) {
  throw new Error('找不到 root 容器');
}

const view = new URLSearchParams(window.location.search).get('view');
const RootComponent = view === 'launcher' ? Launcher : App;

createRoot(container).render(<RootComponent />);
