import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUBSCRIPTION_PRODUCTS, SubscriptionProductId } from '../constants/subscriptions';

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
  subscriptionProductId: SubscriptionProductId | null;
  latestReceipt: string | null;
  tokens: number;
  goalMode: GoalMode;
  history: ScanResult[];
  lastFreeClaim: string | null;
};

type AppContextType = AppState & {
  setSubscription: (payload: {
    status: SubscriptionStatus;
    productId: SubscriptionProductId | null;
    validUntil: string | null;
    receipt?: string | null;
    lastVerified?: string | null;
  }) => void;
  markSubscriptionFromPurchase: (options: {
    productId: SubscriptionProductId;
    purchaseTime: number;
    receipt?: string | null;
  }) => void;
  clearSubscription: () => void;
  setLastVerified: (iso: string) => void;
  earnTokens: (count: number) => void;
  consumeToken: () => boolean;
  setGoalMode: (mode: GoalMode) => void;
  addOrUpdateScanResult: (result: ScanResult) => void;
  removeScanResult: (id: string) => void;
  clearHistory: () => void;
  claimFreeTokens: () => Promise<boolean>;
};

const DEFAULT_STATE: AppState = {
  subscriptionStatus: 'none',
  validUntil: null,
  lastVerified: null,
  subscriptionProductId: null,
  latestReceipt: null,
  tokens: 0,
  goalMode: 'cut',
  history: [],
  lastFreeClaim: null,
};

const STORAGE_KEYS = {
  subscriptionStatus: 'app/subscription_status',
  validUntil: 'app/valid_until',
  lastVerified: 'app/last_verified',
  subscriptionProductId: 'app/subscription_product_id',
  latestReceipt: 'app/subscription_receipt',
  tokens: 'app/tokens',
  goalMode: 'app/goal_mode',
  history: 'app/history',
  lastFreeClaim: 'app/last_free_claim',
};

const HISTORY_LIMIT = 50;

const TOKEN_CAP = 20;
const FREE_CLAIM_AMOUNT = 10;
const FREE_CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000;

const AppContext = createContext<AppContextType | undefined>(undefined);

const persistSecure = async (key: string, value: string | null) => {
  try {
    if (value == null) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await SecureStore.setItemAsync(key, value);
    }
  } catch (err) {
    console.warn('SecureStore write failed', key, err);
  }
};

