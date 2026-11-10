// One AI surface for the dashboard: the header "Ask AI" panel. Other places (the Overview
// prompt) open it through this context, optionally with a starter action to run.
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export type AIAssistantAction = 'insights';

interface AIAssistantContextValue {
  open: boolean;
  /** Open the panel; with an action, the panel runs it once (e.g. generate insights for the period). */
  openPanel: (action?: AIAssistantAction) => void;
  closePanel: () => void;
  pendingAction: AIAssistantAction | null;
  consumeAction: () => void;
}

const noop = () => {};
const AIAssistantContext = createContext<AIAssistantContextValue>({
  open: false, openPanel: noop, closePanel: noop, pendingAction: null, consumeAction: noop,
});

export function AIAssistantProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<AIAssistantAction | null>(null);
  const openPanel = useCallback((action?: AIAssistantAction) => {
    setOpen(true);
    if (action) setPendingAction(action);
  }, []);
  const closePanel = useCallback(() => setOpen(false), []);
  const consumeAction = useCallback(() => setPendingAction(null), []);
  const value = useMemo(() => ({ open, openPanel, closePanel, pendingAction, consumeAction }),
    [open, openPanel, closePanel, pendingAction, consumeAction]);
  return <AIAssistantContext.Provider value={value}>{children}</AIAssistantContext.Provider>;
}

export function useAIAssistantPanel() {
  return useContext(AIAssistantContext);
}
