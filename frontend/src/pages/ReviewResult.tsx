import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Card, Typography, Tag, Progress, Button, Alert } from 'antd';
import { useTranslation } from 'react-i18next';
import EssayGradeCard from '../components/EssayGradeCard';
import type { SubmitResult, ExamSetDetail } from '../types';

const { Title, Paragraph } = Typography;

export default function ReviewResult() {
  const { t } = useTranslation();
  const { sessionId } = useParams();
  const [data, setData] = useState<{ result: SubmitResult; exam: ExamSetDetail } | null>(null);

  useEffect(() => {
    const cached = sessionStorage.getItem(`result-${sessionId}`);
    if (cached) setData(JSON.parse(cached));
  }, [sessionId]);

  if (!data) return (
    <div>
      {t('review.noResult')} <Link to="/practice">{t('review.backToPractice')}</Link>
    </div>
  );

  const { result, exam } = data;
  const pct = result.maxScore ? Math.round((result.totalScore / result.maxScore) * 100) : 0;
  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const essayByQuestion = new Map((result.essays || []).map((e) => [e.questionId, e]));

  return (
    <div className="max-w-4xl mx-auto">
      <Card className="mb-4">
        <div className="flex justify-between items-center flex-wrap gap-4">
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              {t('review.title')} · {exam.title}
            </Title>
            <Paragraph className="text-gray-500 mb-0">
              {t('dashboard.score')} <strong className="text-brand">{result.totalScore}</strong> / {result.maxScore}
            </Paragraph>
          </div>
          <Progress type="circle" percent={pct} size={100} strokeColor="#1A3A5C" />
        </div>
      </Card>

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
        <Link to="/dashboard"><Button type="primary">{t('review.toDashboard')}</Button></Link>
      </div>
    </div>
  );
}
