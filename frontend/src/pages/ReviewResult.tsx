import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Card, Typography, Tag, Progress, Button, Alert, Row, Col, Statistic, message,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import EssayGradeCard from '../components/EssayGradeCard';
import OralGradeCard from '../components/OralGradeCard';
import AiExplanation from '../components/AiExplanation';
import { localizeExamTitle } from '../utils/examTitle';
import type { SubmitResult, ExamSetDetail, Skill } from '../types';

const { Title, Paragraph } = Typography;

const SKILL_ORDER: Skill[] = ['CO', 'CE', 'PE', 'PO'];

export default function ReviewResult() {
  const { t, i18n } = useTranslation();
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
    try {
      const r = await api.get(`/sessions/${sessionId}/report.pdf`, {
        params: { lang: i18n.language?.split('-')[0] || 'zh' },
        responseType: 'arraybuffer',
      });
      const blob = new Blob([r.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const filename = `DELFluent-${sessionId}.pdf`;
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      if (isMobile) {
        // iOS/Android often ignore programmatic download; open the PDF viewer instead.
        const opened = window.open(url, '_blank');
        if (!opened) {
          window.location.href = url;
        }
        message.info(t('review.downloadPdfMobileHint'));
        setTimeout(() => window.URL.revokeObjectURL(url), 120_000);
        return;
      }

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      message.error(t('review.downloadPdfFailed'));
    }
  };

  if (!data) return (
    <div>
      {t('review.noResult')} <Link to="/practice">{t('review.backToPractice')}</Link>
    </div>
  );

  const { result, exam, isMock } = data;
  // A full mock carries a speaking part taken as a separate session. After the
  // written review the candidate can choose to continue to the oral exam.
  const hasSpeaking = !!isMock && exam.questions.some((q) => q.type === 'SPEAKING');
  const pct = result.maxScore ? Math.round((result.totalScore / result.maxScore) * 100) : 0;
  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const essayByQuestion = new Map((result.essays || []).map((e) => [e.questionId, e]));
  const oralByQuestion = new Map((result.orals || []).map((o) => [o.questionId, o]));

  // Listening (CO) and Reading (CE) are no longer reported as a /25 score —
  // we show the question-level correctness rate instead. The full B2 pass
  // prediction (official gates, correctness-based) lives in the learning
  // centre (Dashboard → ScorePredictionCard).
  const showCorrectness = isMock && !!result.perSkill;
  const correctnessFor = (s: Skill) => {
    const ds = result.details.filter((d) => {
      const qq = questionMap.get(d.questionId);
      return qq && qq.skill === s && qq.type !== 'ESSAY' && qq.type !== 'SPEAKING';
    });
    const total = ds.length;
    const correct = ds.filter((d) => d.isCorrect === true).length;
    return { skill: s, total, correct, rate: total ? Math.round((correct / total) * 100) : 0 };
  };
  // CO/CE objective correctness; PE present in the written session is AI-graded.
  const autoRates = showCorrectness
    ? (['CO', 'CE'] as Skill[]).map(correctnessFor).filter((r) => r.total > 0)
    : [];
  const aiPendingSkills = showCorrectness
    ? SKILL_ORDER.filter(
        (s) => (s === 'PE' || s === 'PO') && (result.perSkill?.[s]?.maxScore ?? 0) > 0,
      )
    : [];

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="mb-4">
        <Title level={3} style={{ marginBottom: 4 }}>
          {t('review.title')} · {localizeExamTitle(exam.title, t)}
          {isMock && <Tag color="purple" className="ml-2">{t('exam.mockBadge')}</Tag>}
        </Title>
      </Card>

      {/* Written part done — let the candidate review the score below OR
          continue to the speaking exam (separate session, 3-choose-1). */}
      {hasSpeaking && (
        <Alert
          type="success"
          showIcon
          className="mb-4"
          message={t('review.writtenDoneTitle', '笔试部分已完成')}
          description={t('review.writtenDoneDesc', '你可以在下方查看笔试成绩，或现在开始口语部分（三选一）。')}
          action={
            <Link to={`/practice/speaking/${exam.id}?mode=exam`}>
              <Button type="primary">{t('review.startSpeaking', '开始口语')}</Button>
            </Link>
          }
        />
      )}

      {/* Listening / Reading correctness — CO & CE are reported as a correctness
          rate (not a /25 score). The full B2 pass prediction lives in the
          learning centre (Dashboard). */}
      {showCorrectness && (autoRates.length > 0 || aiPendingSkills.length > 0) && (
        <Card className="mb-4" title={t('review.correctnessTitle', '答题正确率（听力 / 阅读）')}>
          <Alert
            type="info"
            showIcon
            className="mb-4"
            message={t('review.correctnessHint', '听力与阅读不计分，仅按正确率展示。')}
            description={t('review.predictionHint', '完整的 B2 通过预测（按正确率，含官方及格线）请见学习中心。')}
            action={
              <Link to="/dashboard">
                <Button size="small" type="primary">{t('review.toDashboard')}</Button>
              </Link>
            }
          />
          <Row gutter={[16, 16]}>
            {autoRates.map((r) => (
              <Col key={r.skill} xs={12} sm={6}>
                <Card size="small" className="border-blue-300" style={{ borderWidth: 2 }}>
                  <Statistic
                    title={t(`skill.${r.skill}`)}
                    value={r.rate}
                    suffix="%"
                    valueStyle={{ color: '#1677ff' }}
                  />
                  <div className="text-xs text-gray-400 mt-1">
                    {t('review.correctOf', { correct: r.correct, total: r.total })}
                  </div>
                </Card>
              </Col>
            ))}
            {aiPendingSkills.map((s) => (
              <Col key={s} xs={12} sm={6}>
                <Card size="small" className="border-gray-300" style={{ borderWidth: 2 }}>
                  <Statistic
                    title={(
                      <span>
                        {t(`skill.${s}`)}{' '}
                        <Tag color="default">{t('review.pendingAI')}</Tag>
                      </span>
                    )}
                    value="—"
                    valueStyle={{ color: '#8c8c8c' }}
                  />
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
        const oral = oralByQuestion.get(d.questionId) || null;
        const correctness =
          d.isCorrect === null ? 'pending' : d.isCorrect ? 'correct' : 'wrong';

        return (
          <Card key={d.questionId} className="mb-3">
            <div className="flex justify-between mb-2">
              <strong>{t('exam.questionN', { n: i + 1 })}</strong>
              {correctness === 'correct' && <Tag color="success">{t('review.correct')}</Tag>}
              {correctness === 'wrong' && <Tag color="error">{t('review.wrong')}</Tag>}
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
            {q.type === 'ESSAY' && q.skill === 'CE' && (
              <div className="mt-2 flex flex-col gap-2">
                <div>
                  <span className="text-gray-500 text-sm">{t('review.yourAnswer')}</span>
                  <div className="mt-1 p-2 rounded bg-gray-50 text-sm">
                    {d.userAnswer || <span className="text-gray-400">{t('review.notAnswered')}</span>}
                  </div>
                </div>
                {(q as any).modelEssay && (
                  <div>
                    <span className="text-gray-500 text-sm">{t('review.correctAnswer')}</span>
                    <div className="mt-1 p-2 rounded bg-green-50 text-green-800 text-sm font-medium">
                      {(q as any).modelEssay}
                    </div>
                  </div>
                )}
              </div>
            )}
            {q.type === 'ESSAY' && q.skill !== 'CE' && essay && (
              <EssayGradeCard
                essayId={essay.essayId}
                initialStatus={essay.status}
                questionPrompt={q.prompt}
              />
            )}
            {q.type === 'SPEAKING' && oral && (
              <OralGradeCard
                oralId={oral.oralId}
                initialStatus={oral.status}
                questionPrompt={q.prompt}
              />
            )}
            {d.explanation && (
              <Alert type="info" message={t('review.explanation')} description={d.explanation} className="mt-2" />
            )}
            {(q.skill === 'CO' || q.skill === 'CE') && q.type !== 'ESSAY' && q.type !== 'SPEAKING' && sessionId && (
              <AiExplanation sessionId={sessionId} questionId={d.questionId} />
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
