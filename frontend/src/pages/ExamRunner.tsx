import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Radio, Checkbox, Input, Button, message, Steps, Tag, Spin, Result,
  Progress, Alert, Modal, Space,
} from 'antd';
import { ClockCircleOutlined, ExclamationCircleFilled } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import AudioPlayer from '../components/AudioPlayer';
import AIModelPicker from '../components/AIModelPicker';
import type { ExamSetDetail, Question, Skill, EssayQuota, ClaudeModelKey } from '../types';

const { Title, Paragraph, Text } = Typography;

type Props = { skill?: Skill; mockMode?: boolean };

// Full mock exam = no single skill filter. We auto-infer so callers
// that omit `mockMode` (e.g. legacy /practice/:examId routes) still
// get the full timer + mock badge.

// DELF B2 official time allocation per skill (in minutes)
const SKILL_MINUTES: Record<Skill, number> = { CO: 30, CE: 60, PE: 60, PO: 20 };
// DELF B2 passing standards
const PASS_TOTAL = 50;          // /100
const PASS_PER_SKILL = 5;       // /25
const SKILL_MAX = 25;

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

export default function ExamRunner({ skill, mockMode }: Props = {}) {
  const { t, i18n } = useTranslation();
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamSetDetail | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [sessionId, setSessionId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [quota, setQuota] = useState<EssayQuota | null>(null);
  const [aiModel, setAiModel] = useState<ClaudeModelKey | null>(null);
  const [remaining, setRemaining] = useState<number>(0);
  const [started, setStarted] = useState<number>(0);
  const autoSubmittedRef = useRef(false);
  const warnedRef = useRef(false);
  // Holds the latest submit function so the countdown interval always
  // sees fresh state (answers, sessionId) instead of closing over stale values.
  const submitRef = useRef<(auto: boolean) => void>(() => {});
  const isMock = mockMode || !skill;

  const hasEssay = useMemo(
    () => !!exam?.questions.some((q) => q.type === 'ESSAY'),
    [exam]
  );

  // Total exam time, computed from the skills actually present in the exam.
  // Single-skill practice → that skill's official time.
  // Mock mode → sum of all section times (matches DELF B2 exam length).
  const totalSeconds = useMemo(() => {
    if (!exam) return 0;
    if (skill) return SKILL_MINUTES[skill] * 60;
    const skillsInExam = new Set<Skill>(exam.questions.map((q) => q.skill));
    return Array.from(skillsInExam).reduce((acc, s) => acc + SKILL_MINUTES[s] * 60, 0);
  }, [exam, skill]);

  useEffect(() => {
    (async () => {
      try {
        const url = skill ? `/exams/${examId}?skill=${skill}` : `/exams/${examId}`;
        const { data } = await api.get(url);
        setExam(data);
        const session = await api.post('/sessions', { examSetId: examId, mode: 'PRACTICE' });
        setSessionId(session.data.session.id);
        setStarted(Date.now());
      } catch (e: any) {
        if (e.response?.data?.requiresUpgrade) {
          setBlocked(e.response.data.error);
        } else {
          message.error(t('exam.loadFail'));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [examId, skill, t]);

  useEffect(() => {
    if (!hasEssay) return;
    let cancelled = false;
    api.get('/user/essays/quota')
      .then((r) => {
        if (cancelled) return;
        setQuota(r.data);
        if (r.data?.defaultModel) setAiModel(r.data.defaultModel);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [hasEssay]);

  // Countdown timer — ticks every second, triggers auto-submit at 0.
  useEffect(() => {
    if (!started || !totalSeconds) return;
    setRemaining(totalSeconds);
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      const left = totalSeconds - elapsed;
      setRemaining(left);
      if (left <= 300 && !warnedRef.current && left > 0) {
        warnedRef.current = true;
        message.warning(t('exam.fiveMinWarning'), 6);
      }
      if (left <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        clearInterval(timer);
        message.warning(t('exam.timeUp'), 4);
        submitRef.current(true);
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, totalSeconds]);

  // Prevent accidental page close during an active exam.
  useEffect(() => {
    if (!sessionId || submitting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [sessionId, submitting]);

  if (loading) return <div className="flex justify-center pt-20"><Spin size="large" /></div>;

  if (blocked) {
    return (
      <Result
        status="403"
        title={t('exam.blockedTitle')}
        subTitle={blocked}
        extra={<Button type="primary" onClick={() => navigate('/pricing')}>{t('exam.blockedCta')}</Button>}
      />
    );
  }

  if (!exam) return <div>{t('exam.notFound')}</div>;

  const q: Question = exam.questions[current];
  const total = exam.questions.length;
  const answeredCount = exam.questions.filter((qq) => {
    const v = answers[qq.id];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
  }).length;
  const progressPct = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
  const timerDanger = remaining > 0 && remaining <= 300;
  const timerWarning = remaining > 300 && remaining <= 600;

  const updateAnswer = (val: any) => setAnswers({ ...answers, [q.id]: val });

  const doSubmit = async (auto = false) => {
    if (!sessionId || !exam) return;
    setSubmitting(true);
    try {
      const payload = exam.questions.map((qq) => ({
        questionId: qq.id,
        answer: answers[qq.id] ?? (qq.type === 'MULTIPLE' ? [] : ''),
      }));
      const body: Record<string, unknown> = { answers: payload };
      if (hasEssay) {
        const loc = (i18n.language || 'fr').slice(0, 2);
        body.aiLocale = (['fr', 'en', 'zh'] as const).includes(loc as any) ? loc : 'fr';
        if (aiModel) body.aiModel = aiModel;
      }
      const { data } = await api.post(`/sessions/${sessionId}/submit`, body);
      sessionStorage.setItem(`result-${sessionId}`, JSON.stringify({ result: data, exam }));
      if (auto) message.info(t('exam.autoSubmitted'), 3);
      navigate(`/review/${sessionId}`);
    } catch (e: any) {
      message.error(e.response?.data?.error || t('exam.submitFail'));
    } finally {
      setSubmitting(false);
    }
  };

  // Keep the ref pointing at the latest doSubmit so the timer's auto-submit
  // callback always sees current state rather than the render it captured.
  submitRef.current = doSubmit;

  // Confirmation modal before final submit — shows completion summary and
  // DELF B2 pass criteria so candidates understand the bar they must clear.
  const confirmSubmit = () => {
    const unanswered = total - answeredCount;
    Modal.confirm({
      title: t('exam.confirmTitle'),
      icon: <ExclamationCircleFilled />,
      width: 520,
      content: (
        <div>
          <p>
            {t('exam.confirmAnswered', { done: answeredCount, total })}
            {unanswered > 0 && (
              <Text type="warning"> · {t('exam.confirmUnanswered', { n: unanswered })}</Text>
            )}
          </p>
          <Alert
            type="info"
            showIcon
            className="mt-3"
            message={t('exam.passCriteriaTitle')}
            description={
              <ul className="mb-0 pl-4 text-xs">
                <li>{t('exam.passTotal', { min: PASS_TOTAL })}</li>
                <li>{t('exam.passPerSkill', { min: PASS_PER_SKILL, max: SKILL_MAX })}</li>
              </ul>
            }
          />
        </div>
      ),
      okText: t('exam.confirmOk'),
      cancelText: t('exam.confirmCancel'),
      onOk: () => doSubmit(false),
    });
  };

  const renderAnswerInput = () => {
    const value = answers[q.id];

    if (q.type === 'SINGLE' || q.type === 'TRUE_FALSE') {
      return (
        <Radio.Group value={value} onChange={(e) => updateAnswer(e.target.value)} className="flex flex-col gap-2">
          {q.options.map((o) => (
            <Radio key={o.id} value={o.label} className="p-2 hover:bg-gray-50 rounded">
              <strong>{o.label}.</strong> {o.text}
            </Radio>
          ))}
        </Radio.Group>
      );
    }
    if (q.type === 'MULTIPLE') {
      return (
        <Checkbox.Group value={value || []} onChange={(v) => updateAnswer(v)} className="flex flex-col gap-2">
          {q.options.map((o) => (
            <Checkbox key={o.id} value={o.label} className="p-2 hover:bg-gray-50 rounded">
              <strong>{o.label}.</strong> {o.text}
            </Checkbox>
          ))}
        </Checkbox.Group>
      );
    }
    if (q.type === 'FILL') {
      return (
        <Input value={value || ''} onChange={(e) => updateAnswer(e.target.value)} placeholder={t('exam.fillPlaceholder')} />
      );
    }
    if (q.type === 'ESSAY') {
      return (
        <div>
          <Input.TextArea
            value={value || ''}
            onChange={(e) => updateAnswer(e.target.value)}
            rows={12}
            placeholder={t('exam.essayPlaceholder')}
            showCount
          />
          {quota && quota.allowedModels.length > 0 ? (
            <AIModelPicker
              allowedModels={quota.allowedModels}
              models={quota.models}
              defaultModel={quota.defaultModel}
              value={aiModel}
              onChange={setAiModel}
            />
          ) : (
            <div className="mt-2 text-xs text-gray-500">{t('exam.essayAITip')}</div>
          )}
        </div>
      );
    }
    return <div>{t('exam.unsupported')}</div>;
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header — title + live countdown */}
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <Title level={3} className="!mb-0">
          {exam.title}
          {isMock && <Tag color="purple" className="ml-2">{t('exam.mockBadge')}</Tag>}
        </Title>
        <Space>
          <Tag
            icon={<ClockCircleOutlined />}
            color={timerDanger ? 'red' : timerWarning ? 'orange' : 'blue'}
            className="text-base px-3 py-1"
          >
            {formatTime(remaining)}
          </Tag>
          <Tag color="blue">{t(`skill.${q.skill}`)} · {q.points} {t('exam.points')}</Tag>
        </Space>
      </div>

      {/* Pass-criteria banner — lets candidates see the target from the start */}
      <Alert
        type="info"
        showIcon
        className="mb-3"
        message={t('exam.passCriteriaTitle')}
        description={t('exam.passCriteriaInline', {
          total: PASS_TOTAL,
          skillMin: PASS_PER_SKILL,
          skillMax: SKILL_MAX,
          duration: Math.round(totalSeconds / 60),
        })}
      />

      {/* Progress of answered questions */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{t('exam.progressLabel', { done: answeredCount, total })}</span>
          <span>{progressPct}%</span>
        </div>
        <Progress percent={progressPct} size="small" showInfo={false} />
      </div>

      <Steps
        current={current}
        size="small"
        className="mb-6"
        items={exam.questions.map((qq, i) => ({
          title: t('exam.questionN', { n: i + 1 }),
          description: t(`skill.${qq.skill}`),
          status:
            answers[qq.id] !== undefined && answers[qq.id] !== '' &&
            !(Array.isArray(answers[qq.id]) && answers[qq.id].length === 0)
              ? 'finish'
              : i === current
              ? 'process'
              : 'wait',
        }))}
      />

      <Card className="mb-4">
        {q.skill === 'CO' && (
          <AudioPlayer
            audioUrl={q.audioUrl}
            transcript={q.passage?.replace(/^\[.*?\]\s*/, '')}
            maxPlays={2}
          />
        )}
        {q.skill !== 'CO' && q.passage && (
          <div className="passage bg-gray-50 p-4 rounded mb-4 border-l-4 border-brand">
            {q.passage}
          </div>
        )}
        <Paragraph className="text-base font-semibold mb-4">
          {current + 1}. {q.prompt}
        </Paragraph>
        {renderAnswerInput()}
      </Card>

      <div className="flex justify-between">
        <Button disabled={current === 0} onClick={() => setCurrent(current - 1)}>
          {t('exam.prev')}
        </Button>
        {current < total - 1 ? (
          <Button type="primary" onClick={() => setCurrent(current + 1)}>
            {t('exam.next')}
          </Button>
        ) : (
          <Button type="primary" loading={submitting} onClick={confirmSubmit}>
            {t('exam.submit')}
          </Button>
        )}
      </div>
    </div>
  );
}
