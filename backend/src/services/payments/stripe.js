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

async function createCheckoutSession({
  orderId,
  userId,
  price,
  successUrl,
  cancelUrl,
}) {
  const client = getClient();
  if (!client) throw Object.assign(new Error('Stripe not configured'), { code: 'PAY_NOT_CONFIGURED' });

  const currency = String(price.currency || 'USD').toLowerCase();
  const name = `DELFluent ${price.product?.name || price.product?.plan || 'Subscription'} ${price.months}m`;

  const session = await client.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: price.amountCents,
          product_data: { name },
        },
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: orderId,
    metadata: {
      orderId,
      userId,
      priceId: price.id,
      plan: price.product?.plan || '',
      months: String(price.months || 1),
    },
  });

  return {
    sessionId: session.id,
    url: session.url,
  };
}

module.exports = {
  isEnabled,
  getClient,
  verifyWebhookEvent,
  createCheckoutSession,
};

