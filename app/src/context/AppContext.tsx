import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';

type SubscriptionStatus = 'active' | 'expired' | 'none';
type GoalMode = 'bulk' | 'cut';

type ServingInfo = {
  quantity?: number;
  unit?: string;
} | undefined;

type ServingAltInfo = {
  value?: number;
  unit?: string;
} | undefined;

type ScanMetrics = {
  caloriesPerDollar: number | null;
  proteinPerDollar: number | null;
  caloriesPerProtein: number | null;
  costPerServing: number | null;
  mealsPerContainer: number | null;
  costPerMeal: number | null;
};

type ScanResult = {
  id: string;
  createdAt: string;
  imageUri?: string;
  price: number;
  calories?: number;
  proteinGrams?: number;
  servingsPerContainer?: number;
  mealMultiplier: number;
  goalMode: GoalMode;
  metrics: ScanMetrics;
  servingSize?: ServingInfo;
  servingSizeAlt?: ServingAltInfo;
};

type AppState = {
  subscriptionStatus: SubscriptionStatus;
  validUntil: string | null;
  lastVerified: string | null;
  tokens: number;
  goalMode: GoalMode;
  history: ScanResult[];
};

type AppContextType = AppState & {
  setSubscription: (status: SubscriptionStatus, validUntil: string | null) => void;
  setLastVerified: (iso: string) => void;
  earnTokens: (count: number) => void;
  consumeToken: () => boolean;
  setGoalMode: (mode: GoalMode) => void;
  addOrUpdateScanResult: (result: ScanResult) => void;
  removeScanResult: (id: string) => void;
  clearHistory: () => void;
};

const DEFAULT_STATE: AppState = {
  subscriptionStatus: 'none',
  validUntil: null,
  lastVerified: null,
  tokens: 0,
  goalMode: 'cut',
  history: [],
};

const STORAGE_KEYS = {
  subscriptionStatus: 'app/subscription_status',
  validUntil: 'app/valid_until',
  lastVerified: 'app/last_verified',
  tokens: 'app/tokens',
  goalMode: 'app/goal_mode',
  history: 'app/history',
};

const HISTORY_LIMIT = 50;

const AppContext = createContext<AppContextType | undefined>(undefined);

const sanitizeNumber = (value: any): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return undefined;
};

const sanitizeMetric = (value: any): number | null => {
  const numeric = sanitizeNumber(value);
  return numeric != null ? numeric : null;
};

const sanitizeGoalMode = (mode: any): GoalMode => (mode === 'bulk' ? 'bulk' : 'cut');

const sanitizeScanResult = (entry: any): ScanResult | null => {
  if (!entry || typeof entry.id !== 'string') {
    return null;
  }
  const metrics = entry.metrics ?? {};
  return {
    id: entry.id,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : new Date().toISOString(),
    imageUri: typeof entry.imageUri === 'string' ? entry.imageUri : undefined,
    price: sanitizeNumber(entry.price) ?? 0,
    calories: sanitizeNumber(entry.calories),
    proteinGrams: sanitizeNumber(entry.proteinGrams),
    servingsPerContainer: sanitizeNumber(entry.servingsPerContainer),
    mealMultiplier: sanitizeNumber(entry.mealMultiplier) ?? 2.5,
    goalMode: sanitizeGoalMode(entry.goalMode),
    metrics: {
      caloriesPerDollar: sanitizeMetric(metrics.caloriesPerDollar),
      proteinPerDollar: sanitizeMetric(metrics.proteinPerDollar),
      caloriesPerProtein: sanitizeMetric(metrics.caloriesPerProtein),
      costPerServing: sanitizeMetric(metrics.costPerServing),
      mealsPerContainer: sanitizeMetric(metrics.mealsPerContainer),
      costPerMeal: sanitizeMetric(metrics.costPerMeal),
    },
    servingSize:
      entry.servingSize && (entry.servingSize.quantity != null || entry.servingSize.unit)
        ? {
            quantity: sanitizeNumber(entry.servingSize.quantity),
            unit: typeof entry.servingSize.unit === 'string' ? entry.servingSize.unit : undefined,
          }
        : undefined,
    servingSizeAlt:
      entry.servingSizeAlt && (entry.servingSizeAlt.value != null || entry.servingSizeAlt.unit)
        ? {
            value: sanitizeNumber(entry.servingSizeAlt.value),
            unit: typeof entry.servingSizeAlt.unit === 'string' ? entry.servingSizeAlt.unit : undefined,
          }
        : undefined,
  };
};

const parseHistory = (raw: string | null): ScanResult[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map(sanitizeScanResult)
        .filter((entry): entry is ScanResult => !!entry)
        .slice(0, HISTORY_LIMIT);
    }
  } catch (err) {
    console.warn('Failed to parse history store', err);
  }
  return [];
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    (async () => {
      const [subscriptionStatus, validUntil, lastVerified, tokens, goalMode, historyRaw] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.subscriptionStatus),
        SecureStore.getItemAsync(STORAGE_KEYS.validUntil),
        SecureStore.getItemAsync(STORAGE_KEYS.lastVerified),
        SecureStore.getItemAsync(STORAGE_KEYS.tokens),
        SecureStore.getItemAsync(STORAGE_KEYS.goalMode),
        SecureStore.getItemAsync(STORAGE_KEYS.history),
      ]);

      setState({
        subscriptionStatus: (subscriptionStatus as SubscriptionStatus) || DEFAULT_STATE.subscriptionStatus,
        validUntil: validUntil || DEFAULT_STATE.validUntil,
        lastVerified: lastVerified || DEFAULT_STATE.lastVerified,
        tokens: tokens ? Number(tokens) : DEFAULT_STATE.tokens,
        goalMode: sanitizeGoalMode(goalMode),
        history: parseHistory(historyRaw),
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
    SecureStore.setItemAsync(STORAGE_KEYS.history, JSON.stringify(state.history));
  }, [state, hydrated]);

  const setSubscription = useCallback((status: SubscriptionStatus, validUntil: string | null) => {
    setState((prev) => ({ ...prev, subscriptionStatus: status, validUntil }));
  }, []);

  const setLastVerified = useCallback((iso: string) => {
    setState((prev) => ({ ...prev, lastVerified: iso }));
  }, []);

  const earnTokens = useCallback((count: number) => {
    setState((prev) => ({ ...prev, tokens: prev.tokens + Math.max(0, count) }));
  }, []);

  const consumeToken = useCallback(() => {
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
  }, []);

  const setGoalMode = useCallback((mode: GoalMode) => {
    setState((prev) => ({ ...prev, goalMode: mode }));
  }, []);

  const addOrUpdateScanResult = useCallback((result: ScanResult) => {
    setState((prev) => {
      const without = prev.history.filter((entry) => entry.id !== result.id);
      return {
        ...prev,
        history: [result, ...without].slice(0, HISTORY_LIMIT),
      };
    });
  }, []);

  const removeScanResult = useCallback((id: string) => {
    setState((prev) => ({ ...prev, history: prev.history.filter((entry) => entry.id !== id) }));
  }, []);

  const clearHistory = useCallback(() => {
    setState((prev) => ({ ...prev, history: [] }));
  }, []);

  const api = useMemo<AppContextType>(
    () => ({
      ...state,
      setSubscription,
      setLastVerified,
      earnTokens,
      consumeToken,
      setGoalMode,
      addOrUpdateScanResult,
      removeScanResult,
      clearHistory,
    }),
    [state, setSubscription, setLastVerified, earnTokens, consumeToken, setGoalMode, addOrUpdateScanResult, removeScanResult, clearHistory]
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

export type { ScanResult, ScanMetrics };


