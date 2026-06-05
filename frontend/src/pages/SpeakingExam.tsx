import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Alert, Breadcrumb, Button, Card, Col, Input, Modal, Result, Row, Space, Spin, Steps, Tag, Typography, message,
} from 'antd';
import {
  ClockCircleOutlined, AudioOutlined, MessageOutlined, SendOutlined, LockOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import AudioRecorder, { type RecordingResult } from '../components/AudioRecorder';
import type {
  ExamSetDetail,
  Question,
  OralFollowUp,
  OralQuota,
  UploadedRecording,
} from '../types';

const { Title, Paragraph, Text } = Typography;

// Local-storage key for the per-session prep notes auto-save.
const noteKey = (examId: string) => `oral-prep-notes:${examId}`;

type Phase = 'preparation' | 'monologue' | 'interaction' | 'submitting' | 'submitted';

type Uploaded = {
  // Map: followUpId | 'monologue' → uploaded recording id.
  monologue: string | null;
  followUps: Record<string, string>;
};

export default function SpeakingExam() {
  const { t, i18n } = useTranslation();
  const { examId } = useParams();
  const navigate = useNavigate();

  const [exam, setExam] = useState<ExamSetDetail | null>(null);
  const [quota, setQuota] = useState<OralQuota | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('preparation');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [prepRemaining, setPrepRemaining] = useState<number>(0);
  const [skipPrepOpen, setSkipPrepOpen] = useState(false);
  const [followUpIdx, setFollowUpIdx] = useState(0);
  const [uploaded, setUploaded] = useState<Uploaded>({ monologue: null, followUps: {} });
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Bumped whenever submit() bounces the user back to fill a missing recording.
  // Mixed into the AudioRecorder `key` so the recorder remounts into idle —
  // otherwise it stays stuck in 'recorded' state from the previous take.
  const [recoveryNonce, setRecoveryNonce] = useState(0);

  const questionRef = useRef<Question | null>(null);
  // Mirror of `uploaded` that updates synchronously alongside setState. Needed
  // because submit() runs right after the final upload's setUploaded — React
  // hasn't re-rendered yet, so reading the state variable would miss the last
  // recording and ship a partial submission. The ref is the source of truth.
  const uploadedRef = useRef<Uploaded>({ monologue: null, followUps: {} });

  // ------------------------------------------------------------------
  // Initial load: pull the exam, pick the first SPEAKING question, fetch
  // the oral quota (so we can show plan-blocked state without submitting).
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!examId) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      api.get(`/exams/${examId}`, { params: { skill: 'PO' } }),
      api.get('/user/orals/quota'),
    ])
      .then(([examRes, quotaRes]) => {
        if (cancelled) return;
        const e: ExamSetDetail = examRes.data;
        setExam(e);
        const q = e.questions.find((x) => x.type === 'SPEAKING') || null;
        questionRef.current = q;
        const quotaData = quotaRes.data as OralQuota;
        setQuota(quotaData);
        if (quotaData.monthlyCap === 0) {
          setBlocked('PLAN_UPGRADE_REQUIRED');
        } else if (quotaData.used >= quotaData.monthlyCap) {
          setBlocked('QUOTA_EXCEEDED');
        }
        // Restore notes from a previous tab/session.
        try {
          const saved = localStorage.getItem(noteKey(examId));
          if (saved) setNotes(saved);
        } catch { /* ignore quota errors */ }
        setPrepRemaining(quotaData.thresholds.prepDefaultSec);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err?.response?.status === 403 && err.response.data?.requiresUpgrade) {
          setBlocked('PLAN_UPGRADE_REQUIRED');
        } else {
          setBlocked('LOAD_FAIL');
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [examId]);

  // ------------------------------------------------------------------
  // Persist notes to localStorage. Skipped during phase transitions to
  // avoid spamming writes on every keystroke.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!examId) return;
    if (phase !== 'preparation') return;
    const id = window.setTimeout(() => {
      try { localStorage.setItem(noteKey(examId), notes); } catch { /* ignore */ }
    }, 500);
    return () => window.clearTimeout(id);
  }, [examId, notes, phase]);

  // ------------------------------------------------------------------
  // Prep countdown. Decrements every second; 0 doesn't auto-advance —
  // student still clicks "Start monologue" so they're not surprised.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (phase !== 'preparation') return;
    if (prepRemaining <= 0) return;
    const id = window.setInterval(() => {
      setPrepRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, prepRemaining]);

  // ------------------------------------------------------------------
  // Lazy session creation: only when the student finishes prep do we
  // mint an ExamSession. This keeps "abandoned" sessions out of stats.
  // ------------------------------------------------------------------
  async function ensureSession(): Promise<string> {
    if (sessionId) return sessionId;
    const isExam = new URLSearchParams(window.location.search).get('mode') === 'exam';
    const { data } = await api.post('/sessions', {
      examSetId: examId,
      mode: isExam ? 'EXAM' : 'PRACTICE',
      ...(isExam ? {} : { skill: 'PO' }),
    });
    setSessionId(data.session.id);
    return data.session.id;
  }

  async function uploadRecording(
    rec: RecordingResult,
    followUpId: string | null
  ): Promise<UploadedRecording | null> {
    const q = questionRef.current;
    if (!q) return null;
    const sid = await ensureSession();

    const fd = new FormData();
    // Use a stable filename — the server overrides it but Safari refuses
    // to upload a Blob with no name.
    const ext = rec.mimeType.includes('mp4') ? 'm4a' : 'webm';
    fd.append('audio', rec.blob, `oral-${followUpId || 'monologue'}.${ext}`);
    fd.append('questionId', q.id);
    fd.append('sessionId', sid);
    if (followUpId) fd.append('followUpId', followUpId);
    fd.append('durationSec', String(rec.durationSec));

    setUploadingFor(followUpId || 'monologue');
    setSubmitError(null);
    try {
      const { data } = await api.post('/user/recordings', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60_000,
      });
      const uploadedRec = data.recording as UploadedRecording;
      const next: Uploaded = followUpId
        ? {
          ...uploadedRef.current,
          followUps: { ...uploadedRef.current.followUps, [followUpId]: uploadedRec.id },
        }
        : { ...uploadedRef.current, monologue: uploadedRec.id };
      uploadedRef.current = next;
      setUploaded(next);
      return uploadedRec;
    } catch (err: any) {
      message.error(err?.response?.data?.error || t('oral.exam.uploadFailed'));
      return null;
    } finally {
      setUploadingFor(null);
    }
  }

  // ------------------------------------------------------------------
  // Phase transitions
  // ------------------------------------------------------------------
  function startMonologue() {
    setSkipPrepOpen(false);
    setPhase('monologue');
  }

  function nextFollowUp() {
    const q = questionRef.current;
    if (!q) return;
    const list = q.followUps || [];
    const cur = uploadedRef.current;
    // Walk forward to the next still-missing slot. In normal sequential play
    // this is just followUpIdx + 1; during a submit-bounce recovery (e.g. Q2
    // was missing among already-recorded Q3/Q4/Q5), we skip slots that are
    // already done so the user isn't asked to re-record them.
    const nextMissing = list.findIndex((f, i) => i > followUpIdx && !cur.followUps[f.id]);
    if (nextMissing < 0) {
      submit();
    } else {
      setFollowUpIdx(nextMissing);
    }
  }

  async function submit() {
    const q = questionRef.current;
    if (!q || !sessionId) return;

    // Read the ref (not state) — the last upload's setUploaded may not have
    // re-rendered yet when this runs from nextFollowUp.
    const cur = uploadedRef.current;
    const allFollowUps = q.followUps || [];
    const missingFollowUpIdx = allFollowUps.findIndex((f) => !cur.followUps[f.id]);

    if (!cur.monologue) {
      setSubmitError(t('oral.exam.missingMonologue'));
      setRecoveryNonce((n) => n + 1);
      setPhase('monologue');
      return;
    }
    if (missingFollowUpIdx >= 0) {
      setSubmitError(
        t('oral.exam.missingFollowUp', { n: missingFollowUpIdx + 1 })
      );
      setFollowUpIdx(missingFollowUpIdx);
      setRecoveryNonce((n) => n + 1);
      setPhase('interaction');
      return;
    }

    setPhase('submitting');
    setSubmitError(null);

    const recordingIds = [
      cur.monologue,
      ...allFollowUps.map((f) => cur.followUps[f.id]),
    ];

    try {
      const { data } = await api.post(`/sessions/${sessionId}/submit`, {
        answers: [
          {
            questionId: q.id,
            answer: { recordingIds },
          },
        ],
        aiModel: quota?.defaultModel || undefined,
        aiLocale: i18n.language.slice(0, 2),
      });
      // Cache result so ReviewResult shows immediately, then navigate.
      try {
        sessionStorage.setItem(`result-${sessionId}`, JSON.stringify({
          result: data,
          exam,
          isMock: false,
        }));
      } catch { /* ignore */ }
      // Clear notes — exam done.
      try { localStorage.removeItem(noteKey(examId!)); } catch { /* ignore */ }
      setPhase('submitted');
      navigate(`/review/${sessionId}`);
    } catch (err: any) {
      setSubmitError(err?.response?.data?.error || t('oral.exam.submitFailed'));
      setPhase('interaction'); // back to last actionable phase
    }
  }

  // ------------------------------------------------------------------
  // Blocked / loading guards
  // ------------------------------------------------------------------
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-16 flex justify-center">
        <Spin size="large" />
      </div>
    );
  }

  const question = questionRef.current;

  if (blocked) {
    return (
      <div className="max-w-3xl mx-auto">
        <Result
          status="warning"
          icon={<LockOutlined />}
          title={
            blocked === 'PLAN_UPGRADE_REQUIRED'
              ? t('oral.exam.upgradeRequired')
              : blocked === 'QUOTA_EXCEEDED'
                ? t('oral.exam.quotaExceeded')
                : t('oral.exam.loadFailed')
          }
          subTitle={
            blocked === 'PLAN_UPGRADE_REQUIRED'
              ? t('oral.exam.upgradeRequiredDesc')
              : blocked === 'QUOTA_EXCEEDED'
                ? t('oral.exam.quotaExceededDesc', { cap: quota?.monthlyCap || 0 })
                : ''
          }
          extra={
            <Space>
              <Link to="/practice">
                <Button>{t('practice.po.backToHub')}</Button>
              </Link>
              {blocked === 'PLAN_UPGRADE_REQUIRED' && (
                <Link to="/pricing">
                  <Button type="primary">{t('practice.po.seePricing')}</Button>
                </Link>
              )}
            </Space>
          }
        />
      </div>
    );
  }

  if (!question || !exam || !quota) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('oral.exam.notFound')}
        description={t('oral.exam.notFoundDesc')}
      />
    );
  }

  const followUps: OralFollowUp[] = question.followUps || [];

  return (
    <div className="max-w-5xl mx-auto">
      <Breadcrumb
        className="mb-3"
        items={[
          { title: <Link to="/practice">{t('nav.practice')}</Link> },
          { title: <Link to="/practice/speaking">{t('skill.PO')}</Link> },
          { title: exam.title },
        ]}
      />

      <Card className="mb-4">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              {exam.title}
              <Tag color="orange" className="ml-2">{t('skill.PO')}</Tag>
            </Title>
            <Paragraph className="text-gray-500 mb-0">
              {t('oral.exam.subtitle')}
            </Paragraph>
          </div>
          <div className="text-right">
            <Text type="secondary" className="text-xs">{t('oral.exam.quotaUsed')}</Text>
            <div>
              <Text strong>{quota.used}</Text>{' '}
              <Text type="secondary">/ {quota.monthlyCap}</Text>
            </div>
          </div>
        </div>
      </Card>

      <Steps
        size="small"
        className="mb-4"
        current={
          phase === 'preparation' ? 0
            : phase === 'monologue' ? 1
              : phase === 'interaction' ? 2
                : 3
        }
        items={[
          { title: t('oral.exam.stepPrep'), icon: <ClockCircleOutlined /> },
          { title: t('oral.exam.stepMono'), icon: <AudioOutlined /> },
          { title: t('oral.exam.stepDebat'), icon: <MessageOutlined /> },
          { title: t('oral.exam.stepSubmit'), icon: <SendOutlined /> },
        ]}
      />

      {/* ---------------- Phase 1: PREPARATION ---------------- */}
      {phase === 'preparation' && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title={t('oral.exam.materialTitle')}>
              <Paragraph strong>{question.prompt}</Paragraph>
              {question.passage && (
                <div className="border-l-4 border-gray-200 pl-4 whitespace-pre-wrap text-gray-700">
                  {question.passage}
                </div>
              )}
            </Card>
          </Col>
          <Col xs={24} lg={12}>
            <Card
              title={
                <Space>
                  {t('oral.exam.notesTitle')}
                  <Tag color={prepRemaining < 60 ? 'red' : 'blue'}>
                    {String(Math.floor(prepRemaining / 60)).padStart(2, '0')}:
                    {String(prepRemaining % 60).padStart(2, '0')}
                  </Tag>
                </Space>
              }
              extra={
                <Button
                  type="primary"
                  icon={<AudioOutlined />}
                  onClick={() => {
                    if (prepRemaining > 60) setSkipPrepOpen(true);
                    else startMonologue();
                  }}
                >
                  {t('oral.exam.startMonologue')}
                </Button>
              }
            >
              <Input.TextArea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={22}
                placeholder={t('oral.exam.notesPlaceholder')}
                autoFocus
              />
              <Text type="secondary" className="text-xs mt-2 block">
                {t('oral.exam.notesAutoSaveHint')}
              </Text>
            </Card>
          </Col>
        </Row>
      )}

      <Modal
        open={skipPrepOpen}
        title={t('oral.exam.skipPrepTitle')}
        onOk={startMonologue}
        onCancel={() => setSkipPrepOpen(false)}
        okText={t('oral.exam.skipPrepConfirm')}
        cancelText={t('auth.common.cancel')}
      >
        <Paragraph>{t('oral.exam.skipPrepBody')}</Paragraph>
      </Modal>

      {/* ---------------- Phase 2: MONOLOGUE ---------------- */}
      {phase === 'monologue' && (
        <div className="flex flex-col gap-4">
          {/* 顶部：录音区 */}
          <Card title={t('oral.exam.monologueTitle')}>
            <Alert
              type="info"
              showIcon
              message={t('oral.exam.monologueHint', {
                sec: quota.thresholds.monologueMaxSec,
              })}
              className="mb-3"
            />
            <AudioRecorder
              key={`monologue-${recoveryNonce}`}
              maxSeconds={quota.thresholds.monologueMaxSec}
              allowRetake={false}
              disabled={uploadingFor === 'monologue'}
              onComplete={async (rec) => {
                const ok = await uploadRecording(rec, null);
                if (!ok) return;
                // After a re-record (recovery from a missing-monologue submit),
                // the follow-ups may already all be done — skip straight to
                // submit. Otherwise jump to the first follow-up still missing
                // (which on first pass is index 0).
                const cur = uploadedRef.current;
                const nextMissing = followUps.findIndex((f) => !cur.followUps[f.id]);
                if (followUps.length === 0 || nextMissing < 0) {
                  submit();
                } else {
                  setFollowUpIdx(nextMissing);
                  setPhase('interaction');
                }
              }}
            />
            {uploadingFor === 'monologue' && (
              <div className="mt-2 text-center text-gray-500">
                <Spin size="small" /> {t('oral.exam.uploading')}
              </div>
            )}
          </Card>

          {/* 底部：左侧题目，右侧笔记 */}
          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title={t('oral.exam.materialTitle')} size="small">
                <Paragraph strong className="mb-2">{question.prompt}</Paragraph>
                {question.passage && (
                  <div className="text-sm text-gray-600 whitespace-pre-wrap">
                    {question.passage}
                  </div>
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card title={t('oral.exam.yourNotes')} size="small">
                <div
                  className="whitespace-pre-wrap text-sm rounded-md"
                  style={{
                    background: '#fffbe6',
                    border: '1px solid #ffe58f',
                    padding: '10px 14px',
                    lineHeight: 1.7,
                    minHeight: 120,
                    color: notes ? '#1f2937' : '#bfbfbf',
                    fontStyle: notes ? 'normal' : 'italic',
                  }}
                >
                  {notes || t('oral.exam.notesEmpty')}
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      {/* ---------------- Phase 3: INTERACTION ---------------- */}
      {phase === 'interaction' && followUps.length > 0 && (
        <Card
          title={t('oral.exam.debatTitle')}
          extra={<Tag>{t('oral.exam.qIndex', { n: followUpIdx + 1, total: followUps.length })}</Tag>}
        >
          <Alert
            type="info"
            showIcon
            message={t('oral.exam.debatHint', { sec: quota.thresholds.followUpMaxSec })}
            className="mb-3"
          />
          <Card className="mb-3 bg-gray-50" bordered={false}>
            <Title level={4} style={{ marginTop: 0 }}>
              {t('oral.exam.examinerQuestion')}
            </Title>
            <Paragraph className="text-base mb-0">
              {followUps[followUpIdx].text}
            </Paragraph>
            {followUps[followUpIdx].audioUrl && (
              <audio
                controls
                preload="metadata"
                src={followUps[followUpIdx].audioUrl!}
                className="mt-2"
                style={{ width: '100%' }}
              />
            )}
          </Card>
          <AudioRecorder
            key={`follow-${followUps[followUpIdx].id}-${recoveryNonce}`}
            maxSeconds={quota.thresholds.followUpMaxSec}
            allowRetake={false}
            disabled={uploadingFor === followUps[followUpIdx].id}
            onComplete={async (rec) => {
              const ok = await uploadRecording(rec, followUps[followUpIdx].id);
              if (ok) nextFollowUp();
            }}
          />
          {uploadingFor === followUps[followUpIdx].id && (
            <div className="mt-2 text-center text-gray-500">
              <Spin size="small" /> {t('oral.exam.uploading')}
            </div>
          )}
        </Card>
      )}

      {/* ---------------- Phase 4: SUBMITTING ---------------- */}
      {phase === 'submitting' && (
        <Card>
          <div className="text-center py-8">
            <Spin size="large" />
            <Title level={4} className="mt-4">{t('oral.exam.submitting')}</Title>
            <Paragraph className="text-gray-500">{t('oral.exam.submittingDesc')}</Paragraph>
          </div>
        </Card>
      )}

      {submitError && (
        <Alert
          type="error"
          showIcon
          message={submitError}
          className="mt-3"
          action={
            <Button onClick={submit}>{t('oral.exam.retrySubmit')}</Button>
          }
        />
      )}
    </div>
  );
}
