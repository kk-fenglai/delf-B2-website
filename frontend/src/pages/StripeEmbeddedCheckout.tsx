import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Spin, Typography } from 'antd';
import { loadStripe } from '@stripe/stripe-js';
import {
  CheckoutElementsProvider,
  CurrencySelectorElement,
  PaymentElement,
  useCheckoutElements,
} from '@stripe/react-stripe-js/checkout';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const { Title, Paragraph } = Typography;

interface CheckoutLocationState {
  clientSecret?: string;
  orderId?: string;
  sessionId?: string;
}

interface StripeConfig {
  publishableKey: string;
  adaptivePricing: boolean;
  anchorCurrency: string;
  checkoutMode: string;
}

function CheckoutForm({ orderId }: { orderId?: string }) {
  const { t } = useTranslation();
  const checkoutState = useCheckoutElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (checkoutState.type === 'loading') {
    return (
      <div className="flex justify-center py-12">
        <Spin size="large" />
      </div>
    );
  }

  if (checkoutState.type === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message={checkoutState.error.message || t('pricing.checkout.createFailed')}
      />
    );
  }

  const { checkout } = checkoutState;
  const payAmount = checkout.total?.total?.amount ?? '—';

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await checkout.confirm();
    if (result.type === 'error') {
      setError(result.error.message);
      setSubmitting(false);
    }
    // Success redirects to return_url; no further client action needed.
  }

  return (
    <form onSubmit={handlePay} className="space-y-5">
      <div>
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
          {t('pricing.checkout.currencySelectorLabel')}
        </div>
        <CurrencySelectorElement />
      </div>

      <div>
        <div className="text-sm font-medium mb-2" style={{ color: 'var(--text)' }}>
          {t('pricing.checkout.paymentDetailsLabel')}
        </div>
        <PaymentElement />
      </div>

      {error && <Alert type="error" showIcon message={error} />}

      {orderId && (
        <Paragraph className="text-xs mb-0" style={{ color: 'var(--textMuted)' }}>
          {t('pricing.checkout.orderId', { id: orderId })}
        </Paragraph>
      )}

      <Button
        type="primary"
        htmlType="submit"
        size="large"
        block
        loading={submitting}
        disabled={!checkout.canConfirm}
        style={{ fontWeight: 600 }}
      >
        {t('pricing.checkout.payNow', { amount: payAmount })}
      </Button>
    </form>
  );
}

export default function StripeEmbeddedCheckout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state || {}) as CheckoutLocationState;

  const [config, setConfig] = useState<StripeConfig | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(state.clientSecret || null);
  const [orderId, setOrderId] = useState<string | undefined>(state.orderId);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: cfg } = await api.get('/pay/stripe/config');
        if (cancelled) return;
        setConfig(cfg);

        if (!state.clientSecret && state.orderId) {
          const { data: resume } = await api.get(`/pay/stripe/checkout/${state.orderId}/client-secret`);
          if (cancelled) return;
          setClientSecret(resume.clientSecret);
          setOrderId(resume.orderId);
        } else if (!state.clientSecret && !state.orderId) {
          setLoadError(t('pricing.checkout.missingCheckoutSession'));
        }
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
        setLoadError(msg || t('pricing.checkout.createFailed'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.clientSecret, state.orderId, t]);

  const stripePromise = useMemo(
    () => (config?.publishableKey ? loadStripe(config.publishableKey) : null),
    [config?.publishableKey],
  );

  const providerOptions = useMemo(() => {
    if (!clientSecret) return null;
    return {
      clientSecret,
      ...(config?.adaptivePricing ? { adaptivePricing: { allowed: true } } : {}),
      elementsOptions: {
        appearance: {
          theme: 'stripe' as const,
          variables: {
            colorPrimary: '#2563eb',
            borderRadius: '10px',
          },
        },
      },
    };
  }, [clientSecret, config?.adaptivePricing]);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto py-16 flex justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (loadError || !clientSecret || !stripePromise || !providerOptions) {
    return (
      <div className="max-w-lg mx-auto">
        <Card>
          <Alert
            type="error"
            showIcon
            message={loadError || t('pricing.checkout.createFailed')}
            className="mb-4"
          />
          <Link to="/pricing">
            <Button>{t('orders.resume.backPricing')}</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <Card>
        <Title level={3} style={{ marginBottom: 8 }}>
          {t('pricing.checkout.embeddedTitle')}
        </Title>
        {config?.adaptivePricing && (
          <Paragraph className="text-sm mb-6" style={{ color: 'var(--textMuted)' }}>
            {t('pricing.checkout.currencySelectorNote', { currency: config.anchorCurrency })}
          </Paragraph>
        )}

        <CheckoutElementsProvider stripe={stripePromise} options={providerOptions}>
          <CheckoutForm orderId={orderId} />
        </CheckoutElementsProvider>

        <div className="mt-4">
          <Button type="link" onClick={() => navigate('/pricing')} style={{ paddingLeft: 0 }}>
            {t('orders.resume.backPricing')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
