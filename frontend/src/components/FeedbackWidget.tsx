import { useEffect, useState } from 'react';
import { Button, Modal, Form, Input, Select, message, Tooltip, Badge } from 'antd';
import { CommentOutlined, CloseOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client';

const { TextArea } = Input;

// Set once the user has opened/dismissed the testing-phase nudge so it never
// nags again on this device.
const NUDGE_SEEN_KEY = 'feedback-nudge-seen';

interface FormValues {
  category: string;
  message: string;
  email?: string;
}

export default function FeedbackWidget() {
  const { t } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [nudge, setNudge] = useState(false);
  const [form] = Form.useForm<FormValues>();

  // First-visit guidance: pop the testing-phase bubble a few seconds in, once.
  useEffect(() => {
    if (localStorage.getItem(NUDGE_SEEN_KEY)) return;
    const timer = setTimeout(() => setNudge(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  const dismissNudge = () => {
    setNudge(false);
    localStorage.setItem(NUDGE_SEEN_KEY, '1');
  };

  const openModal = () => {
    dismissNudge();
    setOpen(true);
  };

  const categories = [
    { value: 'SUGGESTION', label: t('feedback.category.suggestion') },
    { value: 'BUG', label: t('feedback.category.bug') },
    { value: 'CONTENT', label: t('feedback.category.content') },
    { value: 'OTHER', label: t('feedback.category.other') },
  ];

  const close = () => {
    if (submitting) return;
    setOpen(false);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    setSubmitting(true);
    try {
      await api.post('/feedback', {
        category: values.category,
        message: values.message,
        email: values.email || undefined,
        pageUrl: location.pathname,
      });
      message.success(t('feedback.success'));
      form.resetFields();
      setOpen(false);
    } catch (e: any) {
      message.error(e.response?.data?.error || t('feedback.error'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* First-visit testing-phase nudge bubble, anchored above the button. */}
      {nudge && (
        <div
          role="dialog"
          aria-label={t('feedback.nudge.title')}
          style={{
            position: 'fixed',
            right: 24,
            bottom: 88,
            zIndex: 1001,
            width: 260,
            background: '#fff',
            borderRadius: 10,
            boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
            padding: '14px 16px',
          }}
        >
          <Button
            type="text"
            size="small"
            aria-label={t('feedback.nudge.dismiss')}
            icon={<CloseOutlined style={{ fontSize: 12 }} />}
            onClick={dismissNudge}
            style={{ position: 'absolute', top: 4, right: 4, color: 'rgba(0,0,0,0.45)' }}
          />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('feedback.nudge.title')}</div>
          <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)', lineHeight: 1.5, marginBottom: 12 }}>
            {t('feedback.nudge.text')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="primary" size="small" onClick={openModal}>
              {t('feedback.nudge.cta')}
            </Button>
            <Button type="text" size="small" onClick={dismissNudge}>
              {t('feedback.nudge.dismiss')}
            </Button>
          </div>
        </div>
      )}

      <Tooltip title={t('feedback.title')} placement="left">
        <Badge dot={nudge} offset={[-6, 6]}>
          <Button
            type="primary"
            shape="circle"
            size="large"
            icon={<CommentOutlined style={{ fontSize: 22 }} />}
            aria-label={t('feedback.title')}
            onClick={openModal}
            style={{
              position: 'fixed',
              right: 24,
              bottom: 24,
              zIndex: 1000,
              width: 52,
              height: 52,
              boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
            }}
          />
        </Badge>
      </Tooltip>

      <Modal
        title={(
          <span>
            {t('feedback.title')}
            <span
              style={{
                marginLeft: 8,
                fontSize: 12,
                fontWeight: 400,
                color: '#fa8c16',
                border: '1px solid #ffd591',
                background: '#fff7e6',
                borderRadius: 4,
                padding: '0 6px',
              }}
            >
              {t('feedback.beta')}
            </span>
          </span>
        )}
        open={open}
        onCancel={close}
        onOk={onSubmit}
        confirmLoading={submitting}
        okText={t('feedback.submit')}
        cancelText={t('feedback.cancel')}
        destroyOnClose
      >
        <p style={{ color: 'rgba(0,0,0,0.45)', marginTop: 0 }}>{t('feedback.intro')}</p>
        <Form form={form} layout="vertical" initialValues={{ category: 'SUGGESTION' }} preserve={false}>
          <Form.Item name="category" label={t('feedback.categoryLabel')} rules={[{ required: true }]}>
            <Select options={categories} />
          </Form.Item>
          <Form.Item
            name="message"
            label={t('feedback.messageLabel')}
            rules={[{ required: true, message: t('feedback.messageRequired') }, { max: 2000 }]}
          >
            <TextArea rows={4} maxLength={2000} showCount placeholder={t('feedback.messagePlaceholder')} />
          </Form.Item>
          <Form.Item
            name="email"
            label={t('feedback.emailLabel')}
            rules={[{ type: 'email', message: t('feedback.emailInvalid') }]}
          >
            <Input placeholder={t('feedback.emailPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
