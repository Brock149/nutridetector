import { Platform } from 'react-native';
import {
  initConnection,
  endConnection,
  fetchProducts,
  requestPurchase,
  purchaseUpdatedListener,
  purchaseErrorListener,
  getAvailablePurchases,
  finishTransaction,
  clearTransactionIOS,
  ErrorCode,
} from 'react-native-iap';
import type { Purchase } from 'react-native-iap';
import { SUBSCRIPTION_PRODUCT_IDS, SubscriptionProductId } from '../constants/subscriptions';

type PurchaseInfo = {
  productId: SubscriptionProductId;
  purchaseTime: number;
  receipt?: string | null;
  transactionId?: string | null;
};

export type SubscriptionProductInfo = {
  id: string;
  title: string;
  description: string;
  displayName?: string | null;
  displayPrice: string;
};

let purchaseUpdateSubscription: ReturnType<typeof purchaseUpdatedListener> | null = null;
let purchaseErrorSubscription: ReturnType<typeof purchaseErrorListener> | null = null;

export async function initializeIap(): Promise<void> {
  const connected = await initConnection();
  if (!connected) {
    throw new Error('Failed to connect to billing client.');
  }
  if (Platform.OS === 'ios') {
    try {
      await clearTransactionIOS();
    } catch (err) {
      console.warn('Failed to clear pending iOS transactions', err);
    }
  }
}

export async function getAvailableSubscriptions(): Promise<SubscriptionProductInfo[]> {
  const results = await fetchProducts({ skus: SUBSCRIPTION_PRODUCT_IDS, type: 'subs' });
  if (!results || !Array.isArray(results)) return [];
  return results.map((item: any) => ({
    id: item.id,
    title: item.title,
    description: item.description,
    displayName: item.displayName ?? (item.displayNameIOS ?? null),
    displayPrice: item.displayPrice ?? item.price ?? '',
  }));
}

export async function requestSubscription(productId: SubscriptionProductId) {
  await requestPurchase({
    type: 'subs',
    request: {
      android: {
        skus: [productId],
      },
      ios: {
        sku: productId,
        andDangerouslyFinishTransactionAutomatically: false,
      },
    },
  });
}

export function subscribeToPurchaseUpdates(listener: (purchase: PurchaseInfo | null, status: 'success' | 'error' | 'restored') => void) {
  purchaseUpdateSubscription?.remove();
  purchaseErrorSubscription?.remove();

  purchaseUpdateSubscription = purchaseUpdatedListener(async (purchase) => {
    if (!purchase || !SUBSCRIPTION_PRODUCT_IDS.includes(purchase.productId as SubscriptionProductId)) {
      return;
    }

    const state = purchase.purchaseState;
    const info = normalizePurchase(purchase);
    const isSuccess = state === 'purchased';
    const isRestored = state === 'restored';

    if (!isSuccess && !isRestored) {
      listener(null, 'error');
      return;
    }

    try {
      await finishTransaction({ purchase, isConsumable: false });
    } catch (err) {
      console.warn('Failed to finish transaction', err);
    }

    listener(info, isSuccess ? 'success' : isRestored ? 'restored' : 'error');
  });

  purchaseErrorSubscription = purchaseErrorListener((error) => {
    if (error?.code === ErrorCode.UserCancelled) {
      listener(null, 'error');
      return;
    }
    console.warn('Purchase error', error);
    listener(null, 'error');
  });

  return () => {
    purchaseUpdateSubscription?.remove();
    purchaseErrorSubscription?.remove();
    purchaseUpdateSubscription = null;
    purchaseErrorSubscription = null;
  };
}

export async function restoreSubscriptions() {
  const purchases = (await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true })) ?? [];
  return purchases
    .filter((entry) => SUBSCRIPTION_PRODUCT_IDS.includes(entry.productId as SubscriptionProductId))
    .map(normalizePurchase);
}

export async function disconnectIap() {
  purchaseUpdateSubscription?.remove();
  purchaseErrorSubscription?.remove();
  purchaseUpdateSubscription = null;
  purchaseErrorSubscription = null;
  await endConnection();
}

const normalizePurchase = (entry: Purchase): PurchaseInfo => ({
  productId: entry.productId as SubscriptionProductId,
  purchaseTime: entry.transactionDate ?? Date.now(),
  receipt: entry.purchaseToken ?? entry.id ?? null,
  transactionId: entry.id ?? null,
});


