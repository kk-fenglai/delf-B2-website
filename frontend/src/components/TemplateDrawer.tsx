import React, { useEffect, useState } from 'react';
import {
  Drawer, Tabs, Button, List, Typography, Modal, Form, Input,
  Select, Popconfirm, message, Empty, Tag, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, StarOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';

const { Text, Paragraph } = Typography;

interface Template {
  id: string;
  title: string;
  content: string;
  type: 'phrase' | 'structure';
  createdAt?: string;
}

interface SystemTemplate {
  id: string;
  title: string;
  content: string;
  type: 'phrase' | 'structure';
  topic: string;
}

interface SystemTopic {
  key: string;
  label: string;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onInsert?: (content: string) => void;
};

// Treat the backend's sentinel "unlimited" value (UNLIMITED = 99999 in
// planMatrix.js) as effectively infinite when rendering the quota chip.
const UNLIMITED_THRESHOLD = 9999;

type Quota = { used: number; cap: number; plan: string };

export default function TemplateDrawer({ open, onClose, onInsert }: Props) {
  const { t } = useTranslation();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [systemTemplates, setSystemTemplates] = useState<SystemTemplate[]>([]);
  const [systemTopics, setSystemTopics] = useState<SystemTopic[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Template | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'phrase' | 'structure' | 'system'>('system');
  const [selectedTopic, setSelectedTopic] = useState<string>('general');
  const [quota, setQuota] = useState<Quota | null>(null);
  const [form] = Form.useForm();

  const canCreate = quota ? quota.used < quota.cap : false;
  const isUnlimited = !!quota && quota.cap >= UNLIMITED_THRESHOLD;
  const needsUpgrade = !!quota && quota.cap === 0;

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/user/templates');
      setTemplates(data.templates ?? []);
      setSystemTemplates(data.systemTemplates ?? []);
      if (data.quota) setQuota(data.quota);
      if (data.systemTopics?.length) {
        setSystemTopics(data.systemTopics);
        setSelectedTopic(data.systemTopics[0].key);
      }
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) load();
  }, [open]);

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ type: activeTab === 'system' ? 'phrase' : activeTab });
    setModalOpen(true);
  }

  function openEdit(tpl: Template) {
    setEditing(tpl);
    form.setFieldsValue({ title: tpl.title, content: tpl.content, type: tpl.type });
    setModalOpen(true);
  }

  async function handleSave() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        const { data } = await api.put(`/user/templates/${editing.id}`, values);
        setTemplates((prev) => prev.map((x) => (x.id === editing.id ? data.template : x)));
      } else {
        const { data } = await api.post('/user/templates', values);
        setTemplates((prev) => [data.template, ...prev]);
        setQuota((q) => (q ? { ...q, used: q.used + 1 } : q));
      }
      setModalOpen(false);
    } catch (e: any) {
      const code = e?.response?.data?.code;
      if (code === 'TEMPLATE_QUOTA_EXCEEDED' || code === 'PLAN_UPGRADE_REQUIRED') {
        message.error(t('template.quotaExceeded'));
        // Refresh quota state so the alert/button reflect the truth.
        load();
      } else {
        message.error(e?.response?.data?.error || t('template.saveError'));
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/user/templates/${id}`);
      setTemplates((prev) => prev.filter((x) => x.id !== id));
      setQuota((q) => (q ? { ...q, used: Math.max(0, q.used - 1) } : q));
    } catch {
      message.error(t('template.deleteError'));
    }
  }

  function doInsert(content: string) {
    onInsert?.(content);
    message.success(t('template.inserted'));
  }

  const filteredUser = templates.filter((x) => x.type === activeTab);
  const filteredSystem = systemTemplates.filter((x) => x.topic === selectedTopic);

  const renderInsertBtn = (content: string): React.ReactNode => {
    if (!onInsert) return null;
    return (
      <Button
        type="primary"
        size="small"
        icon={<CopyOutlined />}
        onClick={() => doInsert(content)}
      >
        {t('template.insert')}
      </Button>
    );
  };

  return (
    <>
      <Drawer
        title={
          <span>
            {t('template.drawerTitle')}
            {quota && !needsUpgrade && (
              <Tag className="ml-2" color={canCreate ? 'blue' : 'orange'}>
                {isUnlimited
                  ? t('template.quotaUnlimited')
                  : t('template.quotaUsed', { used: quota.used, cap: quota.cap })}
              </Tag>
            )}
          </span>
        }
        open={open}
        onClose={onClose}
        width={440}
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={openCreate}
            disabled={!canCreate || activeTab === 'system'}
          >
            {t('template.new')}
          </Button>
        }
      >
        {needsUpgrade && (
          <Alert
            type="info"
            showIcon
            className="mb-3"
            message={t('template.upgradeAlert')}
            action={(
              <Link to="/pricing">
                <Button size="small" type="primary">
                  {t('exam.blockedCta')}
                </Button>
              </Link>
            )}
          />
        )}
        <Tabs
          activeKey={activeTab}
          onChange={(k) => setActiveTab(k as typeof activeTab)}
          items={[
            {
              key: 'system',
              label: (
                <span>
                  <StarOutlined className="mr-1" />
                  {t('template.systemTab')}
                </span>
              ),
              children: (
                <div>
                  <Select
                    value={selectedTopic}
                    onChange={setSelectedTopic}
                    style={{ width: '100%', marginBottom: 12 }}
                    options={systemTopics.map((tp) => ({ value: tp.key, label: tp.label }))}
                  />
                  {filteredSystem.length === 0 ? (
                    <Empty description={t('template.empty')} className="mt-8" />
                  ) : (
                    <List
                      loading={loading}
                      dataSource={filteredSystem}
                      renderItem={(item) => (
                        <List.Item
                          key={item.id}
                          actions={[renderInsertBtn(item.content)]}
                        >
                          <List.Item.Meta
                            title={
                              <span>
                                <Text strong>{item.title}</Text>
                                <Tag
                                  className="ml-2"
                                  color={item.type === 'structure' ? 'blue' : 'green'}
                                  style={{ fontSize: 11 }}
                                >
                                  {item.type === 'structure' ? t('template.structureTab') : t('template.phraseTab')}
                                </Tag>
                              </span>
                            }
                            description={
                              <Paragraph ellipsis={{ rows: 2 }} className="text-xs text-gray-500 mb-0">
                                {item.content}
                              </Paragraph>
                            }
                          />
                        </List.Item>
                      )}
                    />
                  )}
                </div>
              ),
            },
            {
              key: 'phrase',
              label: t('template.phraseTab'),
              children: (
                filteredUser.length === 0 && !loading ? (
                  <Empty description={t('template.empty')} className="mt-8" />
                ) : (
                  <List
                    loading={loading}
                    dataSource={filteredUser}
                    renderItem={(item) => (
                      <List.Item
                        key={item.id}
                        actions={[
                          renderInsertBtn(item.content),
                          <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)} />,
                          <Popconfirm
                            key="del"
                            title={t('template.confirmDelete')}
                            onConfirm={() => handleDelete(item.id)}
                            okText={t('template.confirmYes')}
                            cancelText={t('template.confirmNo')}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta
                          title={<Text strong>{item.title}</Text>}
                          description={
                            <Paragraph ellipsis={{ rows: 2 }} className="text-xs text-gray-500 mb-0">
                              {item.content}
                            </Paragraph>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )
              ),
            },
            {
              key: 'structure',
              label: t('template.structureTab'),
              children: (
                filteredUser.filter((x) => x.type === 'structure').length === 0 && !loading ? (
                  <Empty description={t('template.empty')} className="mt-8" />
                ) : (
                  <List
                    loading={loading}
                    dataSource={templates.filter((x) => x.type === 'structure')}
                    renderItem={(item) => (
                      <List.Item
                        key={item.id}
                        actions={[
                          renderInsertBtn(item.content),
                          <Button key="edit" size="small" icon={<EditOutlined />} onClick={() => openEdit(item)} />,
                          <Popconfirm
                            key="del"
                            title={t('template.confirmDelete')}
                            onConfirm={() => handleDelete(item.id)}
                            okText={t('template.confirmYes')}
                            cancelText={t('template.confirmNo')}
                          >
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>,
                        ]}
                      >
                        <List.Item.Meta
                          title={<Text strong>{item.title}</Text>}
                          description={
                            <Paragraph ellipsis={{ rows: 2 }} className="text-xs text-gray-500 mb-0">
                              {item.content}
                            </Paragraph>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )
              ),
            },
          ]}
        />
      </Drawer>

      <Modal
        open={modalOpen}
        title={editing ? t('template.editTitle') : t('template.createTitle')}
        onCancel={() => setModalOpen(false)}
        onOk={handleSave}
        okText={t('template.save')}
        confirmLoading={saving}
        width={560}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label={t('template.typeLabel')} rules={[{ required: true }]}>
            <Select
              options={[
                { value: 'phrase', label: t('template.phraseTab') },
                { value: 'structure', label: t('template.structureTab') },
              ]}
            />
          </Form.Item>
          <Form.Item name="title" label={t('template.titleLabel')} rules={[{ required: true, max: 100 }]}>
            <Input placeholder={t('template.titlePlaceholder')} />
          </Form.Item>
          <Form.Item name="content" label={t('template.contentLabel')} rules={[{ required: true }]}>
            <Input.TextArea rows={8} placeholder={t('template.contentPlaceholder')} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
