import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Tag, Typography, message, Popconfirm, Select, Modal, Form, Input, InputNumber, Switch,
} from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import { PlusOutlined, ReloadOutlined, ImportOutlined, DeleteOutlined, EditOutlined } from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;

interface ExamRow {
  id: string;
  title: string;
  year: number;
  description?: string;
  isPublished: boolean;
  isFreePreview: boolean;
  totalQuestions: number;
  countsBySkill: Record<string, number>;
  createdAt: string;
}

export default function AdminExams() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = status === 'all' ? {} : { status };
      const { data } = await adminApi.get('/exams', { params });
      setRows(data.sets);
    } catch (e: any) {
      message.error(e.response?.data?.error || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); /* eslint-disable-next-line */ }, [status]);

  const createExam = async () => {
    try {
      const values = await form.validateFields();
      const { data } = await adminApi.post('/exams', values);
      message.success('套题已创建（草稿）');
      setCreateOpen(false);
      form.resetFields();
      navigate(`/admin/exams/${data.set.id}`);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e.response?.data?.error || '创建失败');
    }
  };

  const deleteExam = async (id: string) => {
    try {
      await adminApi.delete(`/exams/${id}`);
      message.success('已删除');
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.error || '删除失败');
    }
  };

  const togglePublish = async (row: ExamRow) => {
    try {
      await adminApi.put(`/exams/${row.id}`, { isPublished: !row.isPublished });
      message.success(row.isPublished ? '已下架' : '已发布');
      fetchData();
    } catch (e: any) {
      message.error(e.response?.data?.error || '更新失败');
    }
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      render: (t: string, row: ExamRow) => (
        <Link to={`/admin/exams/${row.id}`}>{t}</Link>
      ),
    },
    { title: '年份', dataIndex: 'year', width: 80 },
    {
      title: '题目分布',
      dataIndex: 'countsBySkill',
      render: (counts: Record<string, number>, row: ExamRow) => (
        <Space size={4} wrap>
          <Tag>共 {row.totalQuestions}</Tag>
          {Object.entries(counts).map(([k, v]) => (
            <Tag key={k} color="blue">{k}: {v}</Tag>
          ))}
        </Space>
      ),
    },
    {
      title: '状态',
      dataIndex: 'isPublished',
      width: 100,
      render: (pub: boolean) => (
        <Tag color={pub ? 'green' : 'orange'}>{pub ? '已发布' : '草稿'}</Tag>
      ),
    },
    {
      title: '免费预览',
      dataIndex: 'isFreePreview',
      width: 100,
      render: (v: boolean) => (v ? <Tag color="gold">是</Tag> : <Tag>否</Tag>),
    },
    {
      title: '操作',
      width: 260,
      render: (_: unknown, row: ExamRow) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => navigate(`/admin/exams/${row.id}`)}
          >
            编辑
          </Button>
          <Button size="small" onClick={() => togglePublish(row)}>
            {row.isPublished ? '下架' : '发布'}
          </Button>
          <Popconfirm
            title="确定删除？这会连同所有题目一起删除"
            onConfirm={() => deleteExam(row.id)}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <Title level={3} className="!mb-0">套题管理</Title>
        <Space>
          <Select
            value={status}
            onChange={(v) => setStatus(v)}
            style={{ width: 120 }}
            options={[
              { value: 'all', label: '全部' },
              { value: 'published', label: '已发布' },
              { value: 'draft', label: '草稿' },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => navigate('/admin/exams/import')}
          >
            JSON 批量导入
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setCreateOpen(true)}
          >
            新建套题
          </Button>
        </Space>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 20 }}
      />

      <Modal
        title="新建套题"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={createExam}
        okText="创建"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            year: new Date().getFullYear(),
            isPublished: false,
            isFreePreview: false,
          }}
        >
          <Form.Item
            name="title"
            label="标题"
            rules={[{ required: true, message: '请输入标题' }]}
          >
            <Input placeholder="如：DELF B2 仿真题 2024 · 第 1 套" />
          </Form.Item>
          <Form.Item
            name="year"
            label="年份"
            rules={[{ required: true }]}
          >
            <InputNumber min={2000} max={2100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="简介">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="isFreePreview" label="免费预览" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isPublished" label="立即发布" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
