import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Alert,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useApp } from '../context/AppContext';
import { useFocusEffect } from '@react-navigation/native';
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
import { LinearGradient } from 'expo-linear-gradient';

const BRAND_SLATE = '#0b1917';
const PANEL_SLATE = '#10201d';
const CARD_OVERLAY = 'rgba(22,49,45,0.72)';
const CARD_BORDER = 'rgba(255,255,255,0.08)';
const TEXT_PRIMARY = '#f6fffb';
const TEXT_MUTED = 'rgba(246,255,251,0.65)';
const TEXT_SOFT = 'rgba(246,255,251,0.45)';
const BRAND_MINT = '#2cd0b1';
const BRAND_MINT_SOFT = 'rgba(44,208,177,0.18)';
const DANGER_BG = 'rgba(255,86,94,0.18)';
const DANGER_BORDER = 'rgba(255,86,94,0.32)';
const DANGER_TEXT = '#ff9a9a';
const TOKEN_CAP = 20;
const FREE_CLAIM_AMOUNT = 10;
const FREE_CLAIM_INTERVAL_MS = 24 * 60 * 60 * 1000;
const TERMS_URL = 'https://bactech.online/terms.html';
const PRIVACY_URL = 'https://bactech.online/privacy.html';

type UiProduct = {
  productId: SubscriptionProductId;
  durationDays: number;
  displayName: string;
  marketingBlurb: string;
  priceLabel: string;
  localizedTitle: string;
  localizedDescription: string;
};


