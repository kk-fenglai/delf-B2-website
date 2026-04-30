const Stripe = require('stripe');
const env = require('../../config/env');

let stripeClient = null;

function getClient() {
  if (stripeClient) return stripeClient;
  if (!env.STRIPE?.SECRET_KEY) return null;
  stripeClient = new Stripe(env.STRIPE.SECRET_KEY);
  return stripeClient;
}

function isEnabled() {
  return Boolean(env.STRIPE?.SECRET_KEY && env.STRIPE?.WEBHOOK_SECRET);
}

function verifyWebhookEvent({ rawBodyBuffer, signature }) {
  const client = getClient();
  if (!client) throw Object.assign(new Error('Stripe not configured'), { code: 'PAY_NOT_CONFIGURED' });
  if (!env.STRIPE?.WEBHOOK_SECRET) throw Object.assign(new Error('Stripe webhook not configured'), { code: 'PAY_NOT_CONFIGURED' });
  if (!rawBodyBuffer || !signature) return null;
  try {
    return client.webhooks.constructEvent(rawBodyBuffer, signature, env.STRIPE.WEBHOOK_SECRET);
  } catch {
    return null;
  }
}

// Unified entry: one-time payment (mode='payment') or recurring subscription
// (mode='subscription'). The caller decides via `subscribe`. Subscription mode
// requires `price.stripePriceId` to point at a recurring Price already created
// in the Stripe Dashboard — Stripe rejects inline price_data for subscriptions.
async function createCheckoutSession({
  orderId,
  userId,
  price,
  successUrl,
  cancelUrl,
  subscribe = false,
  customerEmail,
}) {
  const client = getClient();
  if (!client) throw Object.assign(new Error('Stripe not configured'), { code: 'PAY_NOT_CONFIGURED' });

  const currency = String(price.currency || 'USD').toLowerCase();
  const planLabel = price.product?.plan || 'Subscription';
  const productName = `DELFluent ${price.product?.name || planLabel} ${price.months}m`;

  if (subscribe) {
    if (!price.stripePriceId) {
      throw Object.assign(new Error('Stripe Price ID not configured for this plan'), {
        code: 'INVALID_PRICE',
        status: 400,
      });
    }
    // Card-only for recurring: WeChat Pay / Alipay through Stripe do not support
    // saved payment methods, so they cannot back a subscription.
    const session = await client.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price.stripePriceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: orderId,
      ...(customerEmail ? { customer_email: customerEmail } : {}),
      // metadata on the session is mirrored on the first invoice — we re-read
      // it inside webhook handlers to find the local PaymentOrder row.
      metadata: {
        orderId,
        userId,
        priceId: price.id,
        priceCode: price.code || '',
        plan: planLabel,
        months: String(price.months || 1),
      },
      // Subscription-level metadata is what `customer.subscription.*` events
      // carry (session metadata is not on those events).
      subscription_data: {
        metadata: {
          orderId,
          userId,
          priceId: price.id,
          priceCode: price.code || '',
          plan: planLabel,
          months: String(price.months || 1),
        },
      },
    });
    return { sessionId: session.id, url: session.url, mode: 'subscription' };
  }

  // One-time purchase (existing behavior). Card + WeChat Pay + Alipay through
  // one Stripe Checkout session. WeChat/Alipay are async — confirmation arrives
  // via checkout.session.async_payment_succeeded. Stripe will reject the session
  // at create-time if the price currency is not enabled on the account.
  const session = await client.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card', 'wechat_pay', 'alipay'],
    payment_method_options: {
      wechat_pay: { client: 'web' },
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: price.amountCents,
          product_data: { name: productName },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: orderId,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    metadata: {
      orderId,
      userId,
      priceId: price.id,
      plan: planLabel,
      months: String(price.months || 1),
    },
  });

  return { sessionId: session.id, url: session.url, mode: 'payment' };
}

// Stripe Customer Portal — self-service for users to update card, cancel
// subscription, or download past invoices. Requires the portal to be enabled
// in the Stripe Dashboard (Settings → Billing → Customer portal).
async function createPortalSession({ stripeCustomerId, returnUrl }) {
  const client = getClient();
  if (!client) throw Object.assign(new Error('Stripe not configured'), { code: 'PAY_NOT_CONFIGURED' });
  if (!stripeCustomerId) throw Object.assign(new Error('Missing Stripe customer'), { code: 'STRIPE_NO_CUSTOMER', status: 400 });
  const session = await client.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

// Admin force-cancel a subscription. Stripe will then emit
// customer.subscription.deleted, and the webhook will flip our PayContract to
// TERMINATED. We pass `cancel_at_period_end: false` so it stops immediately —
// for end-of-period cancel use the Customer Portal flow instead.
async function cancelSubscription(stripeSubscriptionId) {
  const client = getClient();
  if (!client) throw Object.assign(new Error('Stripe not configured'), { code: 'PAY_NOT_CONFIGURED' });
  if (!stripeSubscriptionId) throw Object.assign(new Error('Missing subscription id'), { code: 'STRIPE_NO_SUB', status: 400 });
  return client.subscriptions.cancel(stripeSubscriptionId);
}

module.exports = {
  isEnabled,
  getClient,
  verifyWebhookEvent,
  createCheckoutSession,
  createPortalSession,
  cancelSubscription,
};
