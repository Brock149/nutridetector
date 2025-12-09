export const SUBSCRIPTION_PRODUCTS = [
  {
    productId: 'weekly_1usd' as const,
    durationDays: 7,
    displayName: 'Weekly access',
    priceLabel: '$0.99/week',
    marketingBlurb: 'Unlimited scans • $0.99/week • 3-day free trial',
  },
  {
    productId: 'annual_12usd' as const,
    durationDays: 365,
    displayName: 'Annual access',
    priceLabel: '$12.99/year',
    marketingBlurb: 'Unlimited scans • $12.99/year',
  },
] as const;

export type SubscriptionProductId = (typeof SUBSCRIPTION_PRODUCTS)[number]['productId'];

export const SUBSCRIPTION_PRODUCT_IDS: SubscriptionProductId[] = SUBSCRIPTION_PRODUCTS.map((item) => item.productId);


