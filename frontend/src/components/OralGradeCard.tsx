import { useEffect, useRef, useState } from 'react';
import {
  Card, Progress, Tag, Typography, Button, Alert, Divider, Space, message, Collapse,
} from 'antd';
import { ReloadOutlined, RightOutlined, SoundOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type {
  OralGrade,
  OralQuota,
  OralRubricDimension,
  ClaudeModelKey,
} from '../types';
import { aiModelDisplayName } from '../utils/aiModelDisplay';

const { Title, Paragraph, Text } = Typography;

const POLL_MS = 1500;
const STUCK_WARN_MS = 25_000;
const STUCK_TIMEOUT_MS = 90_000; // STT (30-60s) + LLM (4-8s); allow ample headroom

type Props = {
  oralId: string;
  initialStatus?: string;
  questionPrompt?: string;
};

// Status → progress percentage (cosmetic). Roughly mirrors the actual time
// split: STT is the slow phase, LLM is faster.
function statusPercent(s: string): number {
  if (s === 'queued') return 10;
  if (s === 'transcribing') return 45;
  if (s === 'grading') return 80;
  return 100;
}

export default function OralGradeCard({ oralId, initialStatus, questionPrompt }: Props) {
  const { t, i18n } = useTranslation();
  const [oral, setOral] = useState<OralGrade | null>(null);
  const [quota, setQuota] = useState<OralQuota | null>(null);
  const [regrading, setRegrading] = useState(false);
  const [regradeModel, setRegradeModel] = useState<ClaudeModelKey | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const pollTimer = useRef<number | null>(null);
  const pollStartRef = useRef<number | null>(null);

  async function fetchOnce() {
    const { data } = await api.get(`/user/orals/${oralId}`);
    setOral(data.oral);
    return data.oral as OralGrade;
  }

  useEffect(() => {
    let cancelled = false;
    async function loop() {
      try {
        const cur = await fetchOnce();
        if (cancelled) return;
        const inProgress = cur.status === 'queued' || cur.status === 'transcribing' || cur.status === 'grading';
        if (inProgress) {
          if (pollStartRef.current == null) pollStartRef.current = Date.now();
          const waited = Date.now() - pollStartRef.current;
          setElapsedMs(waited);
          if (waited >= STUCK_TIMEOUT_MS) {
            setOral({
              ...cur,
              status: 'error',
              errorMessage: 'FRONTEND_TIMEOUT: oral grading took longer than 90s',
            });
            return;
          }
          pollTimer.current = window.setTimeout(loop, POLL_MS);
        } else {
          pollStartRef.current = null;
        }
      } catch {
        if (!cancelled) pollTimer.current = window.setTimeout(loop, POLL_MS * 2);
      }
    }
    loop();
    api.get('/user/orals/quota').then((r) => !cancelled && setQuota(r.data)).catch(() => {});
    return () => {
      cancelled = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oralId]);

  useEffect(() => {
    if (quota?.defaultModel && !regradeModel) setRegradeModel(quota.defaultModel);
  }, [quota, regradeModel]);

  async function onRegrade() {
    if (!regradeModel) return;
    setRegrading(true);
    try {
      const { data } = await api.post(`/user/orals/${oralId}/regrade`, {
        model: regradeModel,
        locale: i18n.language.slice(0, 2),
      });
      setOral(data.oral);
      const cur = data.oral as OralGrade;
      const inProgress = cur.status === 'queued' || cur.status === 'transcribing' || cur.status === 'grading';
      if (inProgress) {
        pollTimer.current = window.setTimeout(async function tick() {
          const fresh = await fetchOnce();
          const stillBusy = fresh.status === 'queued' || fresh.status === 'transcribing' || fresh.status === 'grading';
          if (stillBusy) pollTimer.current = window.setTimeout(tick, POLL_MS);
        }, POLL_MS);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.error || t('oral.grade.error'));
    } finally {
      setRegrading(false);
    }
  }

  const status = oral?.status || initialStatus || 'queued';

  if (!oral) {
    return (
      <Card className="mb-3">
        <Paragraph className="mb-0 text-gray-500">{t('oral.grade.queued')}</Paragraph>
      </Card>
    );
  }

  // ---- In-progress states (queued / transcribing / grading) -------------
  if (status === 'queued' || status === 'transcribing' || status === 'grading') {
    const slow = elapsedMs >= STUCK_WARN_MS;
    const phaseKey = status === 'transcribing'
      ? 'oral.grade.transcribing'
      : status === 'grading'
        ? 'ai.model.calling'
        : 'oral.grade.queued';
    return (
      <Card className="mb-3">
        <div className="flex items-center gap-3">
          <Progress type="circle" percent={statusPercent(status)} size={48} />
          <div>
            <Title level={5} style={{ marginBottom: 0 }}>
              {t(phaseKey)}
            </Title>
            <Text type="secondary" className="text-xs">
              {t('oral.grade.pollingHint')}
              {elapsedMs > 0 && ` · ${Math.round(elapsedMs / 1000)}s`}
            </Text>
          </div>
        </div>
        {slow && (
          <Alert
            className="mt-3"
            type="warning"
            showIcon
            message={t('oral.grade.slowWarning')}
          />
        )}
      </Card>
    );
  }

  // ---- Error state -------------------------------------------------------
  if (status === 'error') {
    const reason = oral.errorMessage || '';
    const ERROR_MAP: Array<[string, string]> = [
      ['NO_RECORDING', 'oral.grade.noRecording'],
      ['PLAN_UPGRADE_REQUIRED', 'oral.grade.planRequired'],
      ['QUOTA_EXCEEDED', 'oral.grade.quotaExceeded'],
      ['STT_BAD_AUDIO', 'oral.grade.errBadAudio'],
      ['STT_EMPTY', 'oral.grade.errSttEmpty'],
      ['STT_NOT_CONFIGURED', 'oral.grade.errSttNotConfigured'],
      ['STT_RATE_LIMITED', 'oral.grade.errRateLimited'],
      ['STT_PROVIDER_DOWN', 'oral.grade.errProviderDown'],
      ['STT_CALL_FAILED', 'oral.grade.errCallFailed'],
      ['AI_ORAL_TOO_SHORT', 'oral.grade.errTooShort'],
      ['AI_NOT_CONFIGURED', 'oral.grade.errNotConfigured'],
      ['AI_OUTPUT_TRUNCATED', 'oral.grade.errTruncated'],
      ['AI_BAD_OUTPUT', 'oral.grade.errBadOutput'],
      ['AI_NO_TOOL_USE', 'oral.grade.errBadOutput'],
      ['AI_PROVIDER_DOWN', 'oral.grade.errProviderDown'],
      ['AI_RATE_LIMITED', 'oral.grade.errRateLimited'],
      ['AI_BAD_REQUEST', 'oral.grade.errBadRequest'],
      ['AI_CALL_FAILED', 'oral.grade.errCallFailed'],
      ['FRONTEND_TIMEOUT', 'oral.grade.errTimeout'],
    ];
    const matched = ERROR_MAP.find(([code]) => reason.startsWith(code));
    const msg = matched
      ? t(matched[1], { min: quota?.thresholds.minWords ?? 80 })
      : reason || t('oral.grade.error');

    const canRetry = quota && quota.allowedModels.length > 0
      && !reason.startsWith('PLAN_UPGRADE_REQUIRED')
      && !reason.startsWith('NO_RECORDING');

    return (
      <Card className="mb-3">
        <Alert
          type="warning"
          showIcon
          message={t('oral.grade.error')}
          description={msg}
          className="mb-3"
        />
        {questionPrompt && <Paragraph className="text-gray-600 text-sm">{questionPrompt}</Paragraph>}
        {oral.transcriptCombined && (
          <Collapse
            ghost
            className="mb-3"
            items={[
              {
                key: 'transcript',
                label: <Text type="secondary">{t('oral.grade.transcriptLabel')}</Text>,
                children: (
                  <pre className="whitespace-pre-wrap text-sm">{oral.transcriptCombined}</pre>
                ),
              },
            ]}
          />
        )}
        {canRetry && (
          <Button
            type="primary"
            loading={regrading}
            onClick={onRegrade}
            icon={<ReloadOutlined />}
          >
            {t('oral.grade.retry')}
          </Button>
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
  const rubric: OralRubricDimension[] = oral.rubric || [];
  const pct = Math.round(((oral.aiScore ?? 0) / totalMax) * 100);

  return (
    <Card className="mb-3">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-2">
        <Title level={4} style={{ marginBottom: 0 }}>
          {t('oral.grade.title')}
        </Title>
        <Space wrap>
          <Tag color="blue">{aiModelDisplayName(t, oral.model)}</Tag>
          {oral.recordingIds?.length > 0 && (
            <Tag icon={<SoundOutlined />}>{oral.recordingIds.length} {t('oral.grade.segments')}</Tag>
          )}
        </Space>
      </div>

      <div className="flex items-center gap-6 flex-wrap mb-4">
        <Progress
          type="circle"
          percent={pct}
          format={() => (
            <div className="text-center">
              <div className="text-2xl font-bold text-brand">{oral.aiScore}</div>
              <div className="text-xs text-gray-500">/ {totalMax}</div>
            </div>
          )}
          size={120}
          strokeColor="#1A3A5C"
        />
        <div className="flex-1 min-w-[220px]">
          <Text type="secondary" className="text-xs block mb-1">
            {t('oral.grade.totalScore')}
          </Text>
          <Paragraph className="mb-0 text-sm">{oral.aiFeedback}</Paragraph>
        </div>
      </div>

      <Divider className="!my-3" />

      <Title level={5}>{t('oral.grade.rubricTitle')}</Title>
      <div className="space-y-2">
        {rubric.map((d) => (
          <div key={d.key}>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{t(`oral.rubric.${d.key}`)}</span>
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

      {(oral.strengths?.length ?? 0) > 0 && (
        <>
          <Divider className="!my-3" />
          <Title level={5}>{t('oral.grade.strengths')}</Title>
          <ul className="list-disc pl-5 text-sm text-gray-700">
            {oral.strengths!.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}

      {(oral.corrections?.length ?? 0) > 0 && (
        <>
          <Divider className="!my-3" />
          <Title level={5}>{t('oral.grade.correctionsTitle')}</Title>
          <div className="space-y-2">
            {oral.corrections!.map((c, i) => (
              <Card key={i} size="small" bordered={false} className="bg-gray-50">
                <div className="flex justify-between flex-wrap gap-2 mb-1">
                  <Text type="secondary" className="italic">"{c.excerpt}"</Text>
                  <Tag>{t(`oral.correctionType.${c.type}`)}</Tag>
                </div>
                <div className="text-sm">
                  <Text strong>{t('oral.grade.issue')}</Text> {c.issue}
                </div>
                <div className="text-sm">
                  <Text strong className="text-green-700">{t('oral.grade.suggestion')}</Text> {c.suggestion}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Transcript (foldable) + recording playback for self-review. */}
      <Divider className="!my-3" />
      <Collapse
        ghost
        items={[
          {
            key: 'transcript',
            label: t('oral.grade.transcriptLabel'),
            children: (
              <>
                <pre className="whitespace-pre-wrap text-sm bg-gray-50 p-3 rounded">
                  {oral.transcriptCombined || ''}
                </pre>
                {(oral.monologueRecordingId || (oral.followUps?.length ?? 0) > 0) && (
                  <Space direction="vertical" style={{ width: '100%' }} className="mt-3">
                    <div>
                      <Text type="secondary" className="text-xs block mb-1">
                        {t('oral.grade.segMonologue')}
                      </Text>
                      {oral.monologueRecordingId ? (
                        <AuthRecordingAudio recordingId={oral.monologueRecordingId} />
                      ) : (
                        <Text type="secondary" className="text-xs italic">
                          {t('oral.grade.segNotRecorded')}
                        </Text>
                      )}
                    </div>
                    {(oral.followUps || []).map((f) => (
                      <div key={f.id}>
                        <Text type="secondary" className="text-xs block mb-1">
                          {t('oral.grade.segFollowUp', { n: f.order + 1 })}
                          <Text type="secondary" className="text-xs ml-2 italic">
                            {f.text}
                          </Text>
                        </Text>
                        {f.recordingId ? (
                          <AuthRecordingAudio recordingId={f.recordingId} />
                        ) : (
                          <Text type="secondary" className="text-xs italic">
                            {t('oral.grade.segNotRecorded')}
                          </Text>
                        )}
                      </div>
                    ))}
                  </Space>
                )}
              </>
            ),
          },
        ]}
      />

      {quota && quota.allowedModels.length > 0 && (
        <>
          <Divider className="!my-3" />
          <Button
            type="default"
            loading={regrading}
            onClick={onRegrade}
            icon={<RightOutlined />}
          >
            {t('oral.grade.regrade')}
          </Button>
        </>
      )}
    </Card>
  );
}

// The recording playback endpoint requires JWT auth in the Authorization
// header — a plain <audio src> can't send that, so we fetch the file via the
// authenticated api client and play it from a Blob URL. Recordings cap at 8MB,
// so loading fully into memory on expand is fine.
function AuthRecordingAudio({ recordingId }: { recordingId: string }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    (async () => {
      try {
        const { data } = await api.get(`/user/recordings/${recordingId}/audio`, {
          responseType: 'blob',
        });
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setErr(true);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [recordingId]);

  if (err) {
    return <Text type="secondary" className="text-xs">{t('oral.grade.playbackError')}</Text>;
  }
  if (!src) {
    return <Text type="secondary" className="text-xs">{t('oral.grade.loadingAudio')}</Text>;
  }
  return <audio controls src={src} style={{ width: '100%' }} />;
}
