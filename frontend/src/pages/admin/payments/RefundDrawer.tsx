import { useEffect, useMemo, useState } from 'react';
import {
  Drawer, Descriptions, Button, Space, Input, InputNumber, Checkbox, message, Tag, Alert,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';
import {
  CopyButton, currencySymbol, formatDate, formatMoney, Money, ORDER_STATUS_COLOR,
  PROVIDER_LABEL, stripeDashboardUrl, useAdminDrawerWidth, useAdminPasswordSession,
  type PaymentOrderRow,
} from './_shared';

interface Props {
  open: boolean;
  order: PaymentOrderRow | null;
  onClose: () => void;
  onRefunded: () => void;
}

export default function RefundDrawer({ open, order, onClose, onRefunded }: Props) {
  const { t } = useTranslation();
  const drawerWidth = useAdminDrawerWidth(560);
  const pwSession = useAdminPasswordSession();

  const [amountYuan, setAmountYuan] = useState<number>(0);
  const [reason, setReason] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const remainingCents = useMemo(() => {
    if (!order) return 0;
    return Math.max(0, order.amountCents - order.refundedCents);
  }, [order]);

  // When the drawer opens, default the amount to the remaining refundable
  // value and pull the cached password (if any) so the admin only types it
  // once per session.
  useEffect(() => {
    if (!open || !order) return;
    setAmountYuan(remainingCents / 100);
    setReason('');
    setPassword(pwSession.password);
    setRemember(pwSession.remembered);
  }, [open, order, remainingCents, pwSession.password, pwSession.remembered]);

  const amountValid = amountYuan > 0 && Math.round(amountYuan * 100) <= remainingCents;

  async function submit() {
    if (!order) return;
    if (!password) {
      message.error(t('adminPayments.refund.passwordRequired'));
      return;
    }
    if (!amountValid) {
      message.error(t('adminPayments.refund.amountInvalid'));
      return;
    }
    setBusy(true);
    try {
      const amountCents = Math.round(amountYuan * 100);
      await adminApi.post(
        `/payment-orders/${order.id}/refund`,
        {
          amountCents,
          ...(reason ? { reason } : {}),
        },
        { headers: { 'X-Admin-Password': password } },
      );
      if (remember) pwSession.remember(password);
      else pwSession.clear();
      message.success(t('adminPayments.refund.submitted'));
      onRefunded();
      onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('adminPayments.refund.failed'));
    } finally {
      setBusy(false);
    }
  }

  if (!order) return null;
  const sym = currencySymbol(order.currency);

  return (
    <Drawer
      title={t('adminPayments.refund.title')}
      open={open}
      onClose={onClose}
      width={drawerWidth}
      destroyOnClose
      footer={
        <Space style={{ float: 'right' }}>
          <Button onClick={onClose}>{t('adminPayments.common.cancel')}</Button>
          <Button type="primary" danger loading={busy} onClick={submit} disabled={!amountValid || !password}>
            {t('adminPayments.refund.submit')}
          </Button>
        </Space>
      }
    >
      <Descriptions
        title={t('adminPayments.refund.orderInfo')}
        bordered
        size="small"
        column={1}
        style={{ marginBottom: 16 }}
      >
        <Descriptions.Item label={t('adminPayments.refund.orderId')}>
          <Space>
            <code style={{ fontSize: 12 }}>{order.id}</code>
            <CopyButton text={order.id} />
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label={t('adminPayments.refund.user')}>
          {order.user?.email || order.userId}
        </Descriptions.Item>
        <Descriptions.Item label={t('adminPayments.refund.channel')}>
          <Tag>{PROVIDER_LABEL[order.provider] || order.provider}</Tag>
          <Tag color={ORDER_STATUS_COLOR[order.status]}>{order.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label={t('adminPayments.refund.totalPaid')}>
          <Money cents={order.amountCents} currency={order.currency} />
        </Descriptions.Item>
        <Descriptions.Item label={t('adminPayments.refund.alreadyRefunded')}>
          <Money cents={order.refundedCents} currency={order.currency} />
        </Descriptions.Item>
        <Descriptions.Item label={t('adminPayments.refund.remaining')}>
          <strong>
            <Money cents={remainingCents} currency={order.currency} />
          </strong>
        </Descriptions.Item>
        {order.externalTradeNo && (
          <Descriptions.Item label="payment_intent">
            <Space>
              <code style={{ fontSize: 12 }}>{order.externalTradeNo}</code>
              <CopyButton text={order.externalTradeNo} />
              {order.provider === 'stripe' && order.externalTradeNo.startsWith('pi_') && (
                <a
                  href={stripeDashboardUrl('payment_intent', order.externalTradeNo)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('adminPayments.common.openInStripe')} →
                </a>
              )}
            </Space>
          </Descriptions.Item>
        )}
        <Descriptions.Item label={t('adminPayments.orders.col.time')}>
          {formatDate(order.paidAt || order.createdAt)}
        </Descriptions.Item>
      </Descriptions>

      {remainingCents <= 0 && (
        <Alert
          type="warning"
          showIcon
          message={t('adminPayments.refund.amountInvalid')}
          style={{ marginBottom: 16 }}
        />
      )}

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6, fontWeight: 500 }}>
          {t('adminPayments.refund.amount')}
        </div>
        <InputNumber
          style={{ width: '100%' }}
          prefix={sym}
          value={amountYuan}
          min={0}
          max={remainingCents / 100}
          step={0.01}
          precision={2}
          status={!amountValid ? 'error' : ''}
          onChange={(v) => setAmountYuan(typeof v === 'number' ? v : 0)}
        />
        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
          {t('adminPayments.refund.amountHint')} —{' '}
          {t('adminPayments.refund.remaining')}: {formatMoney(remainingCents, order.currency)}
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6, fontWeight: 500 }}>
          {t('adminPayments.refund.reason')}{' '}
          <span style={{ color: '#999', fontWeight: 'normal' }}>
            {t('adminPayments.refund.reasonOptional')}
          </span>
        </div>
        <Input.TextArea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          maxLength={200}
          showCount
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ marginBottom: 6, fontWeight: 500 }}>
          {t('adminPayments.refund.password')}
        </div>
        <Input.Password
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
          {t('adminPayments.refund.passwordHint')}
        </div>
        <Checkbox
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          style={{ marginTop: 8 }}
        >
          {t('adminPayments.refund.rememberPassword')}
        </Checkbox>
      </div>
    </Drawer>
  );
}
