import { useEffect, useState } from 'react';
import { Drawer, Form, Input, Select, Switch, Button, Space, message } from 'antd';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../../api/adminClient';
import { useAdminDrawerWidth, type ProductRow } from './_shared';

interface Props {
  open: boolean;
  editing: ProductRow | null;
  onClose: () => void;
  onSaved: () => void;
}

const PLAN_OPTIONS = ['STANDARD', 'AI', 'AI_UNLIMITED'];

interface FormState {
  code: string;
  name: string;
  plan: string;
  active: boolean;
}

const EMPTY: FormState = { code: '', name: '', plan: 'STANDARD', active: true };

export default function ProductFormDrawer({ open, editing, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const drawerWidth = useAdminDrawerWidth(420);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({ code: editing.code, name: editing.name, plan: editing.plan, active: editing.active });
    } else {
      setForm(EMPTY);
    }
  }, [open, editing]);

  async function save() {
    if (!form.code.trim() || !form.name.trim()) {
      message.error(t('adminPayments.common.saveFailed'));
      return;
    }
    setBusy(true);
    try {
      if (editing) {
        await adminApi.patch(`/products/${editing.id}`, {
          name: form.name.trim(),
          plan: form.plan,
          active: form.active,
        });
      } else {
        await adminApi.post('/products', {
          code: form.code.trim(),
          name: form.name.trim(),
          plan: form.plan,
          active: form.active,
        });
      }
      message.success(t('adminPayments.common.saved'));
      onSaved();
      onClose();
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('adminPayments.common.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title={editing ? t('adminPayments.common.edit') : t('adminPayments.catalog.newProduct')}
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
        <Form.Item label={t('adminPayments.catalog.productCode')} required>
          <Input
            value={form.code}
            disabled={!!editing}
            placeholder="STANDARD / AI / AI_UNLIMITED"
            onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('adminPayments.catalog.productName')} required>
          <Input
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          />
        </Form.Item>
        <Form.Item label={t('adminPayments.catalog.plan')}>
          <Select
            value={form.plan}
            onChange={(v) => setForm((s) => ({ ...s, plan: v }))}
            options={PLAN_OPTIONS.map((p) => ({ value: p, label: p }))}
          />
        </Form.Item>
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