export default function AccountScreen() {
  const {
    tokens,
    subscriptionStatus,
    subscriptionProductId,
    validUntil,
    markSubscriptionFromPurchase,
    clearSubscription,
    lastFreeClaim,
    claimFreeTokens,
    setSubscription,
    setLastVerified,
  } = useApp();
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<SubscriptionProductInfo[]>([]);
  const [initialised, setInitialised] = useState(false);
  const lastRestoreRef = useRef<number>(0);

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

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      const syncEntitlement = async () => {
        if (!initialised) return;
        const now = Date.now();
        const INTERVAL_MS = 15 * 60 * 1000;
        const shouldRefresh = now - lastRestoreRef.current >= INTERVAL_MS || subscriptionStatus !== 'active';
        if (!shouldRefresh) return;
        try {
          const purchases = await restoreSubscriptions();
          if (cancelled) return;
          lastRestoreRef.current = now;
          if (purchases.length) {
            const latest = purchases.sort((a, b) => b.purchaseTime - a.purchaseTime)[0];
            markSubscriptionFromPurchase(latest);
          } else if (subscriptionStatus === 'active') {
            const verifiedIso = new Date(now).toISOString();
            setSubscription({ status: 'expired', validUntil: null, productId: null, lastVerified: verifiedIso, receipt: null });
          } else {
            setLastVerified(new Date(now).toISOString());
          }
        } catch (err) {
          if (!cancelled) {
            console.warn('Auto restore check failed', err);
          }
        }
      };
      syncEntitlement();
      return () => {
        cancelled = true;
      };
    }, [initialised, subscriptionStatus, markSubscriptionFromPurchase, setSubscription, setLastVerified, restoreSubscriptions])
  );

  const uiProducts = useMemo<UiProduct[]>(() =>
    SUBSCRIPTION_PRODUCTS.map((meta) => {
      const match = products.find((item) => item.id === meta.productId);
      return {
        productId: meta.productId,
        durationDays: meta.durationDays,
        displayName: meta.displayName,
        marketingBlurb: meta.marketingBlurb,
        priceLabel: match?.displayPrice ?? meta.priceLabel,
        localizedTitle: match?.displayName ?? match?.title ?? meta.displayName,
        localizedDescription: match?.description ?? meta.marketingBlurb,
      };
    })
  , [products]);

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

  const claimStatus = useMemo(() => {
    if (tokens >= TOKEN_CAP) {
      return { canClaim: false, label: 'Wallet full — spend tokens to claim more.' };
    }
    const now = Date.now();
    if (!lastFreeClaim) {
      return { canClaim: true, label: `Claim ${FREE_CLAIM_AMOUNT} free scan tokens right now.` };
    }
    const lastMs = new Date(lastFreeClaim).getTime();
    if (!Number.isFinite(lastMs) || now - lastMs >= FREE_CLAIM_INTERVAL_MS) {
      return { canClaim: true, label: `Claim ${FREE_CLAIM_AMOUNT} free scan tokens right now.` };
    }
    const remaining = FREE_CLAIM_INTERVAL_MS - (now - lastMs);
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    parts.push(`${minutes}m`);
    return { canClaim: false, label: `Next refill in ${parts.join(' ')}` };
  }, [tokens, lastFreeClaim]);

  const { canClaim: canClaimTokens, label: claimLabel } = claimStatus;

  const handleClaimFreeTokens = useCallback(async () => {
    if (!canClaimTokens) return;
    const claimed = await claimFreeTokens();
    if (claimed) {
      Alert.alert('Free tokens added', `+${FREE_CLAIM_AMOUNT} scan tokens have been added to your wallet.`);
    }
  }, [canClaimTokens, claimFreeTokens]);

  const handleOpenUrl = useCallback(async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch (err) {
      Alert.alert('Unable to open link', 'Please try again later.');
    }
  }, []);

  return (
    <LinearGradient colors={[BRAND_SLATE, PANEL_SLATE]} style={styles.gradient}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.title}>Account</Text>
              <Text style={styles.subtitle}>Manage your plan and tokens</Text>
            </View>
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
                  <ActivityIndicator size="small" color={BRAND_MINT} />
                  <Text style={styles.loaderText}>Talking to the store…</Text>
                </View>
              ) : null}
              <View style={styles.claimBlock}>
                <Text style={styles.claimTitle}>Daily refill</Text>
                <Text style={styles.claimSubtitle}>{claimLabel}</Text>
                <Text style={styles.claimWalletNote}>Wallet holds up to {TOKEN_CAP} tokens.</Text>
                <View style={styles.claimButtonWrapper}>
                  <AccountButton
                    label={`Claim +${FREE_CLAIM_AMOUNT}`}
                    onPress={handleClaimFreeTokens}
                    disabled={!canClaimTokens}
                  />
                </View>
              </View>
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
            <AccountButton label="Clear Local Access" onPress={handleSignOut} tone="danger" />
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Legal</Text>
            <Text style={styles.sectionDescription}>Review our policies before you subscribe.</Text>
            <AccountButton
              label="Terms of Use"
              onPress={() => handleOpenUrl(TERMS_URL)}
              tone="ghost"
            />
            <AccountButton
              label="Privacy Policy"
              onPress={() => handleOpenUrl(PRIVACY_URL)}
              tone="ghost"
            />
            <Text style={styles.legalHint}>
              Subscriptions are billed through Apple and renew automatically. Manage or cancel anytime in Settings {'>'} Apple ID {'>'} Subscriptions.
            </Text>
          </View>

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
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
      activeOpacity={0.85}
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
          tone === 'secondary' && styles.buttonLabelSecondary,
          tone === 'outline' && styles.buttonLabelOutline,
          tone === 'danger' && styles.buttonLabelDanger,
          tone === 'ghost' && styles.buttonLabelGhost,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 24,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginTop: 6,
  },
  card: {
    backgroundColor: CARD_OVERLAY,
    borderRadius: 22,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    gap: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    letterSpacing: 0.3,
  },
  sectionDescription: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 18,
  },
  statLabel: {
    fontSize: 12,
    color: TEXT_SOFT,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT_PRIMARY,
  },
  planBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: BRAND_MINT_SOFT,
    color: BRAND_MINT,
    borderRadius: 14,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  loaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loaderText: {
    fontSize: 14,
    color: TEXT_MUTED,
  },
  productCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: CARD_BORDER,
    borderRadius: 18,
    padding: 18,
    backgroundColor: 'rgba(15,33,30,0.7)',
    gap: 12,
  },
  productCardActive: {
    borderColor: BRAND_MINT,
    backgroundColor: 'rgba(44,208,177,0.14)',
  },
  productHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  productTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_PRIMARY,
    flex: 1,
    flexWrap: 'wrap',
  },
  productPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_MINT,
    textAlign: 'right',
    maxWidth: 120,
  },
  productDescription: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  buttonPrimary: {
    backgroundColor: BRAND_MINT,
  },
  buttonSecondary: {
    backgroundColor: 'rgba(246,255,251,0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND_MINT,
  },
  buttonOutline: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BRAND_MINT,
    backgroundColor: 'transparent',
  },
  buttonDanger: {
    backgroundColor: DANGER_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DANGER_BORDER,
  },
  buttonGhost: {
    backgroundColor: 'rgba(246,255,251,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(246,255,251,0.08)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonLabel: {
    color: BRAND_SLATE,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  buttonLabelSecondary: {
    color: BRAND_MINT,
  },
  buttonLabelOutline: {
    color: BRAND_MINT,
  },
  buttonLabelDanger: {
    color: DANGER_TEXT,
  },
  buttonLabelGhost: {
    color: TEXT_MUTED,
  },
  legalHint: {
    fontSize: 12,
    color: TEXT_SOFT,
    lineHeight: 18,
  },
  claimBlock: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: CARD_BORDER,
  },
  claimTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_PRIMARY,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  claimSubtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
    marginBottom: 8,
  },
  claimWalletNote: {
    fontSize: 12,
    color: TEXT_SOFT,
    marginBottom: 12,
    letterSpacing: 0.4,
  },
  claimButtonWrapper: {
    marginTop: 8,
    width: '100%',
  },
});

