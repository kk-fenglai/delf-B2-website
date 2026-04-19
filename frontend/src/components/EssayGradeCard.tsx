import { useEffect, useRef, useState } from 'react';
import { Card, Progress, Tag, Typography, Button, Alert, Divider, Space, message } from 'antd';
import { ReloadOutlined, RightOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import EssayInlineAnnotations from './EssayInlineAnnotations';
import AIModelPicker from './AIModelPicker';
import type {
  EssayGrade,
  EssayQuota,
  RubricDimension,
  ClaudeModelKey,
} from '../types';

const { Title, Paragraph, Text } = Typography;

const POLL_MS = 3000;

type Props = {
  essayId: string;
  initialStatus?: string;
  // Pass through the question prompt so "too short" / "plan required" states
  // can still show what the student was asked to write.
  questionPrompt?: string;
};

function localeTag(model: ClaudeModelKey | null) {
  if (!model) return '';
  if (model.startsWith('haiku')) return 'Haiku 4.5';
  if (model.startsWith('sonnet')) return 'Sonnet 4.6';
  if (model.startsWith('opus')) return 'Opus 4.7';
  return model;
}

export default function EssayGradeCard({ essayId, initialStatus, questionPrompt }: Props) {
  const { t, i18n } = useTranslation();
  const [essay, setEssay] = useState<EssayGrade | null>(null);
  const [quota, setQuota] = useState<EssayQuota | null>(null);
  const [regrading, setRegrading] = useState(false);
  const [regradeModel, setRegradeModel] = useState<ClaudeModelKey | null>(null);
  const pollTimer = useRef<number | null>(null);

  async function fetchOnce() {
    const { data } = await api.get(`/user/essays/${essayId}`);
    setEssay(data.essay);
    return data.essay as EssayGrade;
  }

  useEffect(() => {
    let cancelled = false;
    async function loop() {
      try {
        const cur = await fetchOnce();
        if (cancelled) return;
        if (cur.status === 'queued' || cur.status === 'grading') {
          pollTimer.current = window.setTimeout(loop, POLL_MS);
        }
      } catch {
        if (!cancelled) pollTimer.current = window.setTimeout(loop, POLL_MS * 2);
      }
    }
    loop();
    // Pre-fetch quota once for the re-grade picker.
    api.get('/user/essays/quota').then((r) => !cancelled && setQuota(r.data)).catch(() => {});
    return () => {
      cancelled = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [essayId]);

  useEffect(() => {
    if (quota?.defaultModel && !regradeModel) setRegradeModel(quota.defaultModel);
  }, [quota, regradeModel]);

  async function onRegrade() {
    if (!regradeModel) return;
    setRegrading(true);
    try {
      const { data } = await api.post(`/user/essays/${essayId}/regrade`, {
        model: regradeModel,
        locale: i18n.language.slice(0, 2),
      });
      setEssay(data.essay);
      // Resume polling.
      const cur = data.essay as EssayGrade;
      if (cur.status === 'queued' || cur.status === 'grading') {
        pollTimer.current = window.setTimeout(async function tick() {
          const fresh = await fetchOnce();
          if (fresh.status === 'queued' || fresh.status === 'grading') {
            pollTimer.current = window.setTimeout(tick, POLL_MS);
          }
        }, POLL_MS);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('essay.grade.error'));
    } finally {
      setRegrading(false);
    }
  }

  const status = essay?.status || initialStatus || 'queued';

  // ---- Early states ------------------------------------------------------
  if (!essay) {
    return (
      <Card className="mb-3">
        <Paragraph className="mb-0 text-gray-500">{t('essay.grade.queued')}</Paragraph>
      </Card>
    );
  }

  if (status === 'queued' || status === 'grading') {
    return (
      <Card className="mb-3">
        <div className="flex items-center gap-3">
          <Progress type="circle" percent={status === 'grading' ? 60 : 20} size={48} />
          <div>
            <Title level={5} style={{ marginBottom: 0 }}>
              {status === 'grading'
                ? t('essay.grade.grading', { model: localeTag(essay.model) })
                : t('essay.grade.queued')}
            </Title>
            <Text type="secondary" className="text-xs">
              {t('essay.grade.pollingHint')}
            </Text>
          </div>
        </div>
      </Card>
    );
  }

  if (status === 'error') {
    const reason = essay.errorMessage || '';
    const msg =
      reason.startsWith('ESSAY_TOO_SHORT')
        ? t('essay.grade.tooShort', { count: essay.wordCount, min: quota?.thresholds.minWords ?? 50 })
        : reason.startsWith('PLAN_UPGRADE_REQUIRED')
          ? t('essay.grade.planRequired')
          : reason.startsWith('QUOTA_EXCEEDED')
            ? t('essay.grade.quotaExceeded')
            : reason.startsWith('AI_NOT_CONFIGURED')
              ? t('essay.grade.error')
              : reason || t('essay.grade.error');

    const canRetry = quota && quota.allowedModels.length > 0 && !reason.startsWith('PLAN_UPGRADE_REQUIRED');

    return (
      <Card className="mb-3">
        <Alert
          type="warning"
          showIcon
          message={t('essay.grade.error')}
          description={msg}
          className="mb-3"
        />
        {questionPrompt && <Paragraph className="text-gray-600 text-sm">{questionPrompt}</Paragraph>}
        <details className="mb-3">
          <summary className="cursor-pointer text-sm text-gray-500">
            {t('essay.grade.wordCount', { count: essay.wordCount })}
          </summary>
          <pre className="whitespace-pre-wrap text-sm mt-2">{essay.content}</pre>
        </details>
        {canRetry && quota && (
          <div>
            <AIModelPicker
              allowedModels={quota.allowedModels}
              models={quota.models}
              defaultModel={quota.defaultModel}
              value={regradeModel}
              onChange={setRegradeModel}
            />
            <Button
              type="primary"
              className="mt-3"
              loading={regrading}
              onClick={onRegrade}
              icon={<ReloadOutlined />}
            >
              {t('essay.grade.retry')}
            </Button>
          </div>
        )}
        {reason.startsWith('PLAN_UPGRADE_REQUIRED') && (
          <Link to="/pricing">
            <Button type="primary">{t('exam.blockedCta')}</Button>
          </Link>
        )}
      </Card>
    );
  }

  // ---- Done state --------------------------------------------------------
  const totalMax = quota?.thresholds.totalMax ?? 25;
  const rubric: RubricDimension[] = essay.rubric || [];
  const pct = Math.round(((essay.aiScore ?? 0) / totalMax) * 100);

  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <Title level={4} style={{ marginBottom: 0 }}>
          {t('essay.grade.title')}
        </Title>
        <Space wrap>
          <Tag color="blue">{localeTag(essay.model)}</Tag>
          <Tag>{t('essay.grade.wordCount', { count: essay.wordCount })}</Tag>
        </Space>
      </div>

      <div className="flex items-center gap-6 flex-wrap mb-4">
        <Progress
          type="circle"
          percent={pct}
          format={() => (
            <div className="text-center">
              <div className="text-2xl font-bold text-brand">{essay.aiScore}</div>
              <div className="text-xs text-gray-500">/ {totalMax}</div>
            </div>
          )}
          size={120}
          strokeColor="#1A3A5C"
        />
        <div className="flex-1 min-w-[220px]">
          <Text type="secondary" className="text-xs block mb-1">
            {t('essay.grade.totalScore')}
          </Text>
          <Paragraph className="mb-0 text-sm">{essay.aiFeedback}</Paragraph>
        </div>
      </div>

      <Divider className="!my-3" />

      <Title level={5}>{t('essay.grade.title')}</Title>
      <div className="space-y-2">
        {rubric.map((d) => (
          <div key={d.key}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{t(`essay.rubric.${d.key}`)}</span>
              <span className="text-gray-600">
                {d.score} / {d.max}
              </span>
            </div>
            <Progress
              percent={Math.round((d.score / d.max) * 100)}
              strokeColor={d.score < d.max * 0.5 ? '#ff4d4f' : '#1A3A5C'}
              showInfo={false}
              size="small"
            />
            <div className="text-xs text-gray-500 mt-0.5">{d.feedback}</div>
          </div>
        ))}
      </div>

      {(essay.strengths?.length ?? 0) > 0 && (
        <>
          <Divider className="!my-3" />
          <Title level={5}>{t('essay.grade.strengths')}</Title>
          <ul className="list-disc pl-5 text-sm text-gray-700">
            {essay.strengths!.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {(essay.corrections?.length ?? 0) > 0 && (
        <>
          <Divider className="!my-3" />
          <Title level={5}>{t('essay.grade.annotationsTitle')}</Title>
          <EssayInlineAnnotations text={essay.content} corrections={essay.corrections!} />
        </>
      )}

      {quota && quota.allowedModels.length > 1 && (
        <>
          <Divider className="!my-3" />
          <AIModelPicker
            allowedModels={quota.allowedModels}
            models={quota.models}
            defaultModel={quota.defaultModel}
            value={regradeModel}
            onChange={setRegradeModel}
          />
          <Button
            type="default"
            className="mt-3"
            loading={regrading}
            disabled={!regradeModel || regradeModel === essay.model}
            onClick={onRegrade}
            icon={<RightOutlined />}
          >
            {regradeModel && regradeModel !== essay.model
              ? t('essay.grade.regradeWith', { model: localeTag(regradeModel) })
              : t('essay.grade.regrade')}
          </Button>
        </>
      )}
    </Card>
  );
}
