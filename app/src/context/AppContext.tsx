import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import { SUBSCRIPTION_PRODUCTS, SubscriptionProductId } from '../constants/subscriptions';
import { storage } from '../utils/storage';

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

type UserProfile = {
  currentWeight?: number;
  goalWeight?: number;
  weeklyBudgetDollars?: number;
  calorieTarget?: number;
  name?: string;
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
  onboardingComplete: boolean;
  profile: UserProfile;
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
  setProfile: (updates: Partial<UserProfile>) => void;
  completeOnboarding: () => void;
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
  onboardingComplete: false,
  profile: {},
};

// Underscore-only keys to satisfy SecureStore rules (alphanumeric, '.', '-', '_')
const STORAGE_KEYS = {
  subscriptionStatus: 'app_subscription_status',
  validUntil: 'app_valid_until',
  lastVerified: 'app_last_verified',
  subscriptionProductId: 'app_subscription_product_id',
  latestReceipt: 'app_subscription_receipt',
  tokens: 'app_tokens',
  goalMode: 'app_goal_mode',
  history: 'app_history',
  lastFreeClaim: 'app_last_free_claim',
  onboardingComplete: 'app_onboarding_complete',
  profile: 'app_profile',
};

// Legacy keys that contained slashes; kept for migration
const LEGACY_STORAGE_KEYS = {
  subscriptionStatus: 'app/subscription_status',
  validUntil: 'app/valid_until',
  lastVerified: 'app/last_verified',
  subscriptionProductId: 'app/subscription_product_id',
  latestReceipt: 'app/subscription_receipt',
  tokens: 'app/tokens',
  goalMode: 'app/goal_mode',
  history: 'app/history',
  lastFreeClaim: 'app/last_free_claim',
  onboardingComplete: 'app/onboarding_complete',
  profile: 'app/profile',
};

const HISTORY_LIMIT = 50;

const TOKEN_CAP = 20;
const FREE_CLAIM_AMOUNT = 10;
const FREE_CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000;

const AppContext = createContext<AppContextType | undefined>(undefined);