const persistAsync = async (key: string, value: string | null) => {
  try {
    if (value == null) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  } catch (err) {
    console.warn('AsyncStorage write failed', key, err);
  }
};

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
      const [
        subscriptionStatusSecure,
        validUntilSecure,
        lastVerifiedSecure,
        subscriptionProductIdSecure,
        latestReceiptSecure,
        tokensSecure,
        goalModeSecure,
        historySecure,
        lastFreeClaimSecure,
      ] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_KEYS.subscriptionStatus),
        SecureStore.getItemAsync(STORAGE_KEYS.validUntil),
        SecureStore.getItemAsync(STORAGE_KEYS.lastVerified),
        SecureStore.getItemAsync(STORAGE_KEYS.subscriptionProductId),
        SecureStore.getItemAsync(STORAGE_KEYS.latestReceipt),
        SecureStore.getItemAsync(STORAGE_KEYS.tokens),
        SecureStore.getItemAsync(STORAGE_KEYS.goalMode),
        SecureStore.getItemAsync(STORAGE_KEYS.history),
        SecureStore.getItemAsync(STORAGE_KEYS.lastFreeClaim),
      ]);

      const asyncPairs = await AsyncStorage.multiGet([
        STORAGE_KEYS.tokens,
        STORAGE_KEYS.goalMode,
        STORAGE_KEYS.history,
        STORAGE_KEYS.lastFreeClaim,
      ]);
      const asyncMap = Object.fromEntries(asyncPairs.map(([key, value]) => [key, value ?? null])) as Record<string, string | null>;

      const normalizeStored = (value: string | null | undefined): string | null => {
        if (value == null || value === '') return null;
        return value;
      };

      const tokensFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.tokens]);
      const tokensFromSecure = normalizeStored(tokensSecure);
      const goalModeFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.goalMode]);
      const goalModeFromSecure = normalizeStored(goalModeSecure);
      const historyFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.history]);
      const historyFromSecure = normalizeStored(historySecure);
      const lastFreeClaimFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.lastFreeClaim]);
      const lastFreeClaimFromSecure = normalizeStored(lastFreeClaimSecure);

      const tokensValue = tokensFromAsync ?? tokensFromSecure;
      const goalModeValue = goalModeFromAsync ?? goalModeFromSecure;
      const historyValue = historyFromAsync ?? historyFromSecure;
      const lastFreeClaimValue = lastFreeClaimFromAsync ?? lastFreeClaimFromSecure;

      const migrations: Promise<void>[] = [];
      if (tokensValue != null && tokensFromAsync == null) {
        migrations.push(persistAsync(STORAGE_KEYS.tokens, tokensValue));
      }
      if (tokensFromSecure != null && tokensFromAsync == null) {
        migrations.push(persistSecure(STORAGE_KEYS.tokens, null));
      }
      if (goalModeValue != null && goalModeFromAsync == null) {
        migrations.push(persistAsync(STORAGE_KEYS.goalMode, goalModeValue));
      }
      if (goalModeFromSecure != null && goalModeFromAsync == null) {
        migrations.push(persistSecure(STORAGE_KEYS.goalMode, null));
      }
      if (historyValue != null && historyFromAsync == null) {
        migrations.push(persistAsync(STORAGE_KEYS.history, historyValue));
      }
      if (historyFromSecure != null && historyFromAsync == null) {
        migrations.push(persistSecure(STORAGE_KEYS.history, null));
      }
      if (lastFreeClaimValue != null && lastFreeClaimFromAsync == null) {
        migrations.push(persistAsync(STORAGE_KEYS.lastFreeClaim, lastFreeClaimValue));
      }
      if (lastFreeClaimFromSecure != null && lastFreeClaimFromAsync == null) {
        migrations.push(persistSecure(STORAGE_KEYS.lastFreeClaim, null));
      }

      if (migrations.length > 0) {
        await Promise.all(migrations);
      }

      setState({
        subscriptionStatus: (subscriptionStatusSecure as SubscriptionStatus) || DEFAULT_STATE.subscriptionStatus,
        validUntil: normalizeStored(validUntilSecure) || DEFAULT_STATE.validUntil,
        lastVerified: normalizeStored(lastVerifiedSecure) || DEFAULT_STATE.lastVerified,
        subscriptionProductId: (subscriptionProductIdSecure as SubscriptionProductId | null) ?? DEFAULT_STATE.subscriptionProductId,
        latestReceipt: normalizeStored(latestReceiptSecure) || DEFAULT_STATE.latestReceipt,
        tokens: tokensValue ? Math.min(TOKEN_CAP, Number(tokensValue)) : DEFAULT_STATE.tokens,
        goalMode: sanitizeGoalMode(goalModeValue),
        history: parseHistory(historyValue),
        lastFreeClaim: normalizeStored(lastFreeClaimValue) || DEFAULT_STATE.lastFreeClaim,
      });
      setHydrated(true);
    })();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setState((prev) => {
      if (prev.validUntil) {
        const expiryMs = new Date(prev.validUntil).getTime();
        if (Number.isFinite(expiryMs) && expiryMs < Date.now()) {
          if (prev.subscriptionStatus === 'active') {
            return { ...prev, subscriptionStatus: 'expired' };
          }
        } else if (Number.isFinite(expiryMs) && expiryMs >= Date.now() && prev.subscriptionStatus === 'expired') {
          return { ...prev, subscriptionStatus: 'active' };
        }
      }
      return prev;
    });
  }, [state.validUntil, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    (async () => {
      try {
        await Promise.all([
          persistSecure(STORAGE_KEYS.subscriptionStatus, state.subscriptionStatus),
          persistSecure(STORAGE_KEYS.validUntil, state.validUntil),
          persistSecure(STORAGE_KEYS.lastVerified, state.lastVerified),
          persistSecure(STORAGE_KEYS.subscriptionProductId, state.subscriptionProductId),
          persistSecure(STORAGE_KEYS.latestReceipt, state.latestReceipt),
          persistAsync(STORAGE_KEYS.tokens, String(state.tokens)),
          persistAsync(STORAGE_KEYS.goalMode, state.goalMode),
          persistAsync(STORAGE_KEYS.history, JSON.stringify(state.history)),
          persistAsync(STORAGE_KEYS.lastFreeClaim, state.lastFreeClaim),
        ]);
      } catch (err) {
        console.warn('State persistence failed', err);
      }
    })();
  }, [state, hydrated]);

  const setSubscription = useCallback(
    (payload: { status: SubscriptionStatus; validUntil: string | null; productId: SubscriptionProductId | null; receipt?: string | null; lastVerified?: string | null }) => {
      setState((prev) => {
        const nextReceipt = payload.receipt ?? prev.latestReceipt ?? null;
        const nextLastVerified = payload.lastVerified ?? prev.lastVerified ?? null;
        void persistSecure(STORAGE_KEYS.subscriptionStatus, payload.status);
        void persistSecure(STORAGE_KEYS.validUntil, payload.validUntil);
        void persistSecure(STORAGE_KEYS.subscriptionProductId, payload.productId);
        void persistSecure(STORAGE_KEYS.latestReceipt, nextReceipt);
        void persistSecure(STORAGE_KEYS.lastVerified, nextLastVerified);
        return {
          ...prev,
          subscriptionStatus: payload.status,
          validUntil: payload.validUntil,
          subscriptionProductId: payload.productId,
          latestReceipt: nextReceipt,
          lastVerified: nextLastVerified,
        };
      });
    },
    []
  );

  const markSubscriptionFromPurchase = useCallback(
    ({ productId, purchaseTime, receipt }: { productId: SubscriptionProductId; purchaseTime: number; receipt?: string | null }) => {
      const meta = SUBSCRIPTION_PRODUCTS.find((item) => item.productId === productId);
      const now = Date.now();
      const purchaseMs = Number.isFinite(purchaseTime) ? purchaseTime : now;
      const durationMs = (meta?.durationDays ?? 30) * 24 * 60 * 60 * 1000;
      const validUntilIso = new Date(purchaseMs + durationMs).toISOString();
      const verifiedIso = new Date().toISOString();
      setState((prev) => {
        const nextReceipt = receipt ?? prev.latestReceipt ?? null;
        void persistSecure(STORAGE_KEYS.subscriptionStatus, 'active');
        void persistSecure(STORAGE_KEYS.validUntil, validUntilIso);
        void persistSecure(STORAGE_KEYS.subscriptionProductId, productId);
        void persistSecure(STORAGE_KEYS.latestReceipt, nextReceipt);
        void persistSecure(STORAGE_KEYS.lastVerified, verifiedIso);
        return {
          ...prev,
          subscriptionStatus: 'active',
          validUntil: validUntilIso,
          subscriptionProductId: productId,
          latestReceipt: nextReceipt,
          lastVerified: verifiedIso,
        };
      });
    },
    []
  );

  const clearSubscription = useCallback(() => {
    setState((prev) => ({
      ...prev,
      subscriptionStatus: 'none',
      validUntil: null,
      subscriptionProductId: null,
      latestReceipt: null,
      lastVerified: null,
    }));
    void persistSecure(STORAGE_KEYS.subscriptionStatus, 'none');
    void persistSecure(STORAGE_KEYS.validUntil, null);
    void persistSecure(STORAGE_KEYS.subscriptionProductId, null);
    void persistSecure(STORAGE_KEYS.latestReceipt, null);
    void persistSecure(STORAGE_KEYS.lastVerified, null);
  }, []);

  const setLastVerified = useCallback((iso: string) => {
    setState((prev) => {
      if (prev.lastVerified === iso) {
        return prev;
      }
      void persistSecure(STORAGE_KEYS.lastVerified, iso);
      return { ...prev, lastVerified: iso };
    });
  }, []);

  const earnTokens = useCallback((count: number) => {
    if (count <= 0) return;
    setState((prev) => {
      const nextTokens = Math.min(TOKEN_CAP, prev.tokens + count);
      if (nextTokens === prev.tokens) {
        return prev;
      }
      void persistAsync(STORAGE_KEYS.tokens, String(nextTokens));
      return { ...prev, tokens: nextTokens };
    });
  }, []);

  const consumeToken = useCallback(() => {
    let allowed = false;
    let nextTokenValue: number | null = null;
    setState((prev) => {
      if (prev.subscriptionStatus === 'active') {
        allowed = true;
        return prev;
      }
      if (prev.tokens > 0) {
        allowed = true;
        const nextTokens = Math.max(0, prev.tokens - 1);
        nextTokenValue = nextTokens;
        return { ...prev, tokens: nextTokens };
      }
      allowed = false;
      return prev;
    });
    if (nextTokenValue != null) {
      void persistAsync(STORAGE_KEYS.tokens, String(nextTokenValue));
    }
    return allowed;
  }, []);

  const setGoalMode = useCallback((mode: GoalMode) => {
    setState((prev) => {
      if (prev.goalMode === mode) {
        return prev;
      }
      void persistAsync(STORAGE_KEYS.goalMode, mode);
      return { ...prev, goalMode: mode };
    });
  }, []);

  const addOrUpdateScanResult = useCallback((result: ScanResult) => {
    setState((prev) => {
      const without = prev.history.filter((entry) => entry.id !== result.id);
      const nextHistory = [result, ...without].slice(0, HISTORY_LIMIT);
      void persistAsync(STORAGE_KEYS.history, JSON.stringify(nextHistory));
      return {
        ...prev,
        history: nextHistory,
      };
    });
  }, []);

  const removeScanResult = useCallback((id: string) => {
    setState((prev) => {
      const nextHistory = prev.history.filter((entry) => entry.id !== id);
      if (nextHistory.length === prev.history.length) {
        return prev;
      }
      void persistAsync(STORAGE_KEYS.history, JSON.stringify(nextHistory));
      return { ...prev, history: nextHistory };
    });
  }, []);

  const clearHistory = useCallback(() => {
    setState((prev) => {
      if (prev.history.length === 0) {
        return prev;
      }
      void persistAsync(STORAGE_KEYS.history, JSON.stringify([]));
      return { ...prev, history: [] };
    });
  }, []);

  const claimFreeTokens = useCallback(async () => {
    const now = Date.now();
    let nextTokensValue: number | null = null;
    let nextClaimIso: string | null = null;

    setState((prev) => {
      if (prev.tokens >= TOKEN_CAP) {
        return prev;
      }
      const lastClaimMs = prev.lastFreeClaim ? new Date(prev.lastFreeClaim).getTime() : NaN;
      const cooldownReady = !Number.isFinite(lastClaimMs) || now - lastClaimMs >= FREE_CLAIM_INTERVAL_MS;
      if (!cooldownReady) {
        return prev;
      }
      const computedTokens = Math.min(TOKEN_CAP, prev.tokens + FREE_CLAIM_AMOUNT);
      const computedClaimIso = new Date(now).toISOString();
      nextTokensValue = computedTokens;
      nextClaimIso = computedClaimIso;
      return {
        ...prev,
        tokens: computedTokens,
        lastFreeClaim: computedClaimIso,
      };
    });

    if (nextTokensValue == null || nextClaimIso == null) {
      return false;
    }

    await persistAsync(STORAGE_KEYS.tokens, String(nextTokensValue));
    await persistAsync(STORAGE_KEYS.lastFreeClaim, nextClaimIso);
    return true;
  }, []);

  const api = useMemo<AppContextType>(
    () => ({
      ...state,
      setSubscription,
      markSubscriptionFromPurchase,
      clearSubscription,
      setLastVerified,
      earnTokens,
      consumeToken,
      setGoalMode,
      addOrUpdateScanResult,
      removeScanResult,
      clearHistory,
      claimFreeTokens,
    }),
    [
      state,
      setSubscription,
      markSubscriptionFromPurchase,
      clearSubscription,
      setLastVerified,
      earnTokens,
      consumeToken,
      setGoalMode,
      addOrUpdateScanResult,
      removeScanResult,
      clearHistory,
      claimFreeTokens,
    ]
  );

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
};

export const useApp = (): AppContextType => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

export type { ScanResult, ScanMetrics };


