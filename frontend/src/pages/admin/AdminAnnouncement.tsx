import { useCallback, useEffect, useState } from 'react';
import {
  Card, Form, Switch, Input, Button, Space, Alert, Tabs, Typography, message,
} from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title, Paragraph } = Typography;
const { TextArea } = Input;

type Localized = { zh?: string; en?: string; fr?: string };

interface Announcement {
  enabled: boolean;
  title: Localized;
  body: Localized;
  version: string | null;
}

const LOCALES: { key: keyof Localized; label: string }[] = [
  { key: 'zh', label: '中文' },
  { key: 'en', label: 'English' },
  { key: 'fr', label: 'Français' },
];

export default function AdminAnnouncement() {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/announcement');
      const a = data.announcement as Announcement;
      setEnabled(a.enabled);
      form.setFieldsValue({
        enabled: a.enabled,
        titleZh: a.title?.zh || '', bodyZh: a.body?.zh || '',
        titleEn: a.title?.en || '', bodyEn: a.body?.en || '',
        titleFr: a.title?.fr || '', bodyFr: a.body?.fr || '',
      });
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => { load(); }, [load]);

  const onSave = async () => {
    try {
      const v = await form.validateFields();
      setSaving(true);
      await adminApi.patch('/announcement', {
        enabled: v.enabled,
        title: { zh: v.titleZh, en: v.titleEn, fr: v.titleFr },
        body: { zh: v.bodyZh, en: v.bodyEn, fr: v.bodyFr },
      });
      message.success('已保存');
      await load();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } }; errorFields?: unknown };
      if (!err.errorFields) {
        message.error(err.response?.data?.error || '保存失败');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-content">
      <div className="admin-page-header">
        <Title level={3} style={{ margin: 0 }}>站内公告</Title>
      </div>

      <Card
        loading={loading}
        extra={(
          <Space wrap>
            <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={onSave} loading={saving}>保存</Button>
          </Space>
        )}
      >
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="公告以弹窗形式展示给已登录用户，每次登录出现一次。"
          description="关闭开关后，用户端立即不再展示（最多有 15 秒缓存延迟）。修改文案后，已经看过的用户会再看到一次新内容。"
        />

        <Form form={form} layout="vertical" disabled={loading}>
          <Form.Item
            name="enabled"
            label="启用公告"
            valuePropName="checked"
            extra={enabled ? '当前：用户登录后会看到公告' : '当前：用户端不展示任何公告'}
          >
            <Switch
              checkedChildren="开"
              unCheckedChildren="关"
              onChange={setEnabled}
            />
          </Form.Item>

          <Tabs
            items={LOCALES.map(({ key, label }) => {
              const suffix = key.charAt(0).toUpperCase() + key.slice(1);
              return {
                key,
                label,
                children: (
                  <>
                    <Form.Item
                      name={`title${suffix}`}
                      label="标题"
                      rules={[{ max: 120 }]}
                    >
                      <Input placeholder="本次更新" maxLength={120} showCount />
                    </Form.Item>
                    <Form.Item
                      name={`body${suffix}`}
                      label="正文"
                      rules={[{ max: 1000 }]}
                    >
                      <TextArea rows={5} maxLength={1000} showCount placeholder="支持换行。" />
                    </Form.Item>
                  </>
                ),
              };
            })}
          />
        </Form>

        <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
          用户看到的语言取决于其界面语言设置；若对应语言留空，会回退到中文。
        </Paragraph>
      </Card>
    </div>
  );
}
