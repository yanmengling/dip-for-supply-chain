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
import { getServiceConfig } from '../../config/apiConfig';

type ViewType = 'cockpit' | 'search' | 'planning' | 'planningV2' | 'inventory' | 'optimization' | 'delivery' | 'evaluation' | 'config';

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

  const getBearerToken = (): string => {
    const t = dipEnvironmentService.getToken();
    if (!t) return '';
    return t.startsWith('Bearer ') ? t : `Bearer ${t}`;
  };

  return (
    <Copilot
      ref={copilotRef}
      title={title}
      visible={true}
      onClose={onClose}
      baseUrl={getServiceConfig('agent').baseUrl}
      agentKey={agentKey}
      token={getBearerToken()}
      refreshToken={async () => {
        const t = await dipEnvironmentService.refreshToken();
        if (!t) return '';
        return t.startsWith('Bearer ') ? t : `Bearer ${t}`;
      }}
      businessDomain="bd_public"
    />
  );
};

export default CopilotPanel;
