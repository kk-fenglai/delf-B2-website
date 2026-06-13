import { useEffect, useState } from 'react';
import {
  Card, Typography, Button, Tag, Empty, Tabs, Modal, Form, Input, Select, message, Popconfirm, Space, Alert,
} from 'antd';
import { PlusOutlined, EditOutlined, PlayCircleOutlined, DeleteOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { UserExamSetBrief, UserExamSetLimits, Skill } from '../types';

const { Title, Paragraph, Text } = Typography;

const SKILL_PATH: Record<string, string> = {
  CE: 'reading', PE: 'writing', CO: 'listening', PO: 'speaking',
};

const SKILL_TAG_COLOR: Record<string, string> = {
  CE: 'blue', PE: 'green', CO: 'purple', PO: 'orange',
};

const TAB_SKILLS: Skill[] = ['CE', 'PE', 'CO', 'PO'];

export default function MyExams() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [sets, setSets] = useState<UserExamSetBrief[]>([]);
  const [limits, setLimits] = useState<UserExamSetLimits | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'ALL' | Skill>('ALL');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data } = await api.get('/user/exam-sets/overview');
      setSets(data.sets || []);
      setLimits(data.limits || null);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } };
      const status = err.response?.status;
      if (status === 401) {
        setLoadError(t('myExams.errorLogin'));
      } else if (status === 404) {
        setLoadError(t('myExams.errorNotDeployed'));
      } else {
        setLoadError(t('myExams.errorServer'));
      }
      message.error(t('myExams.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = tab === 'ALL' ? sets : sets.filter((s) => s.primarySkill === tab);

  const onCreate = async () => {
    try {
      const values = await form.validateFields();
      setCreating(true);
      const { data } = await api.post('/user/exam-sets', values);
      message.success(t('myExams.created'));
      setCreateOpen(false);
      form.resetFields();
      navigate(`/my-exams/${data.set.id}/edit`);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { code?: string; skill?: string } } };
      if (err.response?.data?.code === 'USER_EXAM_SET_LIMIT') {
        message.warning(t('myExams.limitReached', { skill: t(`skill.${err.response.data.skill}`) }));
      } else if (err.response?.data?.code === 'USER_EXAM_SET_SKILL_LOCKED') {
        message.warning(t('myExams.skillLocked'));
      } else if (!(e as { errorFields?: unknown }).errorFields) {
        message.error(t('myExams.createFailed'));
      }
    } finally {
      setCreating(false);
    }
  };

  const onDelete = async (id: string) => {
    try {
      await api.delete(`/user/exam-sets/${id}`);
      message.success(t('myExams.deleted'));
      load();
    } catch {
      message.error(t('myExams.deleteFailed'));
    }
  };

  const startPractice = (s: UserExamSetBrief) => {
    const path = SKILL_PATH[s.primarySkill] || 'reading';
    navigate(`/practice/${path}/${s.id}`);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex flex-wrap justify-between items-start gap-3 mb-4">
        <div>
          <Title level={2} className="!mb-1">{t('myExams.title')}</Title>
          <Paragraph type="secondary" className="!mb-0">{t('myExams.subtitle')}</Paragraph>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          {t('myExams.create')}
        </Button>
      </div>

      {loadError && (
        <Alert type="error" showIcon message={loadError} className="mb-4" />
      )}

      {limits && (
        <Card size="small" className="mb-4">
          <Space wrap>
            {TAB_SKILLS.map((sk) => (
              <Text key={sk} type="secondary">
                {t(`skill.${sk}`)}: {limits[sk]?.used ?? 0} / {limits[sk]?.cap ?? 0}
              </Text>
            ))}
          </Space>
        </Card>
      )}

      <Tabs
        activeKey={tab}
        onChange={(k) => setTab(k as typeof tab)}
        items={[
          { key: 'ALL', label: t('myExams.tabAll') },
          ...TAB_SKILLS.map((sk) => ({ key: sk, label: t(`skill.${sk}`) })),
        ]}
        className="mb-4"
      />

      {loading ? (
        <Card loading />
      ) : filtered.length === 0 && !loadError ? (
        <Empty description={t('myExams.empty')}>
          <Button type="primary" onClick={() => setCreateOpen(true)}>{t('myExams.createFirst')}</Button>
        </Empty>
      ) : filtered.length === 0 ? null : (
        <div className="flex flex-col gap-3">
          {filtered.map((s) => (
            <Card key={s.id} size="small">
              <div className="flex flex-wrap justify-between gap-3 items-start">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Text strong>{s.title}</Text>
                    <Tag color={SKILL_TAG_COLOR[s.primarySkill]}>{t(`skill.${s.primarySkill}`)}</Tag>
                    <Tag color={s.isPublished ? 'success' : 'default'}>
                      {s.isPublished ? t('myExams.published') : t('myExams.draft')}
                    </Tag>
                  </div>
                  {s.description && <Text type="secondary" className="text-sm">{s.description}</Text>}
                  <div className="text-xs text-gray-400 mt-1">
                    {t('myExams.questionCount', { n: s.questionCount })}
                  </div>
                </div>
                <Space wrap>
                  <Button icon={<EditOutlined />} onClick={() => navigate(`/my-exams/${s.id}/edit`)}>
                    {t('myExams.edit')}
                  </Button>
                  {s.isPublished && s.questionCount > 0 && (
                    <Button type="primary" icon={<PlayCircleOutlined />} onClick={() => startPractice(s)}>
                      {t('myExams.practice')}
                    </Button>
                  )}
                  <Popconfirm title={t('myExams.confirmDelete')} onConfirm={() => onDelete(s.id)}>
                    <Button danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        title={t('myExams.createTitle')}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={onCreate}
        confirmLoading={creating}
        okText={t('myExams.create')}
      >
        <Form form={form} layout="vertical" initialValues={{ primarySkill: 'CE' }}>
          <Form.Item name="primarySkill" label={t('myExams.skillLabel')} rules={[{ required: true }]}>
            <Select options={TAB_SKILLS.map((sk) => ({ value: sk, label: t(`skill.${sk}`) }))} />
          </Form.Item>
          <Form.Item name="title" label={t('myExams.titleLabel')} rules={[{ required: true, max: 200 }]}>
            <Input placeholder={t('myExams.titlePlaceholder')} />
          </Form.Item>
          <Form.Item name="description" label={t('myExams.descLabel')}>
            <Input.TextArea rows={2} maxLength={500} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
