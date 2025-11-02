export const SUBSCRIPTION_PRODUCTS = [
  {
    productId: 'weekly_1usd' as const,
    durationDays: 7,
    displayName: 'Weekly access',
    marketingBlurb: '$0.99 per week • 2-day free trial',
  },
  {
    productId: 'annual_12usd' as const,
    durationDays: 365,
    displayName: 'Annual access',
    marketingBlurb: '$11.99 per year',
  },
] as const;

export type SubscriptionProductId = (typeof SUBSCRIPTION_PRODUCTS)[number]['productId'];

export const SUBSCRIPTION_PRODUCT_IDS: SubscriptionProductId[] = SUBSCRIPTION_PRODUCTS.map((item) => item.productId);


