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

function useEmbeddedCheckout() {
  if (env.STRIPE?.CHECKOUT_UI === 'hosted') return false;
  if (env.STRIPE?.CHECKOUT_UI === 'embedded') return true;
  return Boolean(env.STRIPE?.ADAPTIVE_PRICING);
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

function checkoutExtras() {
  if (!env.STRIPE?.ADAPTIVE_PRICING) return {};
  return { adaptive_pricing: { enabled: true } };
}

function checkoutCurrency(price) {
  if (env.STRIPE?.ADAPTIVE_PRICING) {
    return String(env.STRIPE.ANCHOR_CURRENCY || 'EUR').toLowerCase();
  }
  return String(price.currency || 'USD').toLowerCase();
}

function orderMetadata({ orderId, userId, price, planLabel }) {
  return {
    orderId,
    userId,
    priceId: price.id,
    priceCode: price.code || '',
    plan: planLabel,
    months: String(price.months || 1),
  };
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
  returnUrl,
  subscribe = false,
  customerEmail,
}) {
  const client = getClient();
  if (!client) throw Object.assign(new Error('Stripe not configured'), { code: 'PAY_NOT_CONFIGURED' });

  const embedded = useEmbeddedCheckout();
  const currency = checkoutCurrency(price);
  const planLabel = price.product?.plan || 'Subscription';
  const productName = `DELFluent ${price.product?.name || planLabel} ${price.months}m`;
  const extras = checkoutExtras();
  const metadata = orderMetadata({ orderId, userId, price, planLabel });

  const sessionBase = {
    client_reference_id: orderId,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    ...extras,
    metadata,
  };

  if (subscribe) {
    if (!price.stripePriceId) {
      throw Object.assign(new Error('Stripe Price ID not configured for this plan'), {
        code: 'INVALID_PRICE',
        status: 400,
      });
    }

    const sessionParams = {
      mode: 'subscription',
      line_items: [{ price: price.stripePriceId, quantity: 1 }],
      subscription_data: { metadata },
      ...sessionBase,
    };

    if (embedded) {
      Object.assign(sessionParams, {
        ui_mode: 'elements',
        return_url: returnUrl,
      });
    } else {
      Object.assign(sessionParams, {
        ui_mode: 'hosted_page',
        payment_method_types: ['card'],
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    }

    const session = await client.checkout.sessions.create(sessionParams);
    return {
      sessionId: session.id,
      url: session.url || null,
      clientSecret: session.client_secret || null,
      mode: 'subscription',
      embedded,
    };
  }

  const lineItems = [
    {
      quantity: 1,
      price_data: {
        currency,
        unit_amount: price.amountCents,
        product_data: { name: productName },
      },
    },
  ];

  if (embedded) {
    const session = await client.checkout.sessions.create({
      ui_mode: 'elements',
      mode: 'payment',
      line_items: lineItems,
      return_url: returnUrl,
      ...sessionBase,
    });
    return {
      sessionId: session.id,
      url: session.url || null,
      clientSecret: session.client_secret || null,
      mode: 'payment',
      embedded,
    };
  }

  // Hosted one-time purchase. With Adaptive Pricing we anchor in EUR (card only).
  const paymentMethodTypes = env.STRIPE?.ADAPTIVE_PRICING
    ? ['card']
    : ['card', 'wechat_pay', 'alipay'];
  const session = await client.checkout.sessions.create({
    ui_mode: 'hosted_page',
    mode: 'payment',
    payment_method_types: paymentMethodTypes,
    ...(paymentMethodTypes.includes('wechat_pay')
      ? { payment_method_options: { wechat_pay: { client: 'web' } } }
      : {}),
    line_items: lineItems,
    success_url: successUrl,
    cancel_url: cancelUrl,
    ...sessionBase,
  });

  return {
    sessionId: session.id,
    url: session.url,
    clientSecret: session.client_secret || null,
    mode: 'payment',
    embedded: false,
  };
}

async function retrieveCheckoutSession(sessionId) {
  const client = getClient();
  if (!client) throw Object.assign(new Error('Stripe not configured'), { code: 'PAY_NOT_CONFIGURED' });
  if (!sessionId) throw Object.assign(new Error('Missing session id'), { code: 'STRIPE_NO_SESSION', status: 400 });
  return client.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent', 'subscription'],
  });
}

function sessionStatusPayload(session) {
  const paymentIntent = session.payment_intent && typeof session.payment_intent === 'object'
    ? session.payment_intent
    : null;
  const subscription = session.subscription && typeof session.subscription === 'object'
    ? session.subscription
    : null;

  return {
    status: session.status,
    payment_status: session.payment_status,
    payment_intent_id: paymentIntent?.id || (typeof session.payment_intent === 'string' ? session.payment_intent : null),
    payment_intent_status: paymentIntent?.status || null,
    subscription_id: subscription?.id || (typeof session.subscription === 'string' ? session.subscription : null),
    subscription_status: subscription?.status || null,
    orderId: session.metadata?.orderId || session.client_reference_id || null,
  };
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
  useEmbeddedCheckout,
  verifyWebhookEvent,
  createCheckoutSession,
  retrieveCheckoutSession,
  sessionStatusPayload,
  createPortalSession,
  cancelSubscription,
};
