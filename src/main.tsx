import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { renderWithQiankun, qiankunWindow } from 'vite-plugin-qiankun/dist/helper'

// Debug configuration in development
if (import.meta.env.DEV) {
  import('./utils/configDebug')
  import('./utils/apiDebugger').then(module => {
    module.setupGlobalDebugger()
  })
  import('./utils/showRawData')
}

let root: ReturnType<typeof createRoot> | null = null;

function render(container?: HTMLElement) {
  const target = container ? container.querySelector('#root') : document.getElementById('root');
  if (!target) return;

  root = createRoot(target);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

renderWithQiankun({
  mount(props) {
    console.log('[SupplyChainBrain] mount', props);
    render(props.container);
  },
  bootstrap() {
    console.log('[SupplyChainBrain] bootstrap');
  },
  unmount(props) {
    console.log('[SupplyChainBrain] unmount', props);
    if (root) {
      root.unmount();
      root = null;
    }
  },
  update(props) {
    console.log('[SupplyChainBrain] update', props);
  }
});

if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  render();
}
