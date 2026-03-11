/**
 * CopilotPanel — lazy-loaded wrapper around DecisionAgentCopilot.
 *
 * Inherits all chatkit CopilotBase UI capabilities (message bubbles, history
 * sidebar, progress display, regenerate button) but calls the Decision Agent
 * API endpoint: POST /app/{agentKey}/api/chat/completion
 *
 * Kept in its own file so that React.lazy() can defer the import until the
 * user first opens the panel.
 */
import { useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import type { CopilotBase } from '@kweaver-ai/chatkit';
import { DecisionAgentCopilot } from './DecisionAgentCopilot';
import { getAgentConfigForView, getContextForView } from '../../utils/copilotConfig';
import { dipEnvironmentService } from '../../services/dipEnvironmentService';
import { getServiceConfig, getAuthToken } from '../../config/apiConfig';

type ViewType = 'cockpit' | 'search' | 'planningV2' | 'inventory' | 'optimization' | 'delivery' | 'evaluation' | 'config';

interface CopilotPanelProps {
  currentView: ViewType;
  onClose: () => void;
}

// DecisionAgentCopilot uses the same TypeScript mixin pattern; cast to ComponentType<any>
const DecisionAgentCopilotComponent = DecisionAgentCopilot as unknown as ComponentType<any>;

const CopilotPanel = ({ currentView, onClose }: CopilotPanelProps) => {
  const copilotRef = useRef<CopilotBase>(null);
  const { agentKey, title } = getAgentConfigForView(currentView);

  useEffect(() => {
    const ctx = getContextForView(currentView);
    if (ctx && copilotRef.current) {
      copilotRef.current.injectApplicationContext(ctx);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <DecisionAgentCopilotComponent
      ref={copilotRef}
      title={title}
      visible={true}
      onClose={onClose}
      // Decision Agent endpoint base — same as existing DIP proxy path
      baseUrl={getServiceConfig('agent').baseUrl}
      agentKey={agentKey}
      token={getAuthToken()}
      refreshToken={async () => {
        const t = dipEnvironmentService.isDipMode()
          ? await dipEnvironmentService.refreshToken()
          : getAuthToken();
        if (!t) return '';
        // Strip accidental "Bearer " prefix; DecisionAgentCopilot adds it internally
        return t.startsWith('Bearer ') ? t.slice(7) : t;
      }}
      businessDomain="bd_public"
    />
  );
};

export default CopilotPanel;
