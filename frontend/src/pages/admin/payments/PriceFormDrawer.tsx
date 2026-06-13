import { useEffect, useMemo, useState } from 'react';
import {
  Drawer, Form, Input, InputNumber, Select, Switch, Button, Space, message, Alert,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';
import {
  SUPPORTED_CURRENCIES, currencySymbol, useAdminDrawerWidth, type PriceRow,
} from './_shared';
import type { BillingConfig } from './Catalog';

interface Props {
  open: boolean;
  productId: string | null;
  editing: PriceRow | null;
  billing: BillingConfig | null;
  onClose: () => void;
  onSaved: () => void;
}

interface FormState {
  code: string;
  displayName: string;
  months: number;
  currency: string;
  amountYuan: number;
  supportsAutoRenew: boolean;
  active: boolean;
  stripePriceId: string;
  stripeRecurringPriceId: string;
}

const EMPTY: FormState = {
  code: '',
  displayName: '',
  months: 1,
  currency: 'EUR',
  amountYuan: 0,
  supportsAutoRenew: false,
  active: true,
  stripePriceId: '',
  stripeRecurringPriceId: '',
};

export default function PriceFormDrawer({
  open, productId, editing, billing, onClose, onSaved,
}: Props) {
  const { t } = useTranslation();
  const drawerWidth = useAdminDrawerWidth(460);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);

  const anchorCurrency = (billing?.anchorCurrency || 'EUR').toUpperCase();
  const eurAnchorMode = Boolean(billing?.adaptivePricing && billing.checkoutMode === 'embedded');
  const lockCurrency = eurAnchorMode && !editing;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      const currency = (editing.currency || 'USD').toUpperCase();
      const mapped = (editing.stripeMappings || []).find((m) => m.currency.toUpperCase() === currency)?.stripePriceId || '';
      setForm({
        code: editing.code,
        displayName: editing.name || '',
        months: editing.months,
        currency: editing.currency || 'USD',
        amountYuan: editing.amountCents / 100,
        supportsAutoRenew: editing.supportsAutoRenew,
        active: editing.active,
        stripePriceId: editing.stripePriceId || '',
        stripeRecurringPriceId: mapped,
      });
    } else {
      setForm({
        ...EMPTY,
        currency: eurAnchorMode ? anchorCurrency : EMPTY.currency,
      });
    }
  }, [open, editing, eurAnchorMode, anchorCurrency]);

  // Subscription mode requires a Stripe Price ID. We surface that as a warning
  // but don't block save — admins may want to create the row first and add the
  // ID after creating the product in Stripe.
  const stripeIdLooksValid = useMemo(() => {
    const v = form.stripePriceId.trim();
    return !v || v.startsWith('price_');
  }, [form.stripePriceId]);

  const stripeRecurringIdLooksValid = useMemo(() => {
    const v = form.stripeRecurringPriceId.trim();
    return !v || v.startsWith('price_');
  }, [form.stripeRecurringPriceId]);

  const showStripeIdField = form.supportsAutoRenew;

  async function save() {
    if (!productId) {
      // Should never happen: the parent only opens the drawer with a valid
      // productId. Surface it loudly anyway so a future regression isn't
      // silently swallowed.
      message.error('Missing productId');
      return;
    }
    if (!editing) {
      if (!form.code.trim()) {
        message.error(t('adminPayments.priceForm.codeRequired'));
        return;
      }
      if (!form.months || form.months < 1) {
        message.error(t('adminPayments.priceForm.monthsRequired'));
        return;
      }
    }
    if (!Number.isFinite(form.amountYuan) || form.amountYuan <= 0) {
      message.error(t('adminPayments.priceForm.amountRequired'));
      return;
    }
    setBusy(true);
    try {
      const amountCents = Math.round(form.amountYuan * 100);
      const stripePriceIdPayload = form.stripePriceId.trim() || null;
      const stripeRecurringPriceIdPayload = form.stripeRecurringPriceId.trim() || null;
      const namePayload = form.displayName.trim() || null;
      if (editing) {
        await adminApi.patch(`/prices/${editing.id}`, {
          amountCents,
          supportsAutoRenew: form.supportsAutoRenew,
          active: form.active,
          stripePriceId: stripePriceIdPayload,
          name: namePayload,
          stripeMappings: stripeRecurringPriceIdPayload
            ? [{ currency: form.currency, stripePriceId: stripeRecurringPriceIdPayload }]
            : [],
        });
      } else {
        await adminApi.post('/prices', {
          productId,
          code: form.code.trim(),
          name: namePayload,
          months: form.months,
          currency: form.currency,
          amountCents,
          supportsAutoRenew: form.supportsAutoRenew,
          active: form.active,
          stripePriceId: stripePriceIdPayload,
        });
      }
      message.success(t('adminPayments.common.saved'));
      onSaved();
      onClose();
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error('[PriceFormDrawer] save failed', e?.response?.data || e);
      const code = e?.response?.data?.code;
      const existingCode = e?.response?.data?.existingCode;
      if (code === 'PRICE_SLOT_TAKEN') {
        message.error(
          t('adminPayments.priceForm.slotTaken', { code: existingCode || '?' }),
        );
      } else {
        message.error(e?.response?.data?.error || t('adminPayments.common.saveFailed'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={
        editing ? t('adminPayments.priceForm.titleEdit') : t('adminPayments.priceForm.titleCreate')
      }
      open={open}
      onClose={onClose}
      width={drawerWidth}
      destroyOnClose
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>{t('adminPayments.common.cancel')}</Button>
          <Button type="primary" loading={busy} onClick={save}>
            {t('adminPayments.common.save')}
          </Button>
        </Space>
      }
    >
      <Form layout="vertical">
        {eurAnchorMode && (
          <Alert
            type="info"
            showIcon
            message={t('adminPayments.priceForm.eurAnchorHint', { currency: anchorCurrency })}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item
          label={t('adminPayments.priceForm.code')}
          extra={t('adminPayments.priceForm.codeHint')}
          required
        >
          <Input
            value={form.code}
            disabled={!!editing}
            placeholder="STANDARD_1M"
            onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
          />
        </Form.Item>

        <Form.Item
          label={t('adminPayments.priceForm.displayName')}
          extra={t('adminPayments.priceForm.displayNameHint')}
        >
          <Input
            value={form.displayName}
            placeholder={t('adminPayments.priceForm.displayNamePlaceholder')}
            onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
            maxLength={100}
            showCount
          />
        </Form.Item>

        {/* Plain flex row instead of Space.Compact: AntD Space.Compact does
            not compose with Form.Item (label + extra slots are stripped or
            misaligned), causing visual breakage and click issues. */}
        <div style={{ display: 'flex', gap: 12 }}>
          <Form.Item
            label={t('adminPayments.priceForm.months')}
            style={{ flex: '0 0 100px' }}
            required
          >
            <InputNumber
              style={{ width: '100%' }}
              value={form.months}
              disabled={!!editing}
              min={1}
              max={36}
              onChange={(v) => setForm((s) => ({ ...s, months: typeof v === 'number' ? v : 1 }))}
            />
          </Form.Item>
          <Form.Item
            label={t('adminPayments.priceForm.currency')}
            style={{ flex: '0 0 130px' }}
          >
            <Select
              value={form.currency}
              disabled={!!editing || lockCurrency}
              onChange={(v) => setForm((s) => ({ ...s, currency: v }))}
              options={(lockCurrency ? [anchorCurrency] : SUPPORTED_CURRENCIES).map((c) => ({
                value: c,
                label: `${c} (${currencySymbol(c)})`,
              }))}
            />
          </Form.Item>
          <Form.Item
            label={t('adminPayments.priceForm.amount')}
            style={{ flex: 1 }}
            required
          >
            <InputNumber
              style={{ width: '100%' }}
              prefix={currencySymbol(form.currency)}
              value={form.amountYuan}
              min={0}
              step={0.01}
              precision={2}
              onChange={(v) =>
                setForm((s) => ({ ...s, amountYuan: typeof v === 'number' ? v : 0 }))
              }
            />
          </Form.Item>
        </div>

        <div style={{ fontSize: 12, color: '#999', marginTop: -12, marginBottom: 16 }}>
          {t('adminPayments.priceForm.amountHint')}
        </div>

        <Form.Item label={t('adminPayments.priceForm.autoRenew')}>
          <Switch
            checked={form.supportsAutoRenew}
            onChange={(v) => setForm((s) => ({ ...s, supportsAutoRenew: v }))}
          />
        </Form.Item>

        {showStripeIdField && (
          <>
            <Form.Item
              label={t('adminPayments.priceForm.stripePriceId')}
              extra={t('adminPayments.priceForm.stripePriceIdHint')}
              validateStatus={stripeIdLooksValid ? '' : 'warning'}
              help={stripeIdLooksValid ? undefined : t('adminPayments.priceForm.stripePriceIdInvalid')}
            >
              <Input
                value={form.stripePriceId}
                placeholder="price_1Pxxxxx"
                onChange={(e) => setForm((s) => ({ ...s, stripePriceId: e.target.value }))}
              />
            </Form.Item>
            <Form.Item
              label={t('adminPayments.priceForm.stripeRecurringPriceId')}
              extra={t('adminPayments.priceForm.stripeRecurringPriceIdHint')}
              validateStatus={stripeRecurringIdLooksValid ? '' : 'warning'}
              help={stripeRecurringIdLooksValid ? undefined : t('adminPayments.priceForm.stripePriceIdInvalid')}
            >
              <Input
                value={form.stripeRecurringPriceId}
                placeholder="price_1Pxxxxx"
                onChange={(e) => setForm((s) => ({ ...s, stripeRecurringPriceId: e.target.value }))}
              />
            </Form.Item>
          </>
        )}

        {form.supportsAutoRenew && !form.stripeRecurringPriceId.trim() && !form.stripePriceId.trim() && (
          <Alert
            type="warning"
            showIcon
            message={t('adminPayments.priceForm.stripePriceIdHint')}
            style={{ marginBottom: 16 }}
          />
        )}

        <Form.Item label={t('adminPayments.priceForm.active')}>
          <Switch
            checked={form.active}
            onChange={(v) => setForm((s) => ({ ...s, active: v }))}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
