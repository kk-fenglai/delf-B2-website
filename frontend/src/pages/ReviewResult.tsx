import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card, Typography, Tag, Progress, Button, Alert, Row, Col, Statistic,
} from 'antd';
import {
  CheckCircleFilled, CloseCircleFilled, ClockCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import EssayGradeCard from '../components/EssayGradeCard';
import type { SubmitResult, ExamSetDetail, Skill } from '../types';

const { Title, Paragraph, Text } = Typography;

const SKILL_ORDER: Skill[] = ['CO', 'CE', 'PE', 'PO'];

// DELF B2 official: each section scored /25, pass ≥5/25 per section AND
// ≥50/100 total. When question max ≠ 25 (small skill drills) we scale.
function scaleTo25(score: number, max: number): number {
  if (!max) return 0;
  return Math.round((score / max) * 25 * 10) / 10;
}

export default function ReviewResult() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const [data, setData] = useState<{
    result: SubmitResult;
    exam: ExamSetDetail;
    isMock?: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const cached = sessionStorage.getItem(`result-${sessionId}`);
    if (cached) {
      setData(JSON.parse(cached));
      return () => { cancelled = true; };
    }
    if (!sessionId) return () => { cancelled = true; };
    (async () => {
      try {
        const { data } = await api.get(`/sessions/${sessionId}/result`);
        if (cancelled) return;
        setData(data);
      } catch {
        // ignore — UI will fall back to the "noResult" state
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const downloadPdf = async () => {
    if (!sessionId) return;
    const r = await api.get(`/sessions/${sessionId}/report.pdf`, { responseType: 'blob' });
    const blob = new Blob([r.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `DELFluent-${sessionId}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  if (!data) return (
    <div>
      {t('review.noResult')} <Link to="/practice">{t('review.backToPractice')}</Link>
    </div>
  );

  const { result, exam, isMock } = data;
  const pct = result.maxScore ? Math.round((result.totalScore / result.maxScore) * 100) : 0;
  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const essayByQuestion = new Map((result.essays || []).map((e) => [e.questionId, e]));

  // DELF B2 verdict. Only meaningful in mock mode (full exam covers all 4
  // skills). We scale each section to /25 so the pass gate (≥5/25) applies
  // consistently even when the mock isn't pinned to 25 raw points per skill.
  const showMockVerdict = isMock && !!result.perSkill;
  const thresholds = result.thresholds || { passTotal: 50, passPerSkill: 5, skillMax: 25 };
  const perSkillScaled = showMockVerdict
    ? SKILL_ORDER.map((s) => {
        const b = result.perSkill![s];
        const scaled = scaleTo25(b.score, b.maxScore);
        return {
          skill: s,
          present: b.maxScore > 0,
          raw: b.score,
          rawMax: b.maxScore,
          scaled,
          passed: scaled >= thresholds.passPerSkill,
          pendingAI: b.pendingAI,
        };
      }).filter((r) => r.present)
    : [];
  const totalScaled = perSkillScaled.reduce((s, r) => s + r.scaled, 0);
  const anyBelowGate = perSkillScaled.some((r) => !r.passed && !r.pendingAI);
  const anyPending = perSkillScaled.some((r) => r.pendingAI);
  const overallPass = !anyBelowGate && !anyPending && totalScaled >= thresholds.passTotal;

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="mb-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              {t('review.title')} · {exam.title}
              {isMock && <Tag color="purple" className="ml-2">{t('exam.mockBadge')}</Tag>}
            </Title>
            <Paragraph className="text-gray-500 mb-0">
              {t('dashboard.score')} <strong className="text-brand">{result.totalScore}</strong> / {result.maxScore}
              {showMockVerdict && (
                <Text className="ml-3 text-gray-500">
                  · {t('review.delfTotal', { score: totalScaled.toFixed(1) })}
                </Text>
              )}
            </Paragraph>
          </div>
          <Progress type="circle" percent={pct} size={100} strokeColor="#1A3A5C" />
        </div>
      </Card>

      {/* DELF B2 verdict — mock exams only. Shows per-skill /25 scaled scores
          with the official 5/25 gate marker, plus an overall pass/fail banner. */}
      {showMockVerdict && (
        <Card className="mb-4" title={t('review.delfVerdictTitle')}>
          <Alert
            type={
              anyPending ? 'info' : overallPass ? 'success' : 'warning'
            }
            showIcon
            icon={anyPending ? <ClockCircleOutlined /> : overallPass ? <CheckCircleFilled /> : <CloseCircleFilled />}
            className="mb-4"
            message={
              anyPending
                ? t('review.delfPending')
                : overallPass
                  ? t('review.delfPassed', { score: totalScaled.toFixed(1), min: thresholds.passTotal })
                  : t('review.delfFailed', { score: totalScaled.toFixed(1), min: thresholds.passTotal })
            }
            description={t('review.delfGateHint', {
              skillMin: thresholds.passPerSkill,
              skillMax: thresholds.skillMax,
            })}
          />
          <Row gutter={[16, 16]}>
            {perSkillScaled.map((r) => (
              <Col key={r.skill} xs={12} sm={6}>
                <Card
                  size="small"
                  className={
                    r.pendingAI
                      ? 'border-gray-300'
                      : r.passed
                        ? 'border-green-400'
                        : 'border-red-400'
                  }
                  style={{ borderWidth: 2 }}
                >
                  <Statistic
                    title={
                      <span>
                        {t(`skill.${r.skill}`)}{' '}
                        {r.pendingAI ? (
                          <Tag color="default">{t('review.pendingAI')}</Tag>
                        ) : r.passed ? (
                          <Tag color="success">{t('review.passGate')}</Tag>
                        ) : (
                          <Tag color="error">{t('review.failGate')}</Tag>
                        )}
                      </span>
                    }
                    value={r.scaled}
                    suffix={`/ ${thresholds.skillMax}`}
                    precision={1}
                    valueStyle={{
                      color: r.pendingAI ? '#8c8c8c' : r.passed ? '#389e0d' : '#cf1322',
                    }}
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    {t('review.rawPoints', { score: r.raw, max: r.rawMax })}
                  </div>
                </Card>
              </Col>
            ))}
          </Row>
        </Card>
      )}

      {result.details.map((d, i) => {
        const q = questionMap.get(d.questionId);
        if (!q) return null;
        const essay = essayByQuestion.get(d.questionId) || null;
        const correctness =
          d.isCorrect === null ? 'pending' : d.isCorrect ? 'correct' : 'wrong';

        return (
          <Card key={d.questionId} className="mb-3">
            <div className="flex justify-between mb-2">
              <strong>{t('exam.questionN', { n: i + 1 })}</strong>
              {correctness === 'correct' && <Tag color="success">{t('review.correct')}</Tag>}
              {correctness === 'wrong' && <Tag color="error">{t('review.wrong')}</Tag>}
              {correctness === 'pending' && <Tag color="default">{t('review.pendingAI')}</Tag>}
            </div>
            <Paragraph>{q.prompt}</Paragraph>
            {q.type !== 'ESSAY' && q.type !== 'SPEAKING' && (
              <>
                <div className="mb-1">
                  <span className="text-gray-500">{t('review.yourAnswer')}</span>
                  <strong>
                    {Array.isArray(d.userAnswer)
                      ? d.userAnswer.join(', ')
                      : (d.userAnswer || t('review.notAnswered'))}
                  </strong>
                </div>
                <div className="mb-2">
                  <span className="text-gray-500">{t('review.correctAnswer')}</span>
                  <strong className="text-green-600">{d.correctAnswer?.join(', ')}</strong>
                </div>
              </>
            )}
            {q.type === 'ESSAY' && essay && (
              <EssayGradeCard
                essayId={essay.essayId}
                initialStatus={essay.status}
                questionPrompt={q.prompt}
              />
            )}
            {d.explanation && (
              <Alert type="info" message={t('review.explanation')} description={d.explanation} className="mt-2" />
            )}
          </Card>
        );
      })}

      <div className="flex gap-2 justify-center mt-6">
        <Link to="/practice"><Button>{t('review.backToPractice')}</Button></Link>
        <Button onClick={downloadPdf}>{t('review.downloadPdf')}</Button>
        <Link to="/dashboard"><Button type="primary">{t('review.toDashboard')}</Button></Link>
      </div>
    </div>
  );
}
