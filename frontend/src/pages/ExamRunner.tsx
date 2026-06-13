import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Radio, Checkbox, Input, Button, message, Steps, Tag, Spin, Result,
  Progress, Alert, Modal, Space, Upload, Grid,
} from 'antd';
import {
  ClockCircleOutlined, ExclamationCircleFilled, LockOutlined, BookOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { useAuthStore } from '../stores/auth';
import CoSectionRunner from '../components/CoSectionRunner';
import CoSectionRunnerMock from '../components/CoSectionRunnerMock';
import TemplateDrawer from '../components/TemplateDrawer';
import { localizeExamTitle } from '../utils/examTitle';
import type { ExamSetDetail, Question, Skill, EssayQuota, ClaudeModelKey } from '../types';

const { Title, Paragraph, Text } = Typography;

type Props = { skill?: Skill; mockMode?: boolean };

// DELF B2 official time allocation per skill (in minutes)
const SKILL_MINUTES: Record<Skill, number> = { CO: 30, CE: 30, PE: 60, PO: 20 };
// In a full mock, Compréhension des écrits + Production écrite are taken as ONE
// 120-min block the candidate allocates freely. PO is taken separately (its own
// session) on the speaking page, so it is not a runner section here.
type SectionSkill = Skill | 'CEPE';
const SECTION_MINUTES: Record<SectionSkill, number> = {
  CO: 30, CE: 30, PE: 60, PO: 20, CEPE: 120,
};
// Canonical DELF B2 section order.
const SECTION_ORDER: Skill[] = ['CO', 'CE', 'PE', 'PO'];

// Group questions by their passage text (PDF line-wrap artifacts trimmed) so a
// reading section can render each passage once with its questions beside it.
function groupByPassage(questions: Question[]) {
  const byPassage = new Map<string, Question[]>();
  for (const qq of questions) {
    const key = (qq.passage || '').trim();
    const k = key.length ? key : '__NO_PASSAGE__';
    if (!byPassage.has(k)) byPassage.set(k, []);
    byPassage.get(k)!.push(qq);
  }
  return [...byPassage.entries()].map(([k, qs]) => ({
    passage: k === '__NO_PASSAGE__' ? null : k,
    questions: qs.sort((a, b) => a.order - b.order),
  }));
}
// DELF B2 passing standards
const PASS_TOTAL = 50;          // /100
const PASS_PER_SKILL = 5;       // /25
const SKILL_MAX = 25;

// Render passage text: single newlines (PDF line-wrap artifacts) become spaces;
// double newlines become paragraph breaks.
function renderPassage(text: string) {
  return text
    .split(/\n{2,}/)
    .map((para) => para.replace(/\n/g, ' ').trim())
    .filter(Boolean)
    .map((para, i) => (
      <p key={i} style={{ marginBottom: '0.75em', lineHeight: 1.8 }}>{para}</p>
    ));
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

type Section = { skill: SectionSkill; questions: Question[] };

export default function ExamRunner({ skill, mockMode }: Props = {}) {
  const { t, i18n } = useTranslation();
  const { examId } = useParams();
  const navigate = useNavigate();
  // Below the `md` breakpoint the passage/questions split-view is unusable on a
  // phone, so we stack it vertically (passage on top, scrollable; questions below).
  const screens = Grid.useBreakpoint();
  const isMobile = !screens.md;
  // Plan-gate the OCR upload affordance — only AI_UNLIMITED users can hit
  // the /essays/ocr endpoint, so hiding the button for everyone else keeps
  // the UI honest (clicking it would just 403).
  const userPlan = useAuthStore((s) => s.user?.plan);
  const canUseOcr = userPlan === 'AI_UNLIMITED';
  const [exam, setExam] = useState<ExamSetDetail | null>(null);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [sessionId, setSessionId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [quota, setQuota] = useState<EssayQuota | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [templateDrawerOpen, setTemplateDrawerOpen] = useState(false);
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
    const result: Section[] = [];
    if (grouped.CO.length) result.push({ skill: 'CO', questions: grouped.CO });
    // CE + PE are taken together as one freely-allocated 120-min block.
    if (grouped.CE.length || grouped.PE.length) {
      result.push({ skill: 'CEPE', questions: [...grouped.CE, ...grouped.PE] });
    }
    // PO is taken on the speaking page as a separate session (3-choose-1), so
    // it is intentionally NOT a section in the written runner.
    return result;
  }, [exam, isMock, skill]);

  const currentSection: Section | undefined = sections[sectionIdx];
  const sectionQuestions = currentSection?.questions ?? [];
  // CO in PRACTICE mode (isMock=false) is untimed — candidates control
  // playback themselves so the section countdown is disabled. In MOCK
  // mode the strict DELF schedule applies, so the full 30 min counts down.
  // sectionSeconds === 0 short-circuits the timer effect below.
  const sectionSeconds = currentSection
    ? currentSection.skill === 'CO' && !isMock
      ? 0
      : SECTION_MINUTES[currentSection.skill] * 60
    : 0;
  const isLastSection = sectionIdx >= sections.length - 1;

  const hasEssay = useMemo(
    () => !!exam?.questions.some((q) => q.type === 'ESSAY'),
    [exam]
  );
  // Whether this set carries a speaking part. In a mock, finishing the written
  // block hands off to the speaking page (separate session) instead of review.
  const hasPO = useMemo(
    () => !!exam?.questions.some((q) => q.type === 'SPEAKING'),
    [exam]
  );
  // Label a section (handles the synthetic CE+PE block).
  const sectionLabel = (s: SectionSkill) =>
    s === 'CEPE' ? t('exam.sectionCEPE', '阅读 + 写作') : t(`skill.${s}`);

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
        const session = await api.post('/sessions', {
          examSetId: examId,
          mode,
          ...(isMock ? {} : skill ? { skill } : {}),
        });
        setSessionId(session.data.session.id);
        setSectionStartedAt(Date.now());
      } catch (e: any) {
        const code = e.response?.data?.code;
        if (code === 'FREE_QUOTA_EXCEEDED') {
          const bucket = e.response?.data?.bucket as 'CE' | 'CO' | 'MOCK' | undefined;
          const cap = e.response?.data?.cap as number | undefined;
          setBlocked(bucket
            ? t(`freeQuota.exceeded.${bucket}`, { cap })
            : t('freeQuota.exceeded.generic'));
        } else if (e.response?.data?.requiresUpgrade) {
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
      // In a mock, the written session covers CO+CE+PE only (→ /75). PO is taken
      // separately on the speaking page, so it must not be part of this payload
      // (otherwise the backend would score it as an unanswered 0).
      const payload = exam.questions
        .filter((qq) => !(isMock && qq.skill === 'PO'))
        .map((qq) => ({
          questionId: qq.id,
          answer: answers[qq.id] ?? (qq.type === 'MULTIPLE' ? [] : ''),
        }));
      const body: Record<string, unknown> = { answers: payload };
      if (hasEssay) {
        const loc = (i18n.language || 'fr').slice(0, 2);
        body.aiLocale = (['fr', 'en', 'zh'] as const).includes(loc as any) ? loc : 'fr';
      }
      const { data } = await api.post(`/sessions/${sessionId}/submit`, body);
      // Mock with a speaking part: go to the written review (so the candidate
      // can see their CO+CE+PE result) where a "start speaking" button lets
      // them continue to the oral exam (its own session) when ready.
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
    // In a mock the written submit covers CO+CE+PE only; PO is taken separately.
    const written = exam.questions.filter((qq) => !(isMock && qq.skill === 'PO'));
    const totalAllQuestions = written.length;
    const answeredAll = written.filter((qq) => {
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
                    skill: sectionLabel(nextSkill),
                    minutes: SECTION_MINUTES[nextSkill],
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

  // Full essay editor (template drawer + optional OCR + AI tip). Used both by
  // the single-question view and by the combined CE+PE block in a mock.
  const renderEssayEditor = (qq: Question) => {
    const value = answers[qq.id];
    const update = (val: any) => setAnswers((prev) => ({ ...prev, [qq.id]: val }));
    const ocrLang = (i18n.language || 'fr').slice(0, 2);
    return (
      <div>
        <div className="flex justify-between items-center mb-2">
          <Button
            size="small"
            icon={<BookOutlined />}
            onClick={() => setTemplateDrawerOpen(true)}
          >
            {t('template.drawerTitle')}
          </Button>
          {canUseOcr && (
            <Upload
              accept="image/png,image/jpeg,image/webp"
              showUploadList={false}
              beforeUpload={(file) => {
                const isOkType = ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
                if (!isOkType) {
                  message.error(t('exam.ocr.unsupportedType'));
                  return Upload.LIST_IGNORE;
                }
                const maxMb = 8;
                if (file.size / 1024 / 1024 > maxMb) {
                  message.error(t('exam.ocr.tooLarge', { maxMb }));
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
                    message.warning(t('exam.ocr.noText'));
                  } else {
                    update(text);
                    message.success(t('exam.ocr.success'));
                  }
                  onSuccess?.(data, undefined as any);
                } catch (err: any) {
                  message.error(err?.response?.data?.error || t('exam.ocr.fail'));
                  onError?.(err);
                } finally {
                  setOcrLoading(false);
                }
              }}
            >
              <Button loading={ocrLoading} disabled={submitting} size="small">
                {t('exam.ocr.uploadBtn')}
              </Button>
            </Upload>
          )}
        </div>
        <Input.TextArea
          value={value || ''}
          onChange={(e) => update(e.target.value)}
          rows={12}
          placeholder={t('exam.essayPlaceholder')}
          showCount
        />
        <TemplateDrawer
          open={templateDrawerOpen}
          onClose={() => setTemplateDrawerOpen(false)}
          onInsert={(content) => update((value || '') + content)}
        />
        {quota && quota.allowedModels.length > 0 && (
          <div className="mt-2 text-xs text-muted">{t('exam.essayAITip')}</div>
        )}
      </div>
    );
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
    if (q.type === 'TRUE_FALSE_JUSTIFY') {
      let parsed: { choice?: string; justification?: string } = {};
      try { parsed = JSON.parse(value || '{}'); } catch { /* ignore */ }
      const updateTFJ = (patch: { choice?: string; justification?: string }) => {
        updateAnswer(JSON.stringify({ ...parsed, ...patch }));
      };
      return (
        <div className="flex flex-col gap-3">
          <Radio.Group
            value={parsed.choice}
            onChange={(e) => updateTFJ({ choice: e.target.value })}
            className="flex gap-4"
          >
            {q.options.map((o) => (
              <Radio key={o.id} value={o.label} className="p-2 hover:bg-surface rounded">
                <strong>{o.label}.</strong> {o.text}
              </Radio>
            ))}
          </Radio.Group>
          <div>
            <div className="text-sm text-gray-500 mb-1">Justification — recopiez la phrase du texte :</div>
            <Input.TextArea
              value={parsed.justification || ''}
              onChange={(e) => updateTFJ({ justification: e.target.value })}
              rows={3}
              placeholder="Recopiez ici la phrase ou la partie du texte qui justifie votre réponse."
            />
          </div>
        </div>
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
      return renderEssayEditor(q);
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
          className="flex flex-col gap-2 w-full"
        >
          {qq.options.map((o) => (
            <Radio
              key={o.id}
              value={o.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: 8,
                border: `1.5px solid ${value === o.label ? '#2563eb' : '#e5e7eb'}`,
                background: '#ffffff',
                fontWeight: value === o.label ? 600 : 400,
                width: '100%',
                marginRight: 0,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <strong style={{ minWidth: 20 }}>{o.label}.</strong>&nbsp;{o.text}
            </Radio>
          ))}
        </Radio.Group>
      );
    }
    if (qq.type === 'TRUE_FALSE_JUSTIFY') {
      let parsed: { choice?: string; justification?: string } = {};
      try { parsed = JSON.parse(value || '{}'); } catch { /* ignore */ }
      const updateTFJ = (patch: { choice?: string; justification?: string }) =>
        update(JSON.stringify({ ...parsed, ...patch }));
      return (
        <div className="flex flex-col gap-3">
          <Radio.Group
            value={parsed.choice}
            onChange={(e) => updateTFJ({ choice: e.target.value })}
            className="flex gap-3"
          >
            {qq.options.map((o) => (
              <Radio
                key={o.id}
                value={o.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: `1.5px solid ${parsed.choice === o.label ? '#2563eb' : '#e5e7eb'}`,
                  background: '#ffffff',
                  fontWeight: parsed.choice === o.label ? 600 : 400,
                  marginRight: 0,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <strong style={{ minWidth: 20 }}>{o.label}.</strong>&nbsp;{o.text}
              </Radio>
            ))}
          </Radio.Group>
          <div>
            <div className="text-sm text-gray-500 mb-1">Justification — recopiez la phrase du texte :</div>
            <Input.TextArea
              value={parsed.justification || ''}
              onChange={(e) => updateTFJ({ justification: e.target.value })}
              rows={3}
              placeholder="Recopiez ici la phrase ou la partie du texte qui justifie votre réponse."
            />
          </div>
        </div>
      );
    }
    if (qq.type === 'MULTIPLE') {
      const selected: string[] = value || [];
      return (
        <Checkbox.Group
          value={selected}
          onChange={(v) => update(v)}
          className="flex flex-col gap-2 w-full"
        >
          {qq.options.map((o) => (
            <Checkbox
              key={o.id}
              value={o.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: 8,
                border: `1.5px solid ${selected.includes(o.label) ? '#2563eb' : '#e5e7eb'}`,
                background: '#ffffff',
                fontWeight: selected.includes(o.label) ? 600 : 400,
                width: '100%',
                marginRight: 0,
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <strong style={{ minWidth: 20 }}>{o.label}.</strong>&nbsp;{o.text}
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
          placeholder={t('exam.shortAnswerPlaceholder', '请用自己的话作答')}
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
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <Title level={3} className="!mb-0">
            {localizeExamTitle(exam.title, t)}
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
          <Card key={gi} bordered={false} className="mb-6 app-surface">
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 28, alignItems: isMobile ? 'stretch' : 'flex-start' }}>
              {g.passage && (
                <div
                  className="passage p-4 rounded"
                  style={{
                    flex: isMobile ? '0 0 auto' : '0 0 52%',
                    background: 'var(--bgElevated)',
                    borderLeft: '4px solid var(--primary)',
                    position: isMobile ? 'static' : 'sticky',
                    top: 80,
                    maxHeight: isMobile ? '45vh' : 'calc(100vh - 140px)',
                    overflowY: 'auto',
                  }}
                >
                  {renderPassage(g.passage)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {g.questions.map((qq, qi) => (
                  <div key={qq.id} className={qi > 0 ? 'mt-5 pt-5 border-t' : ''}>
                    <Paragraph className="text-base font-semibold mb-3">
                      {qq.order}. {qq.prompt}
                      <Text className="ml-2" type="secondary">({qq.points} {t('exam.points')})</Text>
                    </Paragraph>
                    {renderAnswerInputFor(qq)}
                  </div>
                ))}
              </div>
            </div>
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

  // Combined CE + PE block (mock only): the 3 reading passages and the essay on
  // one page, sharing a single 120-min countdown the candidate allocates
  // freely. On submit, the written session (/75) is saved and the flow hands
  // off to the speaking page.
  if (isMock && currentSection.skill === 'CEPE') {
    const ceQs = sectionQuestions.filter((x) => x.skill === 'CE');
    const peQs = sectionQuestions.filter((x) => x.skill === 'PE');
    const groups = groupByPassage(ceQs);
    // One reading text per page; the essay is the final page. A single shared
    // 120-min countdown; the candidate moves freely (prev / next / jump).
    const pages: Array<
      | { kind: 'reading'; group: (typeof groups)[number]; label: string }
      | { kind: 'writing'; label: string }
    > = [
      ...groups.map((g, i) => ({ kind: 'reading' as const, group: g, label: `${t('skill.CE')} ${i + 1}` })),
      ...(peQs.length ? [{ kind: 'writing' as const, label: t('skill.PE') }] : []),
    ];
    const pageIdx = Math.min(Math.max(current, 0), pages.length - 1);
    const page = pages[pageIdx];
    const isLastPage = pageIdx >= pages.length - 1;
    return (
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
          <Title level={3} className="!mb-0">
            {localizeExamTitle(exam.title, t)}
            <Tag color="purple" className="ml-2">{t('exam.mockBadge')}</Tag>
          </Title>
          <Space>
            <Tag
              icon={<ClockCircleOutlined />}
              color={timerDanger ? 'red' : timerWarning ? 'orange' : 'blue'}
              className="text-base px-3 py-1"
            >
              {formatTime(remaining)}
            </Tag>
            <Tag color="blue">{sectionLabel('CEPE')}</Tag>
          </Space>
        </div>

        <Alert
          type="info"
          showIcon
          className="mb-4"
          message={t('exam.cepeBannerTitle', '阅读 + 写作 · 共 120 分钟，时间自由分配')}
          description={t(
            'exam.cepeBannerDesc',
            '本部分含 3 篇阅读和 1 篇写作，时间由你自行分配。提交后进入口语部分。',
          )}
        />

        {/* Page stepper — each reading text + the essay; click to jump. */}
        <Steps
          current={pageIdx}
          size="small"
          className="mb-4"
          onChange={(i) => setCurrent(i)}
          items={pages.map((p) => ({ title: p.label }))}
        />

        {page.kind === 'reading' ? (
          <Card bordered={false} className="mb-4 app-surface">
            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 16 : 28, alignItems: isMobile ? 'stretch' : 'flex-start' }}>
              {page.group.passage && (
                <div
                  className="passage p-4 rounded"
                  style={{
                    flex: isMobile ? '0 0 auto' : '0 0 52%',
                    background: 'var(--bgElevated)',
                    borderLeft: '4px solid var(--primary)',
                    position: isMobile ? 'static' : 'sticky',
                    top: 80,
                    maxHeight: isMobile ? '45vh' : 'calc(100vh - 160px)',
                    overflowY: 'auto',
                  }}
                >
                  {renderPassage(page.group.passage)}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {page.group.questions.map((qq, qi) => (
                  <div key={qq.id} className={qi > 0 ? 'mt-5 pt-5 border-t' : ''}>
                    <Paragraph className="text-base font-semibold mb-3">
                      {qq.order}. {qq.prompt}
                      <Text className="ml-2" type="secondary">({qq.points} {t('exam.points')})</Text>
                    </Paragraph>
                    {renderAnswerInputFor(qq)}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        ) : (
          peQs.map((pe) => (
            <Card key={pe.id} bordered={false} className="mb-4 app-surface">
              {pe.passage && (
                <div
                  className="passage p-4 rounded mb-4"
                  style={{ background: 'var(--bgElevated)', borderLeft: '4px solid var(--primary)' }}
                >
                  {renderPassage(pe.passage)}
                </div>
              )}
              <Paragraph className="text-base font-semibold mb-4">{pe.prompt}</Paragraph>
              {renderEssayEditor(pe)}
            </Card>
          ))
        )}

        <div className="flex justify-between">
          <Button disabled={pageIdx === 0} onClick={() => setCurrent(pageIdx - 1)}>
            {t('exam.prev')}
          </Button>
          {!isLastPage ? (
            <Button type="primary" onClick={() => setCurrent(pageIdx + 1)}>
              {t('exam.next')}
            </Button>
          ) : (
            <Button type="primary" loading={submitting} onClick={confirmSubmit}>
              {hasPO ? t('exam.submitWritten', '提交笔试') : t('exam.submit')}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header — title + live countdown */}
      <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
        <Title level={3} className="!mb-0">
          {localizeExamTitle(exam.title, t)}
          {isMock && <Tag color="purple" className="ml-2">{t('exam.mockBadge')}</Tag>}
        </Title>
        <Space>
          {sectionSeconds > 0 ? (
            <Tag
              icon={<ClockCircleOutlined />}
              color={timerDanger ? 'red' : timerWarning ? 'orange' : 'blue'}
              className="text-base px-3 py-1"
            >
              {formatTime(remaining)}
            </Tag>
          ) : (
            // CO practice mode — no countdown, just a static "no limit" tag.
            // Mock CO still uses the countdown branch above.
            <Tag icon={<ClockCircleOutlined />} color="green" className="text-base px-3 py-1">
              {t('exam.coNoTimeLimit')}
            </Tag>
          )}
          <Tag color="blue">{t(`skill.${q.skill}`)} · {q.points} {t('exam.points')}</Tag>
        </Space>
      </div>

      {/* Section stepper (mock mode only) — visualises CO→CE→PE→PO and locks
          completed sections so candidates can't drift back. In mock mode CO
          uses the official 30 min; only the practice-mode runner (which can't
          reach this stepper anyway) would show "no time limit". */}
      {isMock && sections.length > 1 && (
        <Steps
          current={sectionIdx}
          size="small"
          className="mb-4"
          items={sections.map((s, i) => ({
            title: sectionLabel(s.skill),
            description: `${SECTION_MINUTES[s.skill]} min`,
            icon: i < sectionIdx ? <LockOutlined /> : undefined,
          }))}
        />
      )}

      {/* Pass-criteria banner — shows target and current section duration.
          CO in practice mode (only) advertises "no time limit"; mock CO keeps
          the official duration. */}
      <Alert
        type="info"
        showIcon
        className="mb-3"
        message={
          isMock
            ? t('exam.sectionBanner', {
                skill: sectionLabel(currentSection.skill),
                minutes: SECTION_MINUTES[currentSection.skill],
                idx: sectionIdx + 1,
                total: sections.length,
              })
            : t('exam.passCriteriaTitle')
        }
        description={
          currentSection.skill === 'CO' && !isMock
            ? t('exam.passCriteriaInlineNoTime', {
                total: PASS_TOTAL,
                skillMin: PASS_PER_SKILL,
                skillMax: SKILL_MAX,
              })
            : t('exam.passCriteriaInline', {
                total: PASS_TOTAL,
                skillMin: PASS_PER_SKILL,
                skillMax: SKILL_MAX,
                duration: SECTION_MINUTES[currentSection.skill],
              })
        }
      />

      {/* Progress of answered questions in the current section */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-muted mb-1">
          <span>{t('exam.progressLabel', { done: answeredInSection, total })}</span>
          <span>{progressPct}%</span>
        </div>
        <Progress percent={progressPct} size="small" showInfo={false} />
      </div>

      {currentSection.skill === 'CO' ? (
        // Listening: pick the runner based on mode.
        //   - Mock exam (isMock=true) → strict DELF timeline (auto-play,
        //     limited plays, prep/gap/answer phases, no pause/replay).
        //   - Practice (isMock=false) → free playback (pause / resume /
        //     replay / seek), untimed, manual "next document" button.
        isMock ? (
          <CoSectionRunnerMock
            documents={exam.audioDocuments || []}
            questions={sectionQuestions}
            renderAnswer={(qq, locked) => (
              <div style={locked ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>
                {renderAnswerInputFor(qq)}
              </div>
            )}
            onComplete={() => {
              if (!isLastSection) advanceSection();
              else if (!autoSubmittedRef.current) {
                autoSubmittedRef.current = true;
                doSubmit(true);
              }
            }}
          />
        ) : (
          <CoSectionRunner
            documents={exam.audioDocuments || []}
            questions={sectionQuestions}
            renderAnswer={(qq, locked) => (
              <div style={locked ? { pointerEvents: 'none', opacity: 0.5 } : undefined}>
                {renderAnswerInputFor(qq)}
              </div>
            )}
            onComplete={() => {
              if (!autoSubmittedRef.current) {
                autoSubmittedRef.current = true;
                doSubmit(true);
              }
            }}
          />
        )
      ) : (
        <>
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
            {q.passage && (
              <div
                className="passage p-4 rounded mb-4"
                style={{ background: 'var(--bgElevated)', borderLeft: '4px solid var(--primary)' }}
              >
                {renderPassage(q.passage)}
              </div>
            )}
            <Paragraph className="text-base font-semibold mb-4">
              {current + 1}. {q.prompt}
            </Paragraph>
            {renderAnswerInput()}
          </Card>
        </>
      )}

      <div className="flex justify-between">
        {currentSection.skill !== 'CO' && (
          <Button disabled={current === 0} onClick={() => setCurrent(current - 1)}>
            {t('exam.prev')}
          </Button>
        )}
        {currentSection.skill === 'CO' ? null : !isLastQuestionOfSection ? (
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
