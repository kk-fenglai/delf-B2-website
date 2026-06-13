import { useEffect, useState } from 'react';
import {
  Card, Typography, Button, Form, Input, InputNumber, Select, Checkbox, Space, message, Popconfirm, Upload, Alert, Tag,
} from 'antd';
import type { UploadProps } from 'antd';
import { PlusOutlined, SaveOutlined, CheckOutlined, ArrowLeftOutlined, SoundOutlined, CheckCircleTwoTone } from '@ant-design/icons';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, ACCESS_KEY } from '../api/client';
import type { UserExamSetDetail, UserExamQuestionInput, UserAudioDocument } from '../types';

const { Title, Paragraph, Text } = Typography;

type UserSkill = 'CE' | 'PE' | 'CO' | 'PO';

const CE_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'TRUE_FALSE_JUSTIFY'] as const;
const CO_TYPES = ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'FILL'] as const;

function emptyQuestion(skill: UserSkill, order: number, audioDocId?: string | null): UserExamQuestionInput {
  if (skill === 'PE') {
    return { skill: 'PE', type: 'ESSAY', order, prompt: '', points: 25, options: [] };
  }
  if (skill === 'PO') {
    return {
      skill: 'PO', type: 'SPEAKING', order, prompt: '', points: 25, options: [],
      followUps: [{ order: 0, text: '', expectedAngle: null }],
    };
  }
  const base = {
    skill,
    order,
    prompt: '',
    points: skill === 'CO' ? 3 : 3,
    options: [] as UserExamQuestionInput['options'],
    ...(skill === 'CO' && audioDocId ? { audioDocumentId: audioDocId } : {}),
  };
  if (skill === 'CO') {
    return {
      ...base,
      skill: 'CO',
      type: 'SINGLE',
      options: [
        { label: 'A', text: '', isCorrect: true, order: 0 },
        { label: 'B', text: '', isCorrect: false, order: 1 },
        { label: 'C', text: '', isCorrect: false, order: 2 },
        { label: 'D', text: '', isCorrect: false, order: 3 },
      ],
    };
  }
  return {
    skill: 'CE', type: 'SINGLE', order, prompt: '', points: 3, options: [
      { label: 'A', text: '', isCorrect: true, order: 0 },
      { label: 'B', text: '', isCorrect: false, order: 1 },
      { label: 'C', text: '', isCorrect: false, order: 2 },
      { label: 'D', text: '', isCorrect: false, order: 3 },
    ],
  };
}

function choiceTypes(type: string) {
  return ['SINGLE', 'MULTIPLE', 'TRUE_FALSE', 'TRUE_FALSE_JUSTIFY'].includes(type);
}

