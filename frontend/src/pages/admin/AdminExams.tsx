import { useEffect, useState } from 'react';
import {
  Table, Button, Space, Tag, Typography, message, Popconfirm, Select,
  Modal, Form, Input, Switch, Tabs, Badge, Tooltip,
} from 'antd';
import { Link, useNavigate } from 'react-router-dom';
import {
  PlusOutlined, ReloadOutlined, ImportOutlined, DeleteOutlined, EditOutlined,
  AudioOutlined, ReadOutlined, EditFilled, CustomerServiceOutlined, TrophyOutlined,
} from '@ant-design/icons';
import { adminApi } from '../../api/adminClient';

const { Title } = Typography;

interface ExamRow {
  id: string;
  title: string;
  year?: number | null;
  description?: string;
  isPublished: boolean;
  isFreePreview: boolean;
  totalQuestions: number;
  countsBySkill: Record<string, number>;
  createdAt: string;
}

type Section = 'CO' | 'CE' | 'PE' | 'PO' | 'mock';

const MOCK_SKILLS = ['CO', 'CE', 'PE', 'PO'];

function inferSection(row: ExamRow): Section {
  const skills = Object.keys(row.countsBySkill).filter((k) => row.countsBySkill[k] > 0);
  if (skills.length === 1) return skills[0] as Section;
  if (MOCK_SKILLS.every((s) => (row.countsBySkill[s] ?? 0) > 0)) return 'mock';
  return 'mock'; // 不满足四个 skill 的异常情况也归入全真模拟兜底
}

const SECTIONS: { key: Section; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'CO',   label: '听力',     icon: <AudioOutlined />,           color: 'blue'   },
  { key: 'CE',   label: '阅读',     icon: <ReadOutlined />,            color: 'green'  },
  { key: 'PE',   label: '写作',     icon: <EditFilled />,              color: 'purple' },
  { key: 'PO',   label: '口语',     icon: <CustomerServiceOutlined />, color: 'orange' },
  { key: 'mock', label: '全真模拟', icon: <TrophyOutlined />,          color: 'red'    },
];

export default function AdminExams() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<ExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [activeSection, setActiveSection] = useState<Section>('CO');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
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
      // 年份可选：主题类口语题无考试年份，不再用当前年兜底。
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

  // Batch publish/unpublish the selected sets in the current module. Loops over
  // the existing PUT endpoint (no backend change); only touches rows whose state
  // actually differs, and reports partial success.
  const bulkSetPublish = async (publish: boolean) => {
    const targets = rows.filter(
      (r) => selectedKeys.includes(r.id)
        && inferSection(r) === activeSection
        && r.isPublished !== publish,
    );
    if (targets.length === 0) {
      message.info(publish ? '所选套题均已发布' : '所选套题均为草稿');
      return;
    }
    setBulkRunning(true);
    let ok = 0;
    let fail = 0;
    for (const r of targets) {
      try {
        await adminApi.put(`/exams/${r.id}`, { isPublished: publish });
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    setBulkRunning(false);
    const verb = publish ? '发布' : '下架';
    message[fail ? 'warning' : 'success'](`批量${verb}完成：成功 ${ok}${fail ? `，失败 ${fail}` : ''}`);
    setSelectedKeys([]);
    fetchData();
  };

  const columns = [
    {
      title: '标题',
      dataIndex: 'title',
      render: (t: string, row: ExamRow) => (
        <Link to={`/admin/exams/${row.id}`}>{t}</Link>
      ),
    },
    {
      title: '简介',
      dataIndex: 'description',
      width: 280,
      ellipsis: { showTitle: false },
      render: (d?: string) =>
        d ? (
          <Tooltip title={d} placement="topLeft">
            <span className="text-gray-500">{d}</span>
          </Tooltip>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
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

  const sectionRows = rows.filter((r) => inferSection(r) === activeSection);

  const tabItems = SECTIONS.map(({ key, label, icon, color }) => {
    const count = rows.filter((r) => inferSection(r) === key).length;
    return {
      key,
      label: (
        <Space size={6}>
          {icon}
          {label}
          <Badge
            count={count}
            showZero
            style={{ backgroundColor: count > 0 ? color : '#d9d9d9' }}
          />
        </Space>
      ),
    };
  });

  return (
    <div>
      <div className="admin-page-header">
        <Title level={3} className="!mb-0">套题管理</Title>
        <Space wrap>
          <Select
            value={status}
            onChange={(v) => setStatus(v)}
            style={{ width: 120 }}
            options={[
              { value: 'all',       label: '全部状态' },
              { value: 'published', label: '已发布'   },
              { value: 'draft',     label: '草稿'     },
            ]}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
          <Button
            icon={<ImportOutlined />}
            onClick={() => navigate('/admin/exams/import')}
          >
            题目上传 / JSON 导入
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

      <Tabs
        activeKey={activeSection}
        onChange={(k) => { setActiveSection(k as Section); setSelectedKeys([]); }}
        items={tabItems}
        className="mb-4"
      />

      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-gray-500">
          {selectedKeys.length > 0 ? `已选 ${selectedKeys.length} 项` : '勾选左侧复选框可批量操作本模块套题'}
        </span>
        <Popconfirm
          title={`确定批量发布所选 ${selectedKeys.length} 套题？发布后学员立即可见`}
          onConfirm={() => bulkSetPublish(true)}
          disabled={selectedKeys.length === 0 || bulkRunning}
        >
          <Button
            type="primary"
            size="small"
            loading={bulkRunning}
            disabled={selectedKeys.length === 0}
          >
            批量发布
          </Button>
        </Popconfirm>
        <Popconfirm
          title={`确定批量下架所选 ${selectedKeys.length} 套题？`}
          onConfirm={() => bulkSetPublish(false)}
          disabled={selectedKeys.length === 0 || bulkRunning}
        >
          <Button size="small" disabled={selectedKeys.length === 0}>批量下架</Button>
        </Popconfirm>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={sectionRows}
        pagination={{ pageSize: 20 }}
        locale={{ emptyText: `暂无${SECTIONS.find(s => s.key === activeSection)?.label}套题` }}
        rowSelection={{
          selectedRowKeys: selectedKeys,
          onChange: (keys) => setSelectedKeys(keys as string[]),
        }}
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