const safeSecureGet = async (key: string): Promise<string | null> => {
  try {
    const v = await SecureStore.getItemAsync(key);
    return v ?? null;
  } catch (err) {
    console.warn('SecureStore read failed', key, err);
    return null;
  }
};

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
    await storage.setItem(key, value);
  } catch (err) {
    console.warn('Async persistence failed', key, err);
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

const parseProfile = (raw: string | null): UserProfile => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    const maybeNumber = (val: any): number | undefined => {
      const n = Number(val);
      return Number.isFinite(n) ? n : undefined;
    };
    return {
      currentWeight: maybeNumber(parsed.currentWeight),
      goalWeight: maybeNumber(parsed.goalWeight),
      weeklyBudgetDollars: maybeNumber(parsed.weeklyBudgetDollars),
      calorieTarget: maybeNumber(parsed.calorieTarget),
      name: typeof parsed.name === 'string' ? parsed.name : undefined,
    };
  } catch (err) {
    console.warn('Failed to parse profile store', err);
    return {};
  }
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AppState>(DEFAULT_STATE);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
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
        onboardingCompleteSecure,
        profileSecure,
        legacySubscriptionStatusSecure,
        legacyValidUntilSecure,
        legacyLastVerifiedSecure,
        legacySubscriptionProductIdSecure,
        legacyLatestReceiptSecure,
        legacyTokensSecure,
        legacyGoalModeSecure,
        legacyHistorySecure,
        legacyLastFreeClaimSecure,
        legacyOnboardingCompleteSecure,
        legacyProfileSecure,
      ] = await Promise.all([
        safeSecureGet(STORAGE_KEYS.subscriptionStatus),
        safeSecureGet(STORAGE_KEYS.validUntil),
        safeSecureGet(STORAGE_KEYS.lastVerified),
        safeSecureGet(STORAGE_KEYS.subscriptionProductId),
        safeSecureGet(STORAGE_KEYS.latestReceipt),
        safeSecureGet(STORAGE_KEYS.tokens),
        safeSecureGet(STORAGE_KEYS.goalMode),
        safeSecureGet(STORAGE_KEYS.history),
        safeSecureGet(STORAGE_KEYS.lastFreeClaim),
        safeSecureGet(STORAGE_KEYS.onboardingComplete),
        safeSecureGet(STORAGE_KEYS.profile),
        safeSecureGet(LEGACY_STORAGE_KEYS.subscriptionStatus),
        safeSecureGet(LEGACY_STORAGE_KEYS.validUntil),
        safeSecureGet(LEGACY_STORAGE_KEYS.lastVerified),
        safeSecureGet(LEGACY_STORAGE_KEYS.subscriptionProductId),
        safeSecureGet(LEGACY_STORAGE_KEYS.latestReceipt),
        safeSecureGet(LEGACY_STORAGE_KEYS.tokens),
        safeSecureGet(LEGACY_STORAGE_KEYS.goalMode),
        safeSecureGet(LEGACY_STORAGE_KEYS.history),
        safeSecureGet(LEGACY_STORAGE_KEYS.lastFreeClaim),
        safeSecureGet(LEGACY_STORAGE_KEYS.onboardingComplete),
        safeSecureGet(LEGACY_STORAGE_KEYS.profile),
      ]);

        const asyncPairs = await storage.multiGet([
          STORAGE_KEYS.tokens,
          STORAGE_KEYS.goalMode,
          STORAGE_KEYS.history,
          STORAGE_KEYS.lastFreeClaim,
          STORAGE_KEYS.onboardingComplete,
          STORAGE_KEYS.profile,
        LEGACY_STORAGE_KEYS.tokens,
        LEGACY_STORAGE_KEYS.goalMode,
        LEGACY_STORAGE_KEYS.history,
        LEGACY_STORAGE_KEYS.lastFreeClaim,
        LEGACY_STORAGE_KEYS.onboardingComplete,
        LEGACY_STORAGE_KEYS.profile,
        ]);
        const asyncMap = Object.fromEntries(asyncPairs.map(([key, value]) => [key, value ?? null])) as Record<string, string | null>;

        const normalizeStored = (value: string | null | undefined): string | null => {
          if (value == null || value === '') return null;
          return value;
        };

        const tokensFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.tokens]) ?? normalizeStored(asyncMap[LEGACY_STORAGE_KEYS.tokens]);
        const tokensFromSecure = normalizeStored(tokensSecure) ?? normalizeStored(legacyTokensSecure);
        const goalModeFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.goalMode]) ?? normalizeStored(asyncMap[LEGACY_STORAGE_KEYS.goalMode]);
        const goalModeFromSecure = normalizeStored(goalModeSecure) ?? normalizeStored(legacyGoalModeSecure);
        const historyFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.history]) ?? normalizeStored(asyncMap[LEGACY_STORAGE_KEYS.history]);
        const historyFromSecure = normalizeStored(historySecure) ?? normalizeStored(legacyHistorySecure);
        const lastFreeClaimFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.lastFreeClaim]) ?? normalizeStored(asyncMap[LEGACY_STORAGE_KEYS.lastFreeClaim]);
        const lastFreeClaimFromSecure = normalizeStored(lastFreeClaimSecure) ?? normalizeStored(legacyLastFreeClaimSecure);
        const onboardingFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.onboardingComplete]) ?? normalizeStored(asyncMap[LEGACY_STORAGE_KEYS.onboardingComplete]);
        const onboardingFromSecure = normalizeStored(onboardingCompleteSecure) ?? normalizeStored(legacyOnboardingCompleteSecure);
        const profileFromAsync = normalizeStored(asyncMap[STORAGE_KEYS.profile]) ?? normalizeStored(asyncMap[LEGACY_STORAGE_KEYS.profile]);
        const profileFromSecure = normalizeStored(profileSecure) ?? normalizeStored(legacyProfileSecure);
        const subscriptionStatusFromSecure = normalizeStored(subscriptionStatusSecure) ?? normalizeStored(legacySubscriptionStatusSecure);
        const validUntilFromSecure = normalizeStored(validUntilSecure) ?? normalizeStored(legacyValidUntilSecure);
        const lastVerifiedFromSecure = normalizeStored(lastVerifiedSecure) ?? normalizeStored(legacyLastVerifiedSecure);
        const subscriptionProductIdFromSecure = normalizeStored(subscriptionProductIdSecure) ?? normalizeStored(legacySubscriptionProductIdSecure);
        const latestReceiptFromSecure = normalizeStored(latestReceiptSecure) ?? normalizeStored(legacyLatestReceiptSecure);

        const tokensValue = tokensFromAsync ?? tokensFromSecure;
        const goalModeValue = goalModeFromAsync ?? goalModeFromSecure;
        const historyValue = historyFromAsync ?? historyFromSecure;
        const lastFreeClaimValue = lastFreeClaimFromAsync ?? lastFreeClaimFromSecure;
        const onboardingValue = onboardingFromAsync ?? onboardingFromSecure;
        const profileValue = profileFromAsync ?? profileFromSecure;

        const migrations: Promise<void>[] = [];
        // Migrate legacy -> new keys
        const migrateIfLegacy = (value: string | null, fromAsync: string | null, legacyKey: string, newKey: string) => {
          if (value != null && fromAsync == null && asyncMap[newKey] == null) {
            migrations.push(persistAsync(newKey, value));
          }
          if (legacyKey && asyncMap[legacyKey] != null) {
            migrations.push(persistAsync(legacyKey, null));
          }
        };

        migrateIfLegacy(tokensValue, tokensFromAsync, LEGACY_STORAGE_KEYS.tokens, STORAGE_KEYS.tokens);
        migrateIfLegacy(goalModeValue, goalModeFromAsync, LEGACY_STORAGE_KEYS.goalMode, STORAGE_KEYS.goalMode);
        migrateIfLegacy(historyValue, historyFromAsync, LEGACY_STORAGE_KEYS.history, STORAGE_KEYS.history);
        migrateIfLegacy(lastFreeClaimValue, lastFreeClaimFromAsync, LEGACY_STORAGE_KEYS.lastFreeClaim, STORAGE_KEYS.lastFreeClaim);
        migrateIfLegacy(onboardingValue, onboardingFromAsync, LEGACY_STORAGE_KEYS.onboardingComplete, STORAGE_KEYS.onboardingComplete);
        migrateIfLegacy(profileValue, profileFromAsync, LEGACY_STORAGE_KEYS.profile, STORAGE_KEYS.profile);

        if (subscriptionStatusFromSecure && subscriptionStatusSecure == null && legacySubscriptionStatusSecure != null) {
          migrations.push(persistSecure(STORAGE_KEYS.subscriptionStatus, subscriptionStatusFromSecure));
          migrations.push(persistSecure(LEGACY_STORAGE_KEYS.subscriptionStatus, null));
        }
        if (validUntilFromSecure && validUntilSecure == null && legacyValidUntilSecure != null) {
          migrations.push(persistSecure(STORAGE_KEYS.validUntil, validUntilFromSecure));
          migrations.push(persistSecure(LEGACY_STORAGE_KEYS.validUntil, null));
        }
        if (lastVerifiedFromSecure && lastVerifiedSecure == null && legacyLastVerifiedSecure != null) {
          migrations.push(persistSecure(STORAGE_KEYS.lastVerified, lastVerifiedFromSecure));
          migrations.push(persistSecure(LEGACY_STORAGE_KEYS.lastVerified, null));
        }
        if (subscriptionProductIdFromSecure && subscriptionProductIdSecure == null && legacySubscriptionProductIdSecure != null) {
          migrations.push(persistSecure(STORAGE_KEYS.subscriptionProductId, subscriptionProductIdFromSecure));
          migrations.push(persistSecure(LEGACY_STORAGE_KEYS.subscriptionProductId, null));
        }
        if (latestReceiptFromSecure && latestReceiptSecure == null && legacyLatestReceiptSecure != null) {
          migrations.push(persistSecure(STORAGE_KEYS.latestReceipt, latestReceiptFromSecure));
          migrations.push(persistSecure(LEGACY_STORAGE_KEYS.latestReceipt, null));
        }

        if (migrations.length > 0) {
          await Promise.all(migrations);
        }

        if (cancelled) return;
        setState({
          subscriptionStatus: (subscriptionStatusFromSecure as SubscriptionStatus) || DEFAULT_STATE.subscriptionStatus,
          validUntil: normalizeStored(validUntilFromSecure) || DEFAULT_STATE.validUntil,
          lastVerified: normalizeStored(lastVerifiedFromSecure) || DEFAULT_STATE.lastVerified,
          subscriptionProductId: (subscriptionProductIdFromSecure as SubscriptionProductId | null) ?? DEFAULT_STATE.subscriptionProductId,
          latestReceipt: normalizeStored(latestReceiptFromSecure) || DEFAULT_STATE.latestReceipt,
          tokens: tokensValue ? Math.min(TOKEN_CAP, Number(tokensValue)) : DEFAULT_STATE.tokens,
          goalMode: sanitizeGoalMode(goalModeValue),
          history: parseHistory(historyValue),
          lastFreeClaim: normalizeStored(lastFreeClaimValue) || DEFAULT_STATE.lastFreeClaim,
          onboardingComplete: onboardingValue === 'true',
          profile: parseProfile(profileValue),
        });
      } catch (err) {
        console.warn('App state hydration failed; falling back to defaults', err);
        if (!cancelled) {
          setState(DEFAULT_STATE);
        }
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
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
          persistAsync(STORAGE_KEYS.onboardingComplete, state.onboardingComplete ? 'true' : 'false'),
          persistAsync(STORAGE_KEYS.profile, JSON.stringify(state.profile ?? {})),
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

  const setProfile = useCallback((updates: Partial<UserProfile>) => {
    setState((prev) => {
      const nextProfile = { ...prev.profile, ...updates };
      void persistAsync(STORAGE_KEYS.profile, JSON.stringify(nextProfile));
      return { ...prev, profile: nextProfile };
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((prev) => {
      if (prev.onboardingComplete) return prev;
      void persistAsync(STORAGE_KEYS.onboardingComplete, 'true');
      return { ...prev, onboardingComplete: true };
    });
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
      setProfile,
      completeOnboarding,
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
      setProfile,
      completeOnboarding,
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


