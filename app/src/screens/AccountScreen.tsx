import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useNavigation } from '@react-navigation/native';
import { SUBSCRIPTION_PRODUCTS, SubscriptionProductId } from '../constants/subscriptions';
import type { SubscriptionProductInfo } from '../services/subscriptionService';
import {
  disconnectIap,
  getAvailableSubscriptions,
  initializeIap,
  requestSubscription,
  restoreSubscriptions,
  subscribeToPurchaseUpdates,
} from '../services/subscriptionService';

export default function AccountScreen() {
  const { tokens, subscriptionStatus, earnTokens, subscriptionProductId, validUntil, markSubscriptionFromPurchase, clearSubscription } = useApp();
  const navigation = useNavigation<any>();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<SubscriptionProductInfo[]>([]);
  const [initialised, setInitialised] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);

type UiProduct = (typeof SUBSCRIPTION_PRODUCTS)[number] & {
  localizedTitle: string;
  localizedDescription: string;
  priceLabel: string;
};

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        setLoading(true);
        await initializeIap();
        const fetched = await getAvailableSubscriptions();
        setProducts(fetched ?? []);
        unsubscribe = subscribeToPurchaseUpdates((purchase, status) => {
          if (!purchase) {
            if (status === 'error') {
              Alert.alert('Purchase failed', 'Unable to complete subscription.');
            }
            return;
          }
          markSubscriptionFromPurchase({
            productId: purchase.productId,
            purchaseTime: purchase.purchaseTime,
            receipt: purchase.receipt,
          });
          if (status === 'success') {
            Alert.alert('Subscription active', 'Unlimited scans unlocked.');
          }
        });
        setInitialised(true);
      } catch (err: any) {
        console.warn('init iap failed', err);
        Alert.alert('Store unavailable', err?.message ?? 'Unable to connect to the store right now.');
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      if (unsubscribe) unsubscribe();
      disconnectIap().catch(() => undefined);
    };
  }, [markSubscriptionFromPurchase]);

  const uiProducts = useMemo<UiProduct[]>(() => {
    return SUBSCRIPTION_PRODUCTS.map((meta) => {
      const match = products.find((item) => item.id === meta.productId);
      return {
        ...meta,
        localizedTitle: match?.displayName ?? match?.title ?? meta.displayName,
        localizedDescription: match?.description ?? meta.marketingBlurb,
        priceLabel: match?.displayPrice ?? meta.marketingBlurb,
      } satisfies UiProduct;
    });
  }, [products]);

  const handleSubscribe = async (productId: string) => {
    try {
      setLoading(true);
      await requestSubscription(productId as SubscriptionProductId);
    } catch (err: any) {
      Alert.alert('Unable to subscribe', err?.message ?? 'Unknown error.');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    try {
      setLoading(true);
      const purchases = await restoreSubscriptions();
      if (!purchases.length) {
        Alert.alert('No purchases found', 'No active subscriptions to restore.');
        return;
      }
      const latest = purchases.sort((a, b) => b.purchaseTime - a.purchaseTime)[0];
      markSubscriptionFromPurchase(latest);
      Alert.alert('Restored', 'Your subscription has been restored.');
    } catch (err: any) {
      Alert.alert('Restore failed', err?.message ?? 'Unable to restore purchases.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = () => {
    clearSubscription();
  };

  const statusLine = useMemo(() => {
    if (subscriptionStatus === 'active' && validUntil) {
      const date = new Date(validUntil);
      return `Active until ${date.toLocaleDateString()}`;
    }
    if (subscriptionStatus === 'expired') {
      return 'Expired';
    }
    return 'None';
  }, [subscriptionStatus, validUntil]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Account</Text>
            <Text style={styles.subtitle}>Manage your plan and tokens</Text>
          </View>
          {__DEV__ && (
            <TouchableOpacity
              onPress={() => setShowDevTools((prev) => !prev)}
              style={[styles.devToggle, showDevTools && styles.devToggleActive]}
            >
              <Text style={[styles.devToggleLabel, showDevTools && styles.devToggleLabelActive]}>
                {showDevTools ? 'Hide' : 'Show'} dev tools
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.statRow}>
            <View>
              <Text style={styles.statLabel}>Token balance</Text>
              <Text style={styles.statValue}>{tokens}</Text>
            </View>
            <View>
              <Text style={styles.statLabel}>Subscription</Text>
              <Text style={styles.statValue}>{statusLine}</Text>
            </View>
          </View>
          {subscriptionProductId ? (
            <Text style={styles.planBadge}>Current plan: {subscriptionProductId}</Text>
          ) : null}
          {loading ? (
            <View style={styles.loaderRow}>
              <ActivityIndicator size="small" color="rgba(0,0,0,0.4)" />
              <Text style={styles.loaderText}>Talking to the store…</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Upgrade</Text>
          <Text style={styles.sectionDescription}>Unlock unlimited scans with one of the plans below.</Text>
          {uiProducts.map((item) => {
            const isActive = subscriptionProductId === item.productId;
            return (
              <View key={item.productId} style={[styles.productCard, isActive && styles.productCardActive]}>
                <View style={styles.productHeader}>
                  <Text style={styles.productTitle}>{item.localizedTitle}</Text>
                  <Text style={styles.productPrice}>{item.priceLabel}</Text>
                </View>
                <Text style={styles.productDescription}>{item.localizedDescription}</Text>
                <AccountButton
                  label={isActive ? 'Manage (Device Settings)' : 'Subscribe'}
                  onPress={() => handleSubscribe(item.productId)}
                  disabled={!initialised || isActive}
                  tone={isActive ? 'outline' : 'primary'}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Manage</Text>
          <Text style={styles.sectionDescription}>Restore an existing purchase or clear the local subscription state.</Text>
          <AccountButton
            label="Restore Purchases"
            onPress={handleRestore}
            disabled={!initialised}
            tone="secondary"
          />
          <AccountButton label="Remove Subscription" onPress={handleSignOut} tone="danger" />
        </View>

        {__DEV__ && showDevTools && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Developer Tools</Text>
            <Text style={styles.sectionDescription}>Quick helpers for local testing.</Text>
            <AccountButton label="Add +5 Test Tokens" onPress={() => earnTokens(5)} tone="ghost" />
            <AccountButton label="Open TFLite Repro" onPress={() => navigation.navigate('TfliteRepro')} tone="ghost" />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}


type AccountButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
};

function AccountButton({ label, onPress, disabled, tone = 'primary' }: AccountButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.button,
        tone === 'primary' && styles.buttonPrimary,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'outline' && styles.buttonOutline,
        tone === 'danger' && styles.buttonDanger,
        tone === 'ghost' && styles.buttonGhost,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          tone === 'outline' && styles.buttonLabelOutline,
          tone === 'ghost' && styles.buttonLabelGhost,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f2f2f7',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  devToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
  },
  devToggleActive: {
    backgroundColor: '#0a84ff',
  },
  devToggleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  devToggleLabelActive: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statLabel: {
    fontSize: 13,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  planBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#eef2ff',
    color: '#3730a3',
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
  },
  loaderText: {
    fontSize: 14,
    color: '#6b7280',
    marginLeft: 8,
  },
  productCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fafafa',
  },
  productCardActive: {
    borderColor: '#0a84ff',
    backgroundColor: '#f0f9ff',
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    flexWrap: 'wrap',
    paddingRight: 12,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0a84ff',
    textAlign: 'right',
    maxWidth: 120,
  },
  productDescription: {
    fontSize: 14,
    color: '#4b5563',
    marginBottom: 12,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  buttonPrimary: {
    backgroundColor: '#0a84ff',
  },
  buttonSecondary: {
    backgroundColor: '#1f2937',
  },
  buttonOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#0a84ff',
    backgroundColor: 'transparent',
  },
  buttonDanger: {
    backgroundColor: '#ff3b30',
  },
  buttonGhost: {
    backgroundColor: '#eef2ff',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  buttonLabelOutline: {
    color: '#0a84ff',
  },
  buttonLabelGhost: {
    color: '#1f2937',
  },
});

