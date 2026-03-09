/**
 * CopilotPanel — lazy-loaded wrapper around @kweaver-ai/chatkit Copilot.
 *
 * Kept in its own file so that `React.lazy()` can defer the chatkit import
 * (and its Tailwind v3 CSS injection) until the user first opens the panel.
 */
import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
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

// Copilot uses TypeScript mixin pattern (Copilot_base: any) which causes JSX
// to complain it has no 'props'. Cast to ComponentType<any> to fix the error.
const CopilotComponent = Copilot as ComponentType<any>;

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
    <CopilotComponent
      ref={copilotRef}
      title={title}
      visible={true}
      onClose={onClose}
      baseUrl={getServiceConfig('agent').baseUrl}
      agentKey={agentKey}
      token={getAuthToken()}
      refreshToken={async () => {
        // In DIP mode, use DIP refresh; otherwise fall back to current token
        // NOTE: Return raw token only — Copilot component adds "Bearer " prefix internally.
        const t = dipEnvironmentService.isDipMode()
          ? await dipEnvironmentService.refreshToken()
          : getAuthToken();
        if (!t) return '';
        // Strip any accidental "Bearer " prefix so the component doesn't double it
        return t.startsWith('Bearer ') ? t.slice(7) : t;
      }}
      businessDomain="bd_public"
    />
  );
};

export default CopilotPanel;
