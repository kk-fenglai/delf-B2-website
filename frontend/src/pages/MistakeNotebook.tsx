import { useEffect, useMemo, useState } from 'react';
import {
  Card, Typography, Tabs, Tag, Button, Empty, Spin, Pagination, Badge, Space, Alert,
  Radio, Checkbox, Input, message,
} from 'antd';
import {
  BookOutlined, CheckCircleTwoTone, CloseCircleTwoTone, ReloadOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { MistakeItem, MistakesResponse, MistakeStats, Skill } from '../types';

const { Title, Paragraph, Text } = Typography;

const SKILL_KEYS: Array<Skill | 'ALL'> = ['ALL', 'CO', 'CE', 'PE', 'PO'];

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
      className="mb-4"
      title={
        <div className="flex items-center gap-2 flex-wrap">
          <Tag color="red">{t(`skill.${item.skill}`)}</Tag>
          <Tag>{item.type}</Tag>
          <Text type="secondary" className="text-xs">
            {item.examSet.title} · {item.examSet.year}
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
        <div className="bg-gray-50 p-3 rounded mb-3 text-sm border-l-4 border-brand max-h-40 overflow-y-auto">
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

  const tabs = useMemo(
    () =>
      SKILL_KEYS.map((k) => ({
        key: k,
        label: (
          <Space>
            <span>{k === 'ALL' ? t('mistakes.tabAll') : t(`skill.${k}`)}</span>
            <Badge count={totalForTab(k)} showZero={false} overflowCount={99} />
          </Space>
        ),
      })),
    // eslint-disable-next-line
    [stats, t]
  );

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <Title level={3} className="!mb-0">
          <BookOutlined className="mr-2" />
          {t('mistakes.title')}
        </Title>
        {stats && (
          <Tag color={stats.total > 0 ? 'red' : 'green'} className="text-base px-3 py-1">
            {t('mistakes.totalCount', { n: stats.total })}
          </Tag>
        )}
      </div>

      <Alert
        type="info"
        showIcon
        className="mb-4"
        message={t('mistakes.infoTitle')}
        description={t('mistakes.infoDesc')}
      />

      <Tabs activeKey={skill} onChange={onSkillChange} items={tabs} />

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
