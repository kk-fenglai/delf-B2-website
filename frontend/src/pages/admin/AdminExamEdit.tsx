import { useEffect, useState } from 'react';
import {
  Card, Typography, Form, Input, InputNumber, Switch, Button, Space, Tag, message,
  Table, Modal, Select, Popconfirm, Upload, Divider, Alert,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  PlusOutlined, SaveOutlined, DeleteOutlined, UploadOutlined, SoundOutlined,
  CheckCircleTwoTone,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import { adminApi, ADMIN_TOKEN_KEY } from '../../api/adminClient';

const { Title } = Typography;

const SKILLS = [
  { value: 'CO', label: 'CO · 听力' },
  { value: 'CE', label: 'CE · 阅读' },
  { value: 'PE', label: 'PE · 写作' },
  { value: 'PO', label: 'PO · 口语' },
];

const TYPES = [
  { value: 'SINGLE', label: 'SINGLE · 单选' },
  { value: 'MULTIPLE', label: 'MULTIPLE · 多选' },
  { value: 'TRUE_FALSE', label: 'TRUE_FALSE · 判断' },
  { value: 'FILL', label: 'FILL · 填空' },
  { value: 'ESSAY', label: 'ESSAY · 作文' },
];

interface Option {
  id?: string;
  label: string;
  text: string;
  isCorrect: boolean;
  order: number;
}

interface Question {
  id: string;
  skill: string;
  type: string;
  order: number;
  prompt: string;
  passage?: string;
  audioUrl?: string;
  explanation?: string;
  points: number;
  options: Option[];
}

interface ExamSet {
  id: string;
  title: string;
  year: number;
  description?: string;
  isPublished: boolean;
  isFreePreview: boolean;
  questions: Question[];
}

export default function AdminExamEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [exam, setExam] = useState<ExamSet | null>(null);
  const [loading, setLoading] = useState(true);
  const [metaForm] = Form.useForm();
  const [qForm] = Form.useForm();
  const [editing, setEditing] = useState<Question | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await adminApi.get(`/exams/${id}`);
      setExam(data.set);
      metaForm.setFieldsValue({
        title: data.set.title,
        year: data.set.year,
        description: data.set.description,
        isPublished: data.set.isPublished,
        isFreePreview: data.set.isFreePreview,
      });
    } catch (e: any) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [id]);

  const saveMeta = async () => {
    try {
      const values = await metaForm.validateFields();
      setSavingMeta(true);
      await adminApi.put(`/exams/${id}`, values);
      message.success('已保存');
      fetchData();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.response?.data?.error || '保存失败');
    } finally {
      setSavingMeta(false);
    }
  };

  const openCreateQ = () => {
    setEditing(null);
    qForm.resetFields();
    qForm.setFieldsValue({
      skill: 'CO',
      type: 'SINGLE',
      points: 1,
      order: (exam?.questions.length || 0) + 1,
      options: [
        { label: 'A', text: '', isCorrect: false, order: 0 },
        { label: 'B', text: '', isCorrect: false, order: 1 },
      ],
    });
    setEditorOpen(true);
  };

  const openEditQ = (q: Question) => {
    setEditing(q);
    qForm.setFieldsValue({
      skill: q.skill,
      type: q.type,
      order: q.order,
      points: q.points,
      prompt: q.prompt,
      passage: q.passage,
      audioUrl: q.audioUrl,
      explanation: q.explanation,
      options: q.options.length
        ? q.options.map((o) => ({ ...o }))
        : [],
    });
    setEditorOpen(true);
  };

  const saveQ = async () => {
    try {
      const values = await qForm.validateFields();
      const payload = {
        skill: values.skill,
        type: values.type,
        order: values.order || 0,
        prompt: values.prompt,
        passage: values.passage || null,
        audioUrl: values.audioUrl || null,
        explanation: values.explanation || null,
        points: values.points || 1,
        options: (values.options || []).map((o: Option, i: number) => ({
          label: o.label,
          text: o.text,
          isCorrect: !!o.isCorrect,
          order: i,
        })),
      };
      if (editing) {
        await adminApi.put(`/exams/questions/${editing.id}`, payload);
        message.success('题目已更新');
      } else {
        await adminApi.post(`/exams/${id}/questions`, payload);
        message.success('题目已添加');
      }
      setEditorOpen(false);
      fetchData();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.response?.data?.error || '保存失败');
    }
  };

  const deleteQ = async (qid: string) => {
    try {
      await adminApi.delete(`/exams/questions/${qid}`);
      message.success('已删除');
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  // Audio upload uses AntD Upload w/ custom bearer header.
  const makeAudioUpload = (qid: string): UploadProps => ({
    name: 'audio',
    action: `/api/admin/exams/questions/${qid}/audio`,
    headers: { Authorization: `Bearer ${localStorage.getItem(ADMIN_TOKEN_KEY) || ''}` },
    accept: 'audio/*',
    showUploadList: false,
    onChange(info) {
      if (info.file.status === 'done') {
        message.success('音频已上传');
        fetchData();
      } else if (info.file.status === 'error') {
        message.error(info.file.response?.error || '上传失败');
      }
    },
  });

  const columns = [
    { title: '#', dataIndex: 'order', width: 60 },
    {
      title: '技能',
      dataIndex: 'skill',
      width: 100,
      render: (s: string) => <Tag color="blue">{s}</Tag>,
    },
    {
      title: '题型',
      dataIndex: 'type',
      width: 120,
      render: (t: string) => <Tag>{t}</Tag>,
    },
    {
      title: '题干',
      dataIndex: 'prompt',
      ellipsis: true,
      render: (p: string) => <span title={p}>{p.slice(0, 60)}</span>,
    },
    { title: '分值', dataIndex: 'points', width: 70 },
    {
      title: '音频',
      dataIndex: 'audioUrl',
      width: 80,
      render: (url?: string) =>
        url ? <CheckCircleTwoTone twoToneColor="#52c41a" /> : '—',
    },
    {
      title: '操作',
      width: 280,
      render: (_: unknown, q: Question) => (
        <Space>
          <Button size="small" onClick={() => openEditQ(q)}>编辑</Button>
          {q.skill === 'CO' && (
            <Upload {...makeAudioUpload(q.id)}>
              <Button size="small" icon={<SoundOutlined />}>
                {q.audioUrl ? '换音频' : '上传音频'}
              </Button>
            </Upload>
          )}
          <Popconfirm title="确定删除此题？" onConfirm={() => deleteQ(q.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const watchType = Form.useWatch('type', qForm);
  const watchSkill = Form.useWatch('skill', qForm);
  const needsOptions = !['FILL', 'ESSAY'].includes(watchType || 'SINGLE');

  if (loading || !exam) return <div>加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Title level={3} className="!mb-0">
          编辑套题
          <Tag color={exam.isPublished ? 'green' : 'orange'} className="ml-3">
            {exam.isPublished ? '已发布' : '草稿'}
          </Tag>
        </Title>
        <Button onClick={() => navigate('/admin/exams')}>返回列表</Button>
      </div>

      <Card title="套题信息" className="mb-4">
        <Form form={metaForm} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item name="title" label="标题" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="year" label="年份" rules={[{ required: true }]}>
              <InputNumber min={2000} max={2100} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="简介">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Space>
            <Form.Item name="isFreePreview" label="免费预览" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="isPublished" label="已发布" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={saveMeta}
            loading={savingMeta}
          >
            保存套题信息
          </Button>
        </Form>
      </Card>

      <Card
        title={`题目列表（${exam.questions.length}）`}
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateQ}>
            添加题目
          </Button>
        }
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={exam.questions}
          pagination={false}
          size="small"
        />
      </Card>

      <Modal
        title={editing ? '编辑题目' : '添加题目'}
        open={editorOpen}
        onCancel={() => setEditorOpen(false)}
        onOk={saveQ}
        okText="保存"
        cancelText="取消"
        width={760}
        destroyOnClose
      >
        <Form form={qForm} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Form.Item name="skill" label="技能" rules={[{ required: true }]}>
              <Select options={SKILLS} />
            </Form.Item>
            <Form.Item name="type" label="题型" rules={[{ required: true }]}>
              <Select options={TYPES} />
            </Form.Item>
            <Form.Item name="order" label="序号">
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="points" label="分值" rules={[{ required: true }]}>
              <InputNumber min={1} max={25} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item
            name="prompt"
            label="题干"
            rules={[{ required: true, message: '请输入题干' }]}
          >
            <Input.TextArea rows={2} />
          </Form.Item>

          <Form.Item
            name="passage"
            label={watchSkill === 'CO' ? '录音稿（转写文字，用户端隐藏）' : '原文 / 材料'}
          >
            <Input.TextArea rows={4} />
          </Form.Item>

          {watchSkill === 'CO' && (
            <Alert
              type="info"
              showIcon
              className="mb-3"
              message="音频文件请在保存后，通过题目列表的『上传音频』按钮上传。"
            />
          )}

          <Form.Item name="explanation" label="解析（答题后展示）">
            <Input.TextArea rows={2} />
          </Form.Item>

          {needsOptions && (
            <>
              <Divider orientation="left">选项</Divider>
              <Alert
                type="warning"
                className="mb-3"
                message={
                  watchType === 'MULTIPLE'
                    ? '多选题：至少 1 个正确选项，可多个'
                    : '单选 / 判断题：必须有且仅有 1 个正确选项'
                }
              />
              <Form.List name="options">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map((field) => (
                      <Space
                        key={field.key}
                        align="baseline"
                        className="flex w-full mb-2"
                      >
                        <Form.Item
                          {...field}
                          name={[field.name, 'label']}
                          rules={[{ required: true }]}
                          style={{ marginBottom: 0, width: 60 }}
                        >
                          <Input placeholder="A" maxLength={4} />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          name={[field.name, 'text']}
                          rules={[{ required: true }]}
                          style={{ marginBottom: 0, flex: 1, minWidth: 300 }}
                        >
                          <Input placeholder="选项内容" />
                        </Form.Item>
                        <Form.Item
                          {...field}
                          name={[field.name, 'isCorrect']}
                          valuePropName="checked"
                          style={{ marginBottom: 0 }}
                        >
                          <Switch checkedChildren="正确" unCheckedChildren="错误" />
                        </Form.Item>
                        <Button danger onClick={() => remove(field.name)}>
                          删除
                        </Button>
                      </Space>
                    ))}
                    <Button
                      type="dashed"
                      onClick={() =>
                        add({
                          label: String.fromCharCode(65 + fields.length),
                          text: '',
                          isCorrect: false,
                          order: fields.length,
                        })
                      }
                      icon={<PlusOutlined />}
                      block
                    >
                      添加选项
                    </Button>
                  </>
                )}
              </Form.List>
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
