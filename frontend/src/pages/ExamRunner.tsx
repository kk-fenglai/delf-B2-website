import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Radio, Checkbox, Input, Button, message, Steps, Tag, Spin, Result,
  Progress, Alert, Modal, Space, Upload,
} from 'antd';
import {
  ClockCircleOutlined, ExclamationCircleFilled, LockOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import AudioPlayer from '../components/AudioPlayer';
import AIModelPicker from '../components/AIModelPicker';
import type { ExamSetDetail, Question, Skill, EssayQuota, ClaudeModelKey } from '../types';

const { Title, Paragraph, Text } = Typography;

type Props = { skill?: Skill; mockMode?: boolean };

// DELF B2 official time allocation per skill (in minutes)
const SKILL_MINUTES: Record<Skill, number> = { CO: 30, CE: 60, PE: 60, PO: 20 };
// Canonical DELF B2 section order.
const SECTION_ORDER: Skill[] = ['CO', 'CE', 'PE', 'PO'];
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

type Section = { skill: Skill; questions: Question[] };

export default function ExamRunner({ skill, mockMode }: Props = {}) {
  const { t, i18n } = useTranslation();
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamSetDetail | null>(null);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [sessionId, setSessionId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [quota, setQuota] = useState<EssayQuota | null>(null);
  const [aiModel, setAiModel] = useState<ClaudeModelKey | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [remaining, setRemaining] = useState<number>(0);
  const [sectionStartedAt, setSectionStartedAt] = useState<number>(0);
  const autoSubmittedRef = useRef(false);
  const warnedRef = useRef(false);
  // Keeps latest submit/advance fns reachable from the countdown interval
  // without closing over stale state.
  const submitRef = useRef<(auto: boolean) => void>(() => {});
  const advanceRef = useRef<() => void>(() => {});
  const isMock = mockMode || !skill;
  const isReadingListMode = !isMock && skill === 'CE';

  // Build the ordered section list. In skill-practice mode there's a single
  // section; in mock mode we group by skill in canonical DELF order so the
  // candidate takes CO → CE → PE → PO regardless of question `order` fields.
  const sections: Section[] = useMemo(() => {
    if (!exam) return [];
    if (!isMock) {
      return [{ skill: skill!, questions: exam.questions }];
    }
    const grouped: Record<Skill, Question[]> = { CO: [], CE: [], PE: [], PO: [] };
    exam.questions.forEach((q) => grouped[q.skill].push(q));
    return SECTION_ORDER.filter((s) => grouped[s].length > 0).map((s) => ({
      skill: s,
      questions: grouped[s],
    }));
  }, [exam, isMock, skill]);

  const currentSection: Section | undefined = sections[sectionIdx];
  const sectionQuestions = currentSection?.questions ?? [];
  const sectionSeconds = currentSection
    ? SKILL_MINUTES[currentSection.skill] * 60
    : 0;
  const isLastSection = sectionIdx >= sections.length - 1;

  const hasEssay = useMemo(
    () => !!exam?.questions.some((q) => q.type === 'ESSAY'),
    [exam]
  );

  // Reading list mode: group questions by passage text and render all at once.
  // Must be declared before any early returns to keep hook order stable.
  const readingGroups = useMemo(() => {
    if (!isReadingListMode || !exam) return [];
    const groups: Array<{ passage: string | null; questions: Question[] }> = [];
    const byPassage = new Map<string, Question[]>();
    for (const qq of exam.questions.filter((x) => x.skill === 'CE')) {
      const key = (qq.passage || '').trim();
      const k = key.length ? key : '__NO_PASSAGE__';
      if (!byPassage.has(k)) byPassage.set(k, []);
      byPassage.get(k)!.push(qq);
    }
    for (const [k, qs] of byPassage.entries()) {
      groups.push({
        passage: k === '__NO_PASSAGE__' ? null : k,
        questions: qs.sort((a, b) => a.order - b.order),
      });
    }
    return groups;
  }, [exam, isReadingListMode]);

  useEffect(() => {
    (async () => {
      try {
        const url = skill ? `/exams/${examId}?skill=${skill}` : `/exams/${examId}`;
        const { data } = await api.get(url);
        setExam(data);
        // Mock mode uses the stricter EXAM mode so later analytics can
        // distinguish simulated full exams from untimed skill drills.
        const mode = isMock ? 'EXAM' : 'PRACTICE';
        const session = await api.post('/sessions', { examSetId: examId, mode });
        setSessionId(session.data.session.id);
        setSectionStartedAt(Date.now());
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examId, skill]);

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

  // Per-section countdown. When time runs out we either auto-advance to the
  // next section (mock mode) or auto-submit (skill practice / final section).
  useEffect(() => {
    if (!sectionStartedAt || !sectionSeconds) return;
    setRemaining(sectionSeconds);
    warnedRef.current = false;
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sectionStartedAt) / 1000);
      const left = sectionSeconds - elapsed;
      setRemaining(left);
      if (left <= 300 && !warnedRef.current && left > 0) {
        warnedRef.current = true;
        message.warning(
          isMock && !isLastSection
            ? t('exam.fiveMinSectionWarning')
            : t('exam.fiveMinWarning'),
          6
        );
      }
      if (left <= 0) {
        clearInterval(timer);
        if (isMock && !isLastSection) {
          message.warning(t('exam.sectionTimeUp'), 4);
          advanceRef.current();
        } else if (!autoSubmittedRef.current) {
          autoSubmittedRef.current = true;
          message.warning(t('exam.timeUp'), 4);
          submitRef.current(true);
        }
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [sectionStartedAt, sectionSeconds, isMock, isLastSection, t]);

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

  if (!exam || !currentSection) return <div>{t('exam.notFound')}</div>;
  if (!currentSection.questions || currentSection.questions.length === 0) {
    return (
      <div className="max-w-4xl mx-auto">
        <Result status="404" title={t('exam.notFound')} />
      </div>
    );
  }

  const q: Question = sectionQuestions[current];
  const total = sectionQuestions.length;
  const answeredInSection = sectionQuestions.filter((qq) => {
    const v = answers[qq.id];
    if (v === undefined || v === null) return false;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
  }).length;
  const progressPct = total > 0 ? Math.round((answeredInSection / total) * 100) : 0;
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
      sessionStorage.setItem(`result-${sessionId}`, JSON.stringify({ result: data, exam, isMock }));
      if (auto) message.info(t('exam.autoSubmitted'), 3);
      navigate(`/review/${sessionId}`);
    } catch (e: any) {
      message.error(e.response?.data?.error || t('exam.submitFail'));
    } finally {
      setSubmitting(false);
    }
  };

  submitRef.current = doSubmit;

  const advanceSection = () => {
    if (isLastSection) return;
    setSectionIdx((i) => i + 1);
    setCurrent(0);
    setSectionStartedAt(Date.now());
    warnedRef.current = false;
  };
  advanceRef.current = advanceSection;

  // Confirmation modal before final submit — shows completion summary and
  // DELF B2 pass criteria so candidates understand the bar they must clear.
  const confirmSubmit = () => {
    const totalAllQuestions = exam.questions.length;
    const answeredAll = exam.questions.filter((qq) => {
      const v = answers[qq.id];
      if (v === undefined || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'string') return v.trim().length > 0;
      return true;
    }).length;
    const unanswered = totalAllQuestions - answeredAll;
    Modal.confirm({
      title: t('exam.confirmTitle'),
      icon: <ExclamationCircleFilled />,
      width: 520,
      content: (
        <div>
          <p>
            {t('exam.confirmAnswered', { done: answeredAll, total: totalAllQuestions })}
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

  // "Finish section" prompt — warns that the candidate cannot return to this
  // section once they advance, mirroring the real DELF B2 exam constraint.
  const confirmAdvanceSection = () => {
    const nextSkill = sections[sectionIdx + 1]?.skill;
    Modal.confirm({
      title: t('exam.advanceTitle'),
      icon: <LockOutlined />,
      width: 520,
      content: (
        <div>
          <p>
            {t('exam.advanceAnswered', { done: answeredInSection, total })}
          </p>
          <Alert
            type="warning"
            showIcon
            className="mt-3"
            message={t('exam.advanceNoReturn')}
            description={
              nextSkill
                ? t('exam.advanceNext', {
                    skill: t(`skill.${nextSkill}`),
                    minutes: SKILL_MINUTES[nextSkill],
                  })
                : undefined
            }
          />
        </div>
      ),
      okText: t('exam.advanceOk'),
      cancelText: t('exam.advanceCancel'),
      onOk: () => advanceSection(),
    });
  };

  const renderAnswerInput = () => {
    const value = answers[q.id];

    if (q.type === 'SINGLE' || q.type === 'TRUE_FALSE') {
      return (
        <Radio.Group value={value} onChange={(e) => updateAnswer(e.target.value)} className="flex flex-col gap-2">
          {q.options.map((o) => (
            <Radio key={o.id} value={o.label} className="p-2 hover:bg-surface rounded">
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
            <Checkbox key={o.id} value={o.label} className="p-2 hover:bg-surface rounded">
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
      const ocrLang = (i18n.language || 'fr').slice(0, 2);
      return (
        <div>
          <div className="flex justify-end mb-2">
            <Upload
              accept="image/png,image/jpeg,image/webp"
              showUploadList={false}
              beforeUpload={(file) => {
                const isOkType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
                if (!isOkType) {
                  message.error('仅支持 PNG/JPG/WEBP 图片');
                  return Upload.LIST_IGNORE;
                }
                const maxMb = 8;
                if (file.size / 1024 / 1024 > maxMb) {
                  message.error(`图片过大（最大 ${maxMb}MB）`);
                  return Upload.LIST_IGNORE;
                }
                return true;
              }}
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  setOcrLoading(true);
                  const form = new FormData();
                  form.append('image', file as Blob);
                  form.append('lang', (['fr', 'en', 'zh'] as const).includes(ocrLang as any) ? ocrLang : 'fr');
                  const { data } = await api.post('/user/essays/ocr', form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  const text = String(data?.text || '').trim();
                  if (!text) {
                    message.warning('未识别到文字，请换更清晰的照片重试');
                  } else {
                    updateAnswer(text);
                    message.success('识别成功，已填入作文框');
                  }
                  onSuccess?.(data, undefined as any);
                } catch (err: any) {
                  message.error(err?.response?.data?.error || 'OCR 识别失败');
                  onError?.(err);
                } finally {
                  setOcrLoading(false);
                }
              }}
            >
              <Button loading={ocrLoading} disabled={submitting} size="small">
                上传照片识别（OCR）
              </Button>
            </Upload>
          </div>
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
            <div className="mt-2 text-xs text-muted">{t('exam.essayAITip')}</div>
          )}
        </div>
      );
    }
    return <div>{t('exam.unsupported')}</div>;
  };

  const renderAnswerInputFor = (qq: Question) => {
    const value = answers[qq.id];
    const update = (val: any) => setAnswers((prev) => ({ ...prev, [qq.id]: val }));

    if (qq.type === 'SINGLE' || qq.type === 'TRUE_FALSE') {
      return (
        <Radio.Group
          value={value}
          onChange={(e) => update(e.target.value)}
          className="flex flex-col gap-2"
        >
          {qq.options.map((o) => (
            <Radio key={o.id} value={o.label} className="p-2 hover:bg-surface rounded">
              <strong>{o.label}.</strong> {o.text}
            </Radio>
          ))}
        </Radio.Group>
      );
    }
    if (qq.type === 'MULTIPLE') {
      return (
        <Checkbox.Group
          value={value || []}
          onChange={(v) => update(v)}
          className="flex flex-col gap-2"
        >
          {qq.options.map((o) => (
            <Checkbox key={o.id} value={o.label} className="p-2 hover:bg-surface rounded">
              <strong>{o.label}.</strong> {o.text}
            </Checkbox>
          ))}
        </Checkbox.Group>
      );
    }
    if (qq.type === 'FILL') {
      return (
        <Input
          value={value || ''}
          onChange={(e) => update(e.target.value)}
          placeholder={t('exam.fillPlaceholder')}
        />
      );
    }
    if (qq.type === 'ESSAY') {
      // In reading list mode, treat ESSAY as short answer (no OCR upload / AI picker).
      return (
        <Input.TextArea
          value={value || ''}
          onChange={(e) => update(e.target.value)}
          rows={4}
          placeholder="请用自己的话作答"
          showCount
        />
      );
    }
    return <div>{t('exam.unsupported')}</div>;
  };

  const isLastQuestionOfSection = current === total - 1;
  const showFinishExamButton = !isMock || (isMock && isLastSection && isLastQuestionOfSection);
  const showAdvanceSectionButton = isMock && !isLastSection && isLastQuestionOfSection;

  if (isReadingListMode && exam) {
    const allReading = exam.questions.filter((x) => x.skill === 'CE');
    if (allReading.length === 0) {
      return (
        <div className="max-w-4xl mx-auto">
          <Result status="404" title={t('exam.notFound')} />
        </div>
      );
    }
    const answered = allReading.filter((qq) => {
      const v = answers[qq.id];
      if (v === undefined || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'string') return v.trim().length > 0;
      return true;
    }).length;
    const unanswered = allReading.length - answered;

    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <Title level={3} className="!mb-0">
            {exam.title}
          </Title>
          <Space>
            <Tag icon={<ClockCircleOutlined />} color="blue" className="text-base px-3 py-1">
              {formatTime(remaining)}
            </Tag>
            <Tag color="blue">{t('skill.CE')}</Tag>
          </Space>
        </div>

        <Alert
          type="info"
          showIcon
          className="mb-3"
          message={t('exam.passCriteriaTitle')}
          description={
            <div>
              <div className="text-xs text-gray-600">
                {t('exam.confirmAnswered', { done: answered, total: allReading.length })}
                {unanswered > 0 && (
                  <Text type="warning"> · {t('exam.confirmUnanswered', { n: unanswered })}</Text>
                )}
              </div>
              <div className="text-xs text-muted mt-1">
                {t('exam.passCriteriaInline', {
                  total: PASS_TOTAL,
                  skillMin: PASS_PER_SKILL,
                  skillMax: SKILL_MAX,
                  duration: SKILL_MINUTES.CE,
                })}
              </div>
            </div>
          }
        />

        {readingGroups.map((g, gi) => (
          <Card key={gi} bordered={false} className="mb-4 app-surface">
            {g.passage && (
              <div
                className="passage p-4 rounded mb-4 whitespace-pre-wrap"
                style={{ background: 'var(--bgElevated)', borderLeft: '4px solid var(--primary)' }}
              >
                {g.passage}
              </div>
            )}
            {g.questions.map((qq, qi) => (
              <div key={qq.id} className={qi > 0 ? 'mt-4 pt-4 border-t' : ''}>
                <Paragraph className="text-base font-semibold mb-3">
                  {qq.order}. {qq.prompt}
                  <Text className="ml-2" type="secondary">({qq.points} {t('exam.points')})</Text>
                </Paragraph>
                {renderAnswerInputFor(qq)}
              </div>
            ))}
          </Card>
        ))}

        <div className="flex justify-end">
          <Button type="primary" loading={submitting} onClick={confirmSubmit}>
            {t('exam.submit')}
          </Button>
        </div>
      </div>
    );
  }

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

      {/* Section stepper (mock mode only) — visualises CO→CE→PE→PO and locks
          completed sections so candidates can't drift back. */}
      {isMock && sections.length > 1 && (
        <Steps
          current={sectionIdx}
          size="small"
          className="mb-4"
          items={sections.map((s, i) => ({
            title: t(`skill.${s.skill}`),
            description: `${SKILL_MINUTES[s.skill]} min`,
            icon: i < sectionIdx ? <LockOutlined /> : undefined,
          }))}
        />
      )}

      {/* Pass-criteria banner — shows target and current section duration */}
      <Alert
        type="info"
        showIcon
        className="mb-3"
        message={
          isMock
            ? t('exam.sectionBanner', {
                skill: t(`skill.${currentSection.skill}`),
                minutes: SKILL_MINUTES[currentSection.skill],
                idx: sectionIdx + 1,
                total: sections.length,
              })
            : t('exam.passCriteriaTitle')
        }
        description={t('exam.passCriteriaInline', {
          total: PASS_TOTAL,
          skillMin: PASS_PER_SKILL,
          skillMax: SKILL_MAX,
          duration: SKILL_MINUTES[currentSection.skill],
        })}
      />

      {/* Progress of answered questions in the current section */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>{t('exam.progressLabel', { done: answeredInSection, total })}</span>
          <span>{progressPct}%</span>
        </div>
        <Progress percent={progressPct} size="small" showInfo={false} />
      </div>

      <Steps
        current={current}
        size="small"
        className="mb-6"
        items={sectionQuestions.map((qq, i) => ({
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

      <Card bordered={false} className="mb-4 app-surface">
        {q.skill === 'CO' && (
          <AudioPlayer
            audioUrl={q.audioUrl}
            transcript={q.passage?.replace(/^\[.*?\]\s*/, '')}
            maxPlays={2}
          />
        )}
        {q.skill !== 'CO' && q.passage && (
          <div
            className="passage p-4 rounded mb-4"
            style={{ background: 'var(--bgElevated)', borderLeft: '4px solid var(--primary)' }}
          >
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
        {!isLastQuestionOfSection ? (
          <Button type="primary" onClick={() => setCurrent(current + 1)}>
            {t('exam.next')}
          </Button>
        ) : showAdvanceSectionButton ? (
          <Button type="primary" onClick={confirmAdvanceSection} icon={<LockOutlined />}>
            {t('exam.advanceSection')}
          </Button>
        ) : showFinishExamButton ? (
          <Button type="primary" loading={submitting} onClick={confirmSubmit}>
            {t('exam.submit')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
