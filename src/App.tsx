import SupplyChainApp from './SupplyChainApp'
import { I18nProvider } from './i18n/context'

import type { MicroAppProps } from './micro-app'

function App(props: Partial<MicroAppProps>) {
  // Use props.route.basename here if needed for router
  // Use props.token, etc.

  return (
    <I18nProvider>
      <div className="w-full h-screen">
        <SupplyChainApp {...props} />
      </div>
    </I18nProvider>
  )
}

export default App
