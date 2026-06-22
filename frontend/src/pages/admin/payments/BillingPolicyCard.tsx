import { useCallback, useEffect, useState } from 'react';
import {
  Card, Form, Switch, InputNumber, Select, Input, Button, Space, Alert, message, Typography,
} from 'antd';
import { SaveOutlined, ExperimentOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';

const { Text } = Typography;

export interface BillingPolicy {
  trialEnabled: boolean;
  trialDays: number;
  trialPlan: string;
  paymentsEnabled: boolean;
  freeCountries?: string[];
  paymentsDisabledMessage: { zh?: string; en?: string; fr?: string };
  fromDatabase?: boolean;
}

const PLAN_OPTIONS = ['STANDARD', 'AI', 'AI_UNLIMITED'] as const;

export default function BillingPolicyCard() {
  const { t } = useTranslation();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fromDatabase, setFromDatabase] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/billing-policy');
      const p = data.policy as BillingPolicy;
      setFromDatabase(Boolean(p.fromDatabase));
      form.setFieldsValue({
        trialEnabled: p.trialEnabled,
        trialDays: p.trialDays,
        trialPlan: p.trialPlan,
        paymentsEnabled: p.paymentsEnabled,
        freeCountries: p.freeCountries || [],
        msgZh: p.paymentsDisabledMessage?.zh || '',
        msgEn: p.paymentsDisabledMessage?.en || '',
        msgFr: p.paymentsDisabledMessage?.fr || '',
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || t('adminPayments.common.operationFailed'));
    } finally {
      setLoading(false);
    }
  }, [form, t]);

  useEffect(() => { load(); }, [load]);

  const buildPayload = (values: Record<string, unknown>) => ({
    trialEnabled: values.trialEnabled,
    trialDays: values.trialDays,
    trialPlan: values.trialPlan,
    paymentsEnabled: values.paymentsEnabled,
    freeCountries: ((values.freeCountries as string[]) || []).map((c) => c.trim().toUpperCase()).filter(Boolean),
    paymentsDisabledMessage: {
      zh: values.msgZh,
      en: values.msgEn,
      fr: values.msgFr,
    },
  });

  const onSave = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await adminApi.patch('/billing-policy', buildPayload(values));
      message.success(t('adminPayments.common.saved'));
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; errorFields?: unknown };
      if (!err.errorFields) {
        message.error(err.response?.data?.error || t('adminPayments.common.saveFailed'));
      }
    } finally {
      setSaving(false);
    }
  };

  const applyTestPhase = async () => {
    setSaving(true);
    try {
      await adminApi.post('/billing-policy/test-phase');
      message.success(t('adminPayments.billingPolicy.testPhaseApplied'));
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || t('adminPayments.common.operationFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      title={t('adminPayments.billingPolicy.title')}
      loading={loading}
      style={{ marginBottom: 16 }}
      extra={(
        <Space wrap>
          <Button icon={<ExperimentOutlined />} onClick={applyTestPhase} loading={saving}>
            {t('adminPayments.billingPolicy.testPhaseBtn')}
          </Button>
          <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={saving}>
            {t('adminPayments.common.save')}
          </Button>
        </Space>
      )}
    >
      <Alert
        type="info"
        showIcon
        className="mb-4"
        message={t('adminPayments.billingPolicy.hint')}
      />
      {!fromDatabase && (
        <Text type="secondary" className="block mb-3 text-sm">
          {t('adminPayments.billingPolicy.usingEnvDefaults')}
        </Text>
      )}

      <Form form={form} layout="vertical" initialValues={{ trialEnabled: true, trialDays: 30, trialPlan: 'AI_UNLIMITED', paymentsEnabled: false }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <Form.Item name="trialEnabled" label={t('adminPayments.billingPolicy.trialEnabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="paymentsEnabled" label={t('adminPayments.billingPolicy.paymentsEnabled')} valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="trialDays" label={t('adminPayments.billingPolicy.trialDays')} rules={[{ required: true }]}>
            <InputNumber min={1} max={365} className="w-full" addonAfter={t('adminPayments.billingPolicy.daysUnit')} />
          </Form.Item>
          <Form.Item name="trialPlan" label={t('adminPayments.billingPolicy.trialPlan')} rules={[{ required: true }]}>
            <Select options={PLAN_OPTIONS.map((p) => ({ value: p, label: p }))} />
          </Form.Item>
        </div>

        <Form.Item
          name="freeCountries"
          label="免费国家/地区（ISO 两位代码，如 CN）"
          tooltip="这些国家/地区的访客免费使用、不显示付费入口；其他地区在开启「在线付费」后需订阅。"
        >
          <Select
            mode="tags"
            tokenSeparators={[',', ' ']}
            placeholder="CN"
            options={[{ value: 'CN', label: 'CN · 中国大陆' }]}
          />
        </Form.Item>

        <Form.Item name="msgZh" label={t('adminPayments.billingPolicy.msgZh')}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <Form.Item name="msgEn" label={t('adminPayments.billingPolicy.msgEn')}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
        <Form.Item name="msgFr" label={t('adminPayments.billingPolicy.msgFr')}>
          <Input.TextArea rows={2} maxLength={500} />
        </Form.Item>
      </Form>
    </Card>
  );
}
