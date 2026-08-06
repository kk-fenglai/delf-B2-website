import { useEffect, useState } from 'react';
import {
  Button, Empty, Modal, Form, Input, Select, message, Alert, Dropdown, Card,
} from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MaterialIcon from '../components/MaterialIcon';
import type { UserExamSetBrief, UserExamSetLimits, Skill } from '../types';

const SKILL_PATH: Record<string, string> = {
  CE: 'reading', PE: 'writing', CO: 'listening', PO: 'speaking',
};

// Skill chips: primary (blue) for receptive skills, secondary (violet) for AI-graded productive ones
const SKILL_CHIP: Record<string, string> = {
  CE: 'text-primary bg-primary-container/10',
  CO: 'text-primary bg-primary-container/10',
  PE: 'text-secondary bg-secondary-container/20',
  PO: 'text-secondary bg-secondary-container/20',
};

const SKILL_ICON: Record<string, string> = {
  CE: 'auto_stories', CO: 'hearing', PE: 'edit_document', PO: 'mic',
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
  const skillCount = (sk: Skill) => sets.filter((s) => s.primarySkill === sk).length;

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

  const filterPill = (key: 'ALL' | Skill, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => setTab(key)}
      className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
        tab === key
          ? 'bg-primary text-on-primary'
          : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div>
      <header className="flex flex-wrap justify-between items-start gap-3 mb-8">
        <div>
          <h1 className="text-display-lg text-on-surface mb-2">{t('myExams.title')}</h1>
          <p className="text-body-base text-on-surface-variant max-w-2xl">{t('myExams.subtitle')}</p>
        </div>
        <Button type="primary" size="large" onClick={() => setCreateOpen(true)}>
          <span className="inline-flex items-center gap-1">
            <MaterialIcon name="add" size={20} />
            {t('myExams.create')}
          </span>
        </Button>
      </header>

      {loadError && (
        <Alert type="error" showIcon message={loadError} className="mb-4" />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: custom sets grid */}
        <div className="lg:col-span-8">
          {loading ? (
            <Card loading />
          ) : filtered.length === 0 && !loadError && sets.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-xl shadow-level-1 p-12">
              <Empty description={t('myExams.empty')}>
                <Button type="primary" onClick={() => setCreateOpen(true)}>{t('myExams.createFirst')}</Button>
              </Empty>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className="bg-surface-container-lowest rounded-xl p-5 shadow-level-1 border-2 border-transparent hover:border-primary hover:shadow-level-2 transition-all flex flex-col"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${SKILL_CHIP[s.primarySkill]}`}>
                      <MaterialIcon name={SKILL_ICON[s.primarySkill]} size={22} fill />
                    </div>
                    <Dropdown
                      menu={{
                        items: [
                          { key: 'edit', label: t('myExams.edit'), onClick: () => navigate(`/my-exams/${s.id}/edit`) },
                          {
                            key: 'delete',
                            danger: true,
                            label: t('myExams.removeQ'),
                            onClick: () => Modal.confirm({
                              title: t('myExams.confirmDelete'),
                              okButtonProps: { danger: true },
                              onOk: () => onDelete(s.id),
                            }),
                          },
                        ],
                      }}
                      trigger={['click']}
                    >
                      <button type="button" className="p-1 text-on-surface-variant hover:text-on-surface rounded">
                        <MaterialIcon name="more_vert" size={20} />
                      </button>
                    </Dropdown>
                  </div>
                  <h3 className="text-headline-sm text-on-surface mb-1 break-words">{s.title}</h3>
                  {s.description && (
                    <p className="text-sm text-on-surface-variant mb-2 line-clamp-2">{s.description}</p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap mt-auto pt-3">
                    <span className={`text-label-caps uppercase px-2 py-0.5 rounded ${SKILL_CHIP[s.primarySkill]}`}>
                      {t(`skill.${s.primarySkill}`)}
                    </span>
                    <span className={`text-label-caps uppercase px-2 py-0.5 rounded ${
                      s.isPublished ? 'text-tertiary bg-tertiary-container/15' : 'text-on-surface-variant bg-surface-container'
                    }`}>
                      {s.isPublished ? t('myExams.published') : t('myExams.draft')}
                    </span>
                    <span className="text-xs text-on-surface-variant ml-auto">
                      {t('myExams.questionCount', { n: s.questionCount })}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <Button block onClick={() => navigate(`/my-exams/${s.id}/edit`)}>{t('myExams.edit')}</Button>
                    {s.isPublished && s.questionCount > 0 && (
                      <Button block type="primary" onClick={() => startPractice(s)}>{t('myExams.practice')}</Button>
                    )}
                  </div>
                </div>
              ))}
              {/* Dashed create tile */}
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="min-h-[180px] rounded-xl border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
              >
                <MaterialIcon name="add_circle" size={32} />
                <span className="text-sm font-semibold">{t('myExams.createEmptySet')}</span>
              </button>
            </div>
          )}
        </div>

        {/* Right: overview + filters */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1 border-l-4 border-primary">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-4">{t('myExams.bankOverview')}</h2>
            <div className="flex items-baseline gap-2 mb-4">
              <span className="text-display-lg text-primary tabular-nums">{sets.length}</span>
              <span className="text-sm text-on-surface-variant">{t('myExams.totalSets')}</span>
            </div>
            <div className="space-y-2">
              {TAB_SKILLS.map((sk) => (
                <div key={sk} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-on-surface-variant">
                    <MaterialIcon name={SKILL_ICON[sk]} size={18} />
                    {t(`skill.${sk}`)}
                  </span>
                  <span className="font-semibold text-on-surface tabular-nums">{skillCount(sk)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-4">{t('myExams.filterBySkill')}</h2>
            <div className="flex flex-wrap gap-2">
              {filterPill('ALL', t('myExams.tabAll'))}
              {TAB_SKILLS.map((sk) => filterPill(sk, t(`skill.${sk}`)))}
            </div>
          </div>

          {limits && (
            <div className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1">
              <h2 className="text-label-caps uppercase text-on-surface-variant mb-4">{t('myExams.quotaTitle')}</h2>
              <div className="space-y-2">
                {TAB_SKILLS.map((sk) => (
                  <div key={sk} className="flex items-center justify-between text-sm text-on-surface-variant">
                    <span>{t(`skill.${sk}`)}</span>
                    <span className="tabular-nums">{limits[sk]?.used ?? 0} / {limits[sk]?.cap ?? 0}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

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
