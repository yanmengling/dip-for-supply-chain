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

import type { MicroAppProps } from './micro-app'


let root: ReturnType<typeof createRoot> | null = null;

function render(container?: HTMLElement, props?: MicroAppProps) {
  const target = container ? container.querySelector('#root') : document.getElementById('root');
  if (!target) return;

  root = createRoot(target);
  root.render(
    <StrictMode>
      <App {...props} />
    </StrictMode>,
  )
}

const qiankunLifeCycle = {
  async bootstrap() {
    console.log('[SupplyChainBrain] bootstrap');
  },
  async mount(props: any) {
    console.log('[SupplyChainBrain] mount', props);
    render(props.container, props as MicroAppProps);
  },
  async unmount(props: any) {
    console.log('[SupplyChainBrain] unmount', props);
    if (root) {
      root.unmount();
      root = null;
    }
  },
  async update(props: any) {
    console.log('[SupplyChainBrain] update', props);
  },
};

renderWithQiankun(qiankunLifeCycle);

// Manual backup for global assignment - ensure host can find the lifecycles
if (qiankunWindow.__POWERED_BY_QIANKUN__) {
  console.log('[SupplyChainBrain] Detected qiankun environment, setting global lifecycles');
  const appName = 'supply-chain-brain';
  // @ts-ignore
  qiankunWindow[appName] = qiankunLifeCycle;
}

// Fallback for standalone mode
if (!qiankunWindow.__POWERED_BY_QIANKUN__) {
  console.log('[SupplyChainBrain] Standalone mode');
  render();
}

// Explicit exports for ESM compatibility
export const bootstrap = qiankunLifeCycle.bootstrap;
export const mount = qiankunLifeCycle.mount;
export const unmount = qiankunLifeCycle.unmount;
export const update = qiankunLifeCycle.update;
