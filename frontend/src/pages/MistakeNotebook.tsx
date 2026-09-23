import { useEffect, useState } from 'react';
import {
  Card, Typography, Tag, Button, Empty, Spin, Pagination, Alert,
  Radio, Checkbox, Input, message,
} from 'antd';
import {
  CheckCircleTwoTone, CloseCircleTwoTone, ReloadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import MaterialIcon from '../components/MaterialIcon';
import type { MistakeItem, MistakesResponse, MistakeStats, Skill } from '../types';

const { Paragraph, Text } = Typography;

const SKILL_KEYS: Array<Skill | 'ALL'> = ['ALL', 'CO', 'CE', 'PE', 'PO'];

const SKILL_ICON: Record<Skill, string> = {
  CO: 'hearing', CE: 'auto_stories', PE: 'edit_document', PO: 'mic', SL: 'spellcheck',
};

function formatAnswer(ans: string | string[]): string {
  if (Array.isArray(ans)) return ans.length ? ans.join(', ') : '—';
  const s = String(ans ?? '').trim();
  return s || '—';
}

type RetryResult = {
  isCorrect: boolean | null;
  correctAnswer: string[];
  explanation: string | null;
  cleared: boolean;
};

function MistakeCard({
  item,
  onCleared,
}: {
  item: MistakeItem;
  onCleared: (attemptId: string) => void;
}) {
  const { t } = useTranslation();
  const [retryOpen, setRetryOpen] = useState(false);
  const [retryAnswer, setRetryAnswer] = useState<string | string[]>(
    item.type === 'MULTIPLE' ? [] : ''
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RetryResult | null>(null);

  const userAns = formatAnswer(item.userAnswer);
  const correctAns = formatAnswer(item.correctAnswer);

  const submitRetry = async () => {
    const empty = Array.isArray(retryAnswer)
      ? retryAnswer.length === 0
      : !retryAnswer.toString().trim();
    if (empty) {
      message.warning(t('mistakes.retryEmpty'));
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<RetryResult>(
        `/user/mistakes/${item.questionId}/retry`,
        { answer: retryAnswer }
      );
      setResult(data);
      if (data.cleared) {
        message.success(t('mistakes.retryCorrect'));
        // Give the success toast a beat to land before the card disappears,
        // otherwise the user doesn't register what happened.
        setTimeout(() => onCleared(item.attemptId), 900);
      } else {
        message.error(t('mistakes.retryWrong'));
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('mistakes.retryFail'));
    } finally {
      setSubmitting(false);
    }
  };

  const renderRetryInput = () => {
    if (item.type === 'SINGLE' || item.type === 'TRUE_FALSE') {
      return (
        <Radio.Group
          value={retryAnswer}
          onChange={(e) => setRetryAnswer(e.target.value)}
          className="flex flex-col gap-2"
          disabled={!!result?.cleared}
        >
          {item.options.map((o) => (
            <Radio key={o.id} value={o.label} className="p-2 hover:bg-gray-50 rounded">
              <strong>{o.label}.</strong> {o.text}
            </Radio>
          ))}
        </Radio.Group>
      );
    }
    if (item.type === 'MULTIPLE') {
      return (
        <Checkbox.Group
          value={Array.isArray(retryAnswer) ? retryAnswer : []}
          onChange={(v) => setRetryAnswer(v as string[])}
          className="flex flex-col gap-2"
          disabled={!!result?.cleared}
        >
          {item.options.map((o) => (
            <Checkbox key={o.id} value={o.label} className="p-2 hover:bg-gray-50 rounded">
              <strong>{o.label}.</strong> {o.text}
            </Checkbox>
          ))}
        </Checkbox.Group>
      );
    }
    // FILL
    return (
      <Input
        value={Array.isArray(retryAnswer) ? '' : retryAnswer}
        onChange={(e) => setRetryAnswer(e.target.value)}
        placeholder={t('mistakes.retryFillPlaceholder')}
        disabled={!!result?.cleared}
      />
    );
  };

  return (
    <Card
      className="mb-4 shadow-level-1"
      title={
        <div className="flex items-center gap-3 flex-wrap py-2">
          <div className="w-9 h-9 rounded-lg bg-error-container/60 text-on-error-container flex items-center justify-center shrink-0">
            <MaterialIcon name={SKILL_ICON[item.skill]} size={20} fill />
          </div>
          <span className="text-label-caps uppercase px-2 py-0.5 rounded text-primary bg-primary-container/10">
            {t(`skill.${item.skill}`)}
          </span>
          <Tag>{item.type}</Tag>
          {item.examSet.isUserOwned && (
            <Tag color="cyan">{t('mistakes.userOwnedTag')}</Tag>
          )}
          <Text type="secondary" className="text-xs font-normal">
            {item.examSet.title}
          </Text>
        </div>
      }
      extra={
        <Text type="secondary" className="text-xs">
          {new Date(item.attemptedAt).toLocaleDateString()}
        </Text>
      }
    >
      {item.passage && item.skill !== 'CO' && (
        <div className="bg-surface-container-low p-3 rounded mb-3 text-sm border-l-4 border-primary-container max-h-40 overflow-y-auto font-serif">
          {item.passage}
        </div>
      )}

      <Paragraph className="font-semibold mb-3">{item.prompt}</Paragraph>

      {item.options.length > 0 && (
        <div className="mb-3 flex flex-col gap-1">
          {item.options.map((o) => {
            const isUserPick = Array.isArray(item.userAnswer)
              ? item.userAnswer.includes(o.label)
              : item.userAnswer === o.label;
            const cls = o.isCorrect
              ? 'bg-green-50 border-green-300'
              : isUserPick
              ? 'bg-red-50 border-red-300'
              : 'bg-white border-gray-200';
            return (
              <div key={o.id} className={`p-2 rounded border ${cls} text-sm`}>
                <strong>{o.label}.</strong> {o.text}
                {o.isCorrect && (
                  <CheckCircleTwoTone twoToneColor="#52c41a" className="ml-2" />
                )}
                {!o.isCorrect && isUserPick && (
                  <CloseCircleTwoTone twoToneColor="#ff4d4f" className="ml-2" />
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div className="bg-red-50 p-2 rounded border border-red-200">
          <Text type="secondary" className="text-xs">{t('mistakes.yourAnswer')}</Text>
          <div className="font-medium text-red-700">{userAns}</div>
        </div>
        <div className="bg-green-50 p-2 rounded border border-green-200">
          <Text type="secondary" className="text-xs">{t('mistakes.correctAnswer')}</Text>
          <div className="font-medium text-green-700">{correctAns}</div>
        </div>
      </div>

      {item.explanation && (
        <Alert
          type="info"
          message={t('mistakes.explanation')}
          description={item.explanation}
          className="mb-3"
        />
      )}

      {retryOpen && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <Text strong className="block mb-2">{t('mistakes.retryPrompt')}</Text>
          {renderRetryInput()}
          {result && !result.cleared && (
            <Alert
              type="error"
              className="mt-3"
              showIcon
              icon={<CloseCircleTwoTone twoToneColor="#ff4d4f" />}
              message={t('mistakes.retryWrongBanner', {
                answer: result.correctAnswer.join(', '),
              })}
              description={result.explanation || undefined}
            />
          )}
          {result?.cleared && (
            <Alert
              type="success"
              className="mt-3"
              showIcon
              icon={<CheckCircleTwoTone twoToneColor="#52c41a" />}
              message={t('mistakes.retryCorrectBanner')}
            />
          )}
        </div>
      )}

      <div className="flex justify-end gap-2 mt-3">
        {!retryOpen ? (
          <Button
            type="primary"
            icon={<EditOutlined />}
            onClick={() => setRetryOpen(true)}
          >
            {t('mistakes.retryOpen')}
          </Button>
        ) : (
          <>
            <Button
              onClick={() => {
                setRetryOpen(false);
                setResult(null);
                setRetryAnswer(item.type === 'MULTIPLE' ? [] : '');
              }}
              disabled={submitting}
            >
              {t('mistakes.retryCancel')}
            </Button>
            {!result?.cleared && (
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={submitting}
                onClick={submitRetry}
              >
                {t('mistakes.retrySubmit')}
              </Button>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

export default function MistakeNotebook() {
  const { t } = useTranslation();
  const [skill, setSkill] = useState<Skill | 'ALL'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [data, setData] = useState<MistakesResponse | null>(null);
  const [stats, setStats] = useState<MistakeStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const { data } = await api.get<MistakeStats>('/user/mistakes/stats');
      setStats(data);
    } catch {
      // Non-fatal: tabs simply render without badge counts.
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, pageSize };
      if (skill !== 'ALL') params.skill = skill;
      const { data } = await api.get<MistakesResponse>('/user/mistakes', { params });
      setData(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { fetchItems(); /* eslint-disable-next-line */ }, [skill, page]);

  // Optimistic removal after a successful retry — avoid a full refetch so the
  // card's "Correct!" banner stays on screen during the fade. Stats are
  // refreshed so the tab badge counts stay in sync with reality.
  const handleCleared = (attemptId: string) => {
    setData((d) =>
      d
        ? { ...d, items: d.items.filter((i) => i.attemptId !== attemptId), total: Math.max(0, d.total - 1) }
        : d
    );
    fetchStats();
  };

  // Reset pagination when the skill filter changes so we never land on an
  // out-of-range page (e.g. page 3 of "all" but only 1 page of "CO").
  const onSkillChange = (k: string) => {
    setSkill(k as Skill | 'ALL');
    setPage(1);
  };

  const totalForTab = (k: Skill | 'ALL'): number => {
    if (!stats) return 0;
    if (k === 'ALL') return stats.total;
    return stats.bySkill[k] || 0;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-display-lg text-on-surface mb-2">{t('mistakes.title')}</h1>
        <p className="text-body-base text-on-surface-variant max-w-2xl">{t('mistakes.infoDesc')}</p>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1 border-l-4 border-primary">
          <div className="text-label-caps uppercase text-on-surface-variant mb-2">{t('mistakes.totalMistakes')}</div>
          <div className="flex items-center gap-3">
            <span className="text-display-lg text-on-surface tabular-nums">{stats?.total ?? '—'}</span>
            <span className="w-10 h-10 rounded-lg bg-error-container/60 text-on-error-container flex items-center justify-center">
              <MaterialIcon name="menu_book" size={22} fill />
            </span>
          </div>
        </div>
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-level-1">
          <div className="text-label-caps uppercase text-on-surface-variant mb-3">{t('mistakes.bySkill')}</div>
          <div className="flex flex-wrap gap-2">
            {(['CO', 'CE', 'PE', 'PO'] as Skill[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-tertiary-container/15 text-tertiary">
                <MaterialIcon name={SKILL_ICON[k]} size={14} />
                {t(`skill.${k}`)} · {totalForTab(k)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Skill filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {SKILL_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onSkillChange(k)}
            className={`px-3 py-1.5 rounded-full text-sm font-semibold transition-colors ${
              skill === k
                ? 'bg-primary text-on-primary'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            {k === 'ALL' ? t('mistakes.tabAll') : t(`skill.${k}`)}
            {totalForTab(k) > 0 && <span className="ml-1.5 tabular-nums opacity-80">{totalForTab(k)}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spin size="large" /></div>
      ) : !data || data.items.length === 0 ? (
        <Empty description={t('mistakes.empty')} className="py-16" />
      ) : (
        <>
          {data.items.map((item) => (
            <MistakeCard key={item.attemptId} item={item} onCleared={handleCleared} />
          ))}
          {data.total > pageSize && (
            <div className="flex justify-center mt-4">
              <Pagination
                current={page}
                pageSize={pageSize}
                total={data.total}
                onChange={(p) => setPage(p)}
                showSizeChanger={false}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
