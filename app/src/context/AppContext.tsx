import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

type SubscriptionStatus = 'active' | 'expired' | 'none';
type GoalMode = 'bulk' | 'cut';

type AppState = {
  subscriptionStatus: SubscriptionStatus;
  validUntil: string | null;
  lastVerified: string | null;
  tokens: number;
  goalMode: GoalMode;
};

type AppContextType = AppState & {
  setSubscription: (status: SubscriptionStatus, validUntil: string | null) => void;
  setLastVerified: (iso: string) => void;
  earnTokens: (count: number) => void;
  consumeToken: () => boolean;
  setGoalMode: (mode: GoalMode) => void;
};

const DEFAULT_STATE: AppState = {
  subscriptionStatus: 'none',
  validUntil: null,
  lastVerified: null,
  tokens: 0,
  goalMode: 'cut',
};

const STORAGE_KEYS = {
  subscriptionStatus: 'app/subscription_status',
  validUntil: 'app/valid_until',
  lastVerified: 'app/last_verified',
  tokens: 'app/tokens',
  goalMode: 'app/goal_mode',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const [subscriptionStatus, validUntil, lastVerified, tokens, goalMode] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.subscriptionStatus),
        SecureStore.getItemAsync(STORAGE_KEYS.validUntil),
        SecureStore.getItemAsync(STORAGE_KEYS.lastVerified),
        SecureStore.getItemAsync(STORAGE_KEYS.tokens),
        SecureStore.getItemAsync(STORAGE_KEYS.goalMode),
      ]);

      setState({
        subscriptionStatus: (subscriptionStatus as SubscriptionStatus) || DEFAULT_STATE.subscriptionStatus,
        validUntil: validUntil || DEFAULT_STATE.validUntil,
        lastVerified: lastVerified || DEFAULT_STATE.lastVerified,
        tokens: tokens ? Number(tokens) : DEFAULT_STATE.tokens,
        goalMode: (goalMode as GoalMode) || DEFAULT_STATE.goalMode,
      });
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    SecureStore.setItemAsync(STORAGE_KEYS.subscriptionStatus, state.subscriptionStatus);
    SecureStore.setItemAsync(STORAGE_KEYS.validUntil, state.validUntil ?? '');
    SecureStore.setItemAsync(STORAGE_KEYS.lastVerified, state.lastVerified ?? '');
    SecureStore.setItemAsync(STORAGE_KEYS.tokens, String(state.tokens));
    SecureStore.setItemAsync(STORAGE_KEYS.goalMode, state.goalMode);
  }, [state, hydrated]);

  const api = useMemo<AppContextType>(() => ({
    ...state,
    setSubscription: (status, validUntil) => {
      setState((prev) => ({ ...prev, subscriptionStatus: status, validUntil }));
    },
    setLastVerified: (iso) => setState((prev) => ({ ...prev, lastVerified: iso })),
    earnTokens: (count) => setState((prev) => ({ ...prev, tokens: prev.tokens + Math.max(0, count) })),
    consumeToken: () => {
      let allowed = false;
      setState((prev) => {
        if (prev.subscriptionStatus === 'active') {
          allowed = true;
          return prev;
        }
        if (prev.tokens > 0) {
          allowed = true;
          return { ...prev, tokens: prev.tokens - 1 };
        }
        allowed = false;
        return prev;
      });
      return allowed;
    },
    setGoalMode: (mode) => setState((prev) => ({ ...prev, goalMode: mode })),
  }), [state]);

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};