export default function MyExamEdit() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [set, setSet] = useState<UserExamSetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [metaForm] = Form.useForm();
  const [passage, setPassage] = useState('');
  const [transcript, setTranscript] = useState('');
  const [questions, setQuestions] = useState<UserExamQuestionInput[]>([]);
  const [audioDocs, setAudioDocs] = useState<UserAudioDocument[]>([]);
  const [pePrompt, setPePrompt] = useState('');
  const [peModelEssay, setPeModelEssay] = useState('');
  const [poPrompt, setPoPrompt] = useState('');
  const [poPassage, setPoPassage] = useState('');
  const [followUps, setFollowUps] = useState<Array<{ order: number; text: string; expectedAngle?: string | null }>>([]);

  const skill = set?.primarySkill as UserSkill | undefined;

  const reloadSet = async () => {
    const { data } = await api.get(`/user/exam-sets/${id}`);
    const s = data.set as UserExamSetDetail;
    setSet(s);
    setAudioDocs(s.audioDocuments || []);
    return s;
  };

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const s = await reloadSet();
        metaForm.setFieldsValue({ title: s.title, description: s.description || '' });

        if (s.primarySkill === 'CE') {
          const qs = (s.questions || []).map((q) => ({
            id: q.id,
            skill: 'CE' as const,
            type: q.type,
            order: q.order,
            prompt: q.prompt,
            passage: q.passage || '',
            explanation: q.explanation || '',
            points: q.points,
            options: (q.options || []).map((o, i) => ({
              label: o.label,
              text: o.text,
              isCorrect: o.isCorrect,
              order: o.order ?? i,
            })),
          }));
          setQuestions(qs.length ? qs : [emptyQuestion('CE', 1)]);
          setPassage(qs[0]?.passage || '');
        } else if (s.primarySkill === 'CO') {
          const docId = s.audioDocuments?.[0]?.id;
          const qs = (s.questions || []).map((q) => ({
            id: q.id,
            skill: 'CO' as const,
            type: q.type,
            order: q.order,
            prompt: q.prompt,
            explanation: q.explanation || '',
            points: q.points,
            audioDocumentId: q.audioDocumentId || docId,
            options: (q.options || []).map((o, i) => ({
              label: o.label,
              text: o.text,
              isCorrect: o.isCorrect,
              order: o.order ?? i,
            })),
          }));
          setQuestions(qs.length ? qs : [emptyQuestion('CO', 1, docId)]);
          setTranscript(s.questions?.[0]?.passage || '');
        } else if (s.primarySkill === 'PE') {
          const pe = s.questions?.[0];
          setPePrompt(pe?.prompt || '');
          setPeModelEssay(pe?.modelEssay || '');
        } else if (s.primarySkill === 'PO') {
          const po = s.questions?.[0];
          setPoPrompt(po?.prompt || '');
          setPoPassage(po?.passage || '');
          const fus = (po?.followUps || []).map((f, i) => ({
            order: f.order ?? i,
            text: f.text,
            expectedAngle: f.expectedAngle,
          }));
          setFollowUps(fus.length ? fus : [{ order: 0, text: '' }]);
        }
      } catch {
        message.error(t('myExams.loadFailed'));
        navigate('/my-exams');
      } finally {
        setLoading(false);
      }
    })();
  }, [id, metaForm, navigate, t]);

  const saveMeta = async () => {
    const values = await metaForm.validateFields();
    await api.put(`/user/exam-sets/${id}`, {
      title: values.title,
      description: values.description || null,
      ...(skill === 'CE' ? { sharedPassage: passage } : {}),
      ...(skill === 'CO' ? { sharedTranscript: transcript } : {}),
    });
  };

  const syncQuestions = async () => {
    if (!set || !id) return;
    const existing = set.questions || [];
    const docId = audioDocs[0]?.id;

    if (skill === 'PE') {
      const payload = emptyQuestion('PE', 1);
      payload.prompt = pePrompt;
      payload.modelEssay = peModelEssay || null;
      if (existing[0]?.id) {
        await api.put(`/user/exam-sets/${id}/questions/${existing[0].id}`, payload);
      } else {
        await api.post(`/user/exam-sets/${id}/questions`, payload);
      }
      return;
    }

    if (skill === 'PO') {
      const payload: UserExamQuestionInput = {
        skill: 'PO',
        type: 'SPEAKING',
        order: 1,
        prompt: poPrompt,
        passage: poPassage || null,
        points: 25,
        options: [],
        followUps: followUps.map((f, i) => ({
          order: i,
          text: f.text,
          expectedAngle: f.expectedAngle || null,
        })),
      };
      if (existing[0]?.id) {
        await api.put(`/user/exam-sets/${id}/questions/${existing[0].id}`, payload);
      } else {
        await api.post(`/user/exam-sets/${id}/questions`, payload);
      }
      return;
    }

    const keptIds = new Set<string>();
    const sharedText = skill === 'CE' ? passage : undefined;
    for (let i = 0; i < questions.length; i++) {
      const q = {
        ...questions[i],
        order: i + 1,
        skill: skill as 'CE' | 'CO',
        ...(sharedText !== undefined ? { passage: sharedText } : {}),
        ...(skill === 'CO' && docId ? { audioDocumentId: docId } : {}),
      };
      if (q.type === 'FILL') q.options = [];
      if (q.id) {
        await api.put(`/user/exam-sets/${id}/questions/${q.id}`, q);
        keptIds.add(q.id);
      } else {
        const { data } = await api.post(`/user/exam-sets/${id}/questions`, q);
        keptIds.add(data.question.id);
        questions[i].id = data.question.id;
      }
    }
    for (const old of existing) {
      if (!keptIds.has(old.id)) {
        await api.delete(`/user/exam-sets/${id}/questions/${old.id}`);
      }
    }
  };

  const onSaveDraft = async () => {
    setSaving(true);
    try {
      await saveMeta();
      await syncQuestions();
      message.success(t('myExams.saved'));
      await reloadSet();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      message.error(err.response?.data?.error || t('myExams.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const onPublish = async () => {
    if (skill === 'CE' && !passage.trim()) {
      message.warning(t('myExams.missingPassage'));
      return;
    }
    setSaving(true);
    try {
      await saveMeta();
      await syncQuestions();
      await api.put(`/user/exam-sets/${id}`, {
        isPublished: true,
        ...(skill === 'CE' ? { sharedPassage: passage } : {}),
        ...(skill === 'CO' ? { sharedTranscript: transcript } : {}),
      });
      message.success(t('myExams.publishedOk'));
      navigate('/my-exams');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; code?: string } } };
      const code = err.response?.data?.code;
      if (code === 'MISSING_PASSAGE') message.error(t('myExams.missingPassage'));
      else if (code === 'MISSING_CO_AUDIO') message.error(t('myExams.missingCoAudio'));
      else if (code === 'MISSING_PO_FOLLOWUPS') message.error(t('myExams.missingPoFollowups'));
      else message.error(err.response?.data?.error || t('myExams.publishFailed'));
    } finally {
      setSaving(false);
    }
  };

  const updateQuestion = (idx: number, patch: Partial<UserExamQuestionInput>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)));
  };

  const updateOption = (qIdx: number, oIdx: number, patch: Partial<{ label: string; text: string; isCorrect: boolean }>) => {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      const opts = [...(q.options || [])];
      opts[oIdx] = { ...opts[oIdx], ...patch };
      return { ...q, options: opts };
    }));
  };

  const setSingleCorrect = (qIdx: number, label: string) => {
    setQuestions((prev) => prev.map((q, i) => {
      if (i !== qIdx) return q;
      return {
        ...q,
        options: (q.options || []).map((o) => ({ ...o, isCorrect: o.label === label })),
      };
    }));
  };

  const makeAudioUpload = (docId: string): UploadProps => ({
    name: 'audio',
    action: `/api/user/exam-sets/${id}/audio-documents/${docId}/audio`,
    headers: { Authorization: `Bearer ${localStorage.getItem(ACCESS_KEY) || ''}` },
    accept: 'audio/*',
    showUploadList: false,
    onChange(info) {
      if (info.file.status === 'done') {
        message.success(t('myExams.audioUploaded'));
        reloadSet();
      } else if (info.file.status === 'error') {
        message.error(info.file.response?.error || t('myExams.audioUploadFailed'));
      }
    },
  });

  const renderChoiceQuestions = (types: readonly string[], skillKey: 'CE' | 'CO') => (
    <>
      {questions.map((q, qi) => (
        <Card
          key={q.id || qi}
          title={t('myExams.questionN', { n: qi + 1 })}
          className="mb-4"
          extra={questions.length > 1 && (
            <Popconfirm title={t('myExams.confirmDeleteQ')} onConfirm={() => setQuestions((p) => p.filter((_, i) => i !== qi))}>
              <Button size="small" danger>{t('myExams.removeQ')}</Button>
            </Popconfirm>
          )}
        >
          <Space direction="vertical" className="w-full" size="middle">
            <Select
              value={q.type}
              onChange={(v) => {
                const patch: Partial<UserExamQuestionInput> = { type: v };
                if (v === 'FILL') patch.options = [];
                else if (!choiceTypes(v) && (q.options || []).length === 0) {
                  patch.options = [
                    { label: 'A', text: '', isCorrect: true, order: 0 },
                    { label: 'B', text: '', isCorrect: false, order: 1 },
                  ];
                }
                updateQuestion(qi, patch);
              }}
              options={types.map((ty) => ({ value: ty, label: t(`myExams.type.${ty}`) }))}
              style={{ width: '100%' }}
            />
            <Input.TextArea
              rows={2}
              value={q.prompt}
              onChange={(e) => updateQuestion(qi, { prompt: e.target.value })}
              placeholder={t('myExams.promptPlaceholder')}
            />
            <InputNumber min={1} max={25} value={q.points} onChange={(v) => updateQuestion(qi, { points: v || 1 })} addonBefore={t('exam.points')} />
            {choiceTypes(q.type) && (q.options || []).map((o, oi) => (
              <div key={o.label} className="flex gap-2 items-start">
                <Checkbox
                  checked={o.isCorrect}
                  onChange={() => {
                    if (q.type === 'MULTIPLE') {
                      updateOption(qi, oi, { isCorrect: !o.isCorrect });
                    } else {
                      setSingleCorrect(qi, o.label);
                    }
                  }}
                />
                <Text strong className="shrink-0">{o.label}.</Text>
                <Input
                  value={o.text}
                  onChange={(e) => updateOption(qi, oi, { text: e.target.value })}
                  className="flex-1"
                />
              </div>
            ))}
            {q.type === 'FILL' && (
              <Alert type="info" showIcon message={t('myExams.fillHint')} />
            )}
            <Input.TextArea
              rows={2}
              value={q.explanation || ''}
              onChange={(e) => updateQuestion(qi, { explanation: e.target.value })}
              placeholder={t('myExams.explanationPlaceholder')}
            />
          </Space>
        </Card>
      ))}

      <Button
        block
        icon={<PlusOutlined />}
        className="mb-4"
        onClick={() => setQuestions((p) => [...p, emptyQuestion(skillKey, p.length + 1, audioDocs[0]?.id)])}
      >
        {t('myExams.addQuestion')}
      </Button>
    </>
  );

  if (loading || !set) {
    return <Card loading className="max-w-3xl mx-auto" />;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <Link to="/my-exams" className="inline-flex items-center gap-1 mb-3 text-gray-500">
        <ArrowLeftOutlined /> {t('myExams.back')}
      </Link>
      <Title level={3}>{t('myExams.editTitle')} · {t(`skill.${skill}`)}</Title>

      <Card className="mb-4">
        <Form form={metaForm} layout="vertical">
          <Form.Item name="title" label={t('myExams.titleLabel')} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label={t('myExams.descLabel')}>
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Card>

      {skill === 'CE' && (
        <>
          <Card title={t('myExams.passageTitle')} className="mb-4">
            <Paragraph type="secondary" className="text-sm">{t('myExams.passageHint')}</Paragraph>
            <Input.TextArea rows={10} value={passage} onChange={(e) => setPassage(e.target.value)} />
          </Card>
          {renderChoiceQuestions(CE_TYPES, 'CE')}
        </>
      )}

      {skill === 'CO' && (
        <>
          <Card title={t('myExams.coAudioTitle')} className="mb-4">
            <Paragraph type="secondary" className="text-sm">{t('myExams.coAudioHint')}</Paragraph>
            {audioDocs.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center gap-3 mb-3">
                <Text>{doc.title || t('myExams.coDocDefault')}</Text>
                {doc.audioUrl ? (
                  <Tag icon={<CheckCircleTwoTone twoToneColor="#52c41a" />} color="success">
                    {t('myExams.audioReady')}
                  </Tag>
                ) : (
                  <Tag>{t('myExams.audioMissing')}</Tag>
                )}
                <Upload {...makeAudioUpload(doc.id)}>
                  <Button icon={<SoundOutlined />}>
                    {doc.audioUrl ? t('myExams.replaceAudio') : t('myExams.uploadAudio')}
                  </Button>
                </Upload>
              </div>
            ))}
          </Card>
          <Card title={t('myExams.coTranscriptTitle')} className="mb-4">
            <Paragraph type="secondary" className="text-sm">{t('myExams.coTranscriptHint')}</Paragraph>
            <Input.TextArea rows={6} value={transcript} onChange={(e) => setTranscript(e.target.value)} />
          </Card>
          {renderChoiceQuestions(CO_TYPES, 'CO')}
        </>
      )}

      {skill === 'PE' && (
        <Card title={t('myExams.peTitle')} className="mb-4">
          <Paragraph type="secondary" className="text-sm">{t('myExams.peHint')}</Paragraph>
          <Input.TextArea
            rows={4}
            value={pePrompt}
            onChange={(e) => setPePrompt(e.target.value)}
            placeholder={t('myExams.pePromptPlaceholder')}
            className="mb-3"
          />
          <Input.TextArea
            rows={6}
            value={peModelEssay}
            onChange={(e) => setPeModelEssay(e.target.value)}
            placeholder={t('myExams.peModelEssayPlaceholder')}
          />
        </Card>
      )}

      {skill === 'PO' && (
        <Card title={t('myExams.poTitle')} className="mb-4">
          <Paragraph type="secondary" className="text-sm">{t('myExams.poHint')}</Paragraph>
          <Input.TextArea
            rows={3}
            value={poPrompt}
            onChange={(e) => setPoPrompt(e.target.value)}
            placeholder={t('myExams.poPromptPlaceholder')}
            className="mb-3"
          />
          <Input.TextArea
            rows={4}
            value={poPassage}
            onChange={(e) => setPoPassage(e.target.value)}
            placeholder={t('myExams.poPassagePlaceholder')}
            className="mb-4"
          />
          <Text strong className="block mb-2">{t('myExams.poFollowUpsTitle')}</Text>
          {followUps.map((fu, fi) => (
            <div key={fi} className="flex gap-2 mb-2 items-start">
              <Text className="shrink-0 pt-1">{fi + 1}.</Text>
              <Input.TextArea
                rows={2}
                value={fu.text}
                onChange={(e) => setFollowUps((prev) => prev.map((x, i) => (i === fi ? { ...x, text: e.target.value } : x)))}
                placeholder={t('myExams.poFollowUpPlaceholder')}
                className="flex-1"
              />
              {followUps.length > 1 && (
                <Button
                  size="small"
                  danger
                  onClick={() => setFollowUps((prev) => prev.filter((_, i) => i !== fi))}
                >
                  {t('myExams.removeQ')}
                </Button>
              )}
            </div>
          ))}
          {followUps.length < 6 && (
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              block
              onClick={() => setFollowUps((prev) => [...prev, { order: prev.length, text: '' }])}
            >
              {t('myExams.addFollowUp')}
            </Button>
          )}
        </Card>
      )}

      <Space wrap className="w-full justify-end">
        <Button icon={<SaveOutlined />} loading={saving} onClick={onSaveDraft}>
          {t('myExams.saveDraft')}
        </Button>
        <Button type="primary" icon={<CheckOutlined />} loading={saving} onClick={onPublish}>
          {t('myExams.publish')}
        </Button>
      </Space>
    </div>
  );
}
