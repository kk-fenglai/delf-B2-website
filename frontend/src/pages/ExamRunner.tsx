import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card, Typography, Radio, Checkbox, Input, Button, message, Steps, Tag, Spin, Result,
} from 'antd';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import AudioPlayer from '../components/AudioPlayer';
import type { ExamSetDetail, Question } from '../types';

const { Title, Paragraph } = Typography;

export default function ExamRunner() {
  const { t } = useTranslation();
  const { examId } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamSetDetail | null>(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [sessionId, setSessionId] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/exams/${examId}`);
        setExam(data);
        const session = await api.post('/sessions', { examSetId: examId, mode: 'PRACTICE' });
        setSessionId(session.data.session.id);
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
  }, [examId, t]);

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

  const updateAnswer = (val: any) => setAnswers({ ...answers, [q.id]: val });

  const submit = async () => {
    if (!sessionId) return;
    setSubmitting(true);
    try {
      const payload = exam.questions.map((qq) => ({
        questionId: qq.id,
        answer: answers[qq.id] ?? (qq.type === 'MULTIPLE' ? [] : ''),
      }));
      const { data } = await api.post(`/sessions/${sessionId}/submit`, { answers: payload });
      sessionStorage.setItem(`result-${sessionId}`, JSON.stringify({ result: data, exam }));
      navigate(`/review/${sessionId}`);
    } catch (e: any) {
      message.error(e.response?.data?.error || t('exam.submitFail'));
    } finally {
      setSubmitting(false);
    }
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
          <div className="mt-2 text-xs text-gray-500">{t('exam.essayAITip')}</div>
        </div>
      );
    }
    return <div>{t('exam.unsupported')}</div>;
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <Title level={3}>{exam.title}</Title>
        <Tag color="blue">{t(`skill.${q.skill}`)} · {q.points} {t('exam.points')}</Tag>
      </div>

      <Steps
        current={current}
        size="small"
        className="mb-6"
        items={exam.questions.map((qq, i) => ({
          title: t('exam.questionN', { n: i + 1 }),
          description: t(`skill.${qq.skill}`),
          status: answers[qq.id] !== undefined ? 'finish' : i === current ? 'process' : 'wait',
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
          <Button type="primary" loading={submitting} onClick={submit}>
            {t('exam.submit')}
          </Button>
        )}
      </div>
    </div>
  );
}
