/**
 * CopilotPanel — lazy-loaded wrapper around @kweaver-ai/chatkit Copilot.
 *
 * Kept in its own file so that `React.lazy()` can defer the chatkit import
 * (and its Tailwind v3 CSS injection) until the user first opens the panel.
 */
import { useEffect, useRef } from 'react';
import { Copilot } from '@kweaver-ai/chatkit';
import type { Copilot as CopilotInstance } from '@kweaver-ai/chatkit';
import { getAgentConfigForView, getContextForView } from '../../utils/copilotConfig';
import { dipEnvironmentService } from '../../services/dipEnvironmentService';
import { getServiceConfig, getAuthToken } from '../../config/apiConfig';

type ViewType = 'cockpit' | 'search' | 'planningV2' | 'inventory' | 'optimization' | 'delivery' | 'evaluation' | 'config';

interface CopilotPanelProps {
  currentView: ViewType;
  onClose: () => void;
}

const CopilotPanel = ({ currentView, onClose }: CopilotPanelProps) => {
  const copilotRef = useRef<CopilotInstance>(null);
  const { agentKey, title } = getAgentConfigForView(currentView);

  useEffect(() => {
    const ctx = getContextForView(currentView);
    if (ctx && copilotRef.current) {
      copilotRef.current.injectApplicationContext(ctx);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Copilot
      ref={copilotRef}
      title={title}
      visible={true}
      onClose={onClose}
      baseUrl={getServiceConfig('agent').baseUrl}
      agentKey={agentKey}
      token={getAuthToken()}
      refreshToken={async () => {
        // In DIP mode, use DIP refresh; otherwise fall back to current token
        const t = dipEnvironmentService.isDipMode()
          ? await dipEnvironmentService.refreshToken()
          : getAuthToken();
        if (!t) return '';
        return t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      }}
      businessDomain="bd_public"
    />
  );
};

export default CopilotPanel;
