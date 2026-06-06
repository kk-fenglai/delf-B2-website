import { useState } from 'react';
import {
  Card, Typography, Button, Space, message, Upload, Alert, Input, Tabs, Collapse, Segmented,
  Table, Tag,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  InboxOutlined, DownloadOutlined, CloudUploadOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useNavigate, Link } from 'react-router-dom';
import { adminApi } from '../../api/adminClient';

const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;

// JSON template shown to admins & used as the "download template" payload.
const TEMPLATE_LISTENING = {
  title: 'DELF B2 仿真题 2024 · 第 1 套',
  year: 2024,
  description: '听力（CO）专项练习',
  isPublished: false,
  isFreePreview: false,
  questions: [
    {
      skill: 'CO',
      type: 'SINGLE',
      order: 1,
      prompt: "D'après le document, quel est le sujet principal ?",
      // 录音稿仅供后台/AI 解析使用 —— 后端 /api/exams/:id 返回 CO 题时会
      // 把 passage 剔除，确保前端考试中看不到原文。复习页（已交卷后）才会展示。
      passage: '[录音稿转写文字，仅后台保存]',
      audioUrl: null,
      explanation: '说话人在开头提到...',
      points: 2,
      options: [
        { label: 'A', text: '环境保护', isCorrect: true, order: 0 },
        { label: 'B', text: '经济发展', isCorrect: false, order: 1 },
        { label: 'C', text: '科技创新', isCorrect: false, order: 2 },
        { label: 'D', text: '文化艺术', isCorrect: false, order: 3 },
      ],
    },
  ],
};

const TEMPLATE_READING = {
  ...TEMPLATE_LISTENING,
  description: '阅读（CE）专项练习',
  questions: [
    {
      skill: 'CE',
      type: 'MULTIPLE',
      order: 1,
      prompt: 'Selon le texte, quelles sont les mesures proposées ?（多选）',
      passage: 'Ceci est un long texte... （800–1500 词的阅读材料）',
      explanation: '第 2、3 段明确提到...',
      points: 3,
      options: [
        { label: 'A', text: '减少排放', isCorrect: true, order: 0 },
        { label: 'B', text: '提高税收', isCorrect: true, order: 1 },
        { label: 'C', text: '禁止汽车', isCorrect: false, order: 2 },
        { label: 'D', text: '植树造林', isCorrect: false, order: 3 },
      ],
    },
  ],
};

const TEMPLATE_WRITING = {
  ...TEMPLATE_LISTENING,
  description: '写作（PE）专项练习',
  questions: [
    {
      skill: 'PE',
      type: 'ESSAY',
      order: 1,
      prompt: 'Rédigez un essai argumenté sur... (250 mots minimum).',
      points: 25,
      options: [],
    },
  ],
};

const TEMPLATE_SPEAKING = {
  ...TEMPLATE_LISTENING,
  description: '口语（PO）专项练习（SPEAKING）',
  questions: [
    {
      skill: 'PO',
      type: 'SPEAKING',
      order: 1,
      prompt: 'Monologue: Présentez et défendez votre point de vue sur ... (3–5 min).',
      passage: '（可选）给考生的材料/提示点（前台可见）',
      points: 25,
      options: [],
      followUps: [
        { order: 0, text: 'Pourquoi pensez-vous que ... ?', expectedAngle: '鼓励举例 + 对比观点' },
        { order: 1, text: 'Que diriez-vous à quelqu’un qui n’est pas d’accord ?', expectedAngle: '反驳 + 让步结构' },
      ],
    },
  ],
};

const TEMPLATE_MOCK = {
  title: 'DELF B2 仿真题 2024 · 第 1 套（全真模拟）',
  year: 2024,
  description: '听 + 读 + 写 + 口 完整一套（全真模拟）',
  isPublished: false,
  isFreePreview: false,
  questions: [
    ...TEMPLATE_LISTENING.questions,
    ...TEMPLATE_READING.questions.map((q) => ({ ...q, order: 2 })),
    ...TEMPLATE_WRITING.questions.map((q) => ({ ...q, order: 3 })),
    ...TEMPLATE_SPEAKING.questions.map((q) => ({ ...q, order: 4 })),
  ],
};

const FIELD_REFERENCE = `
顶层字段
  title           必填，套题标题（勿写考试年月/场次，如「DELF B2 写作 · 主题名」）
  year            可选，仅后台排序用，不会展示给学员
  description     可选，简介
  isPublished     可选，默认 false（草稿）
  isFreePreview   可选，默认 false
  questions       必填数组，≥1 项

每道题字段
  skill         必填：CO / CE / PE / PO
  type          必填：SINGLE / MULTIPLE / TRUE_FALSE / FILL / ESSAY / SPEAKING
  order         可选，整数序号（省略则按数组顺序）
  prompt        必填，题干
  passage       可选，阅读材料 / 录音稿
  audioUrl      可选，听力题音频路径（导入后可再通过 UI 上传 MP3）
  explanation   可选，答题后展示的解析
  points        必填，整数分值 1–25
  options       选择/判断题必填，FILL/ESSAY/SPEAKING 必须为空数组
  followUps     仅 SPEAKING 使用，数组，≥1（débat 提问列表）

选项字段
  label         必填（A / B / C / V / F）
  text          必填
  isCorrect     必填 boolean
  order         可选，展示顺序

口语 followUp 字段（仅 SPEAKING）
  order         可选，展示顺序
  text          必填，考官追问原文（FR）
  audioUrl      可选，追问预录音频（可留空）
  expectedAngle 可选，评分参考方向（不展示给学生）

业务规则
  SINGLE, TRUE_FALSE: 必须恰好 1 个 isCorrect=true
  MULTIPLE          : 至少 1 个 isCorrect=true
  FILL, ESSAY       : options 必须为空
  SPEAKING          : skill 必须为 PO；options 必须为空；followUps 至少 1 条
`.trim();

export default function AdminExamImport() {
  const navigate = useNavigate();
  const [moduleKey, setModuleKey] = useState<'listening' | 'reading' | 'writing' | 'speaking' | 'mock'>('mock');
  const moduleTemplate = (() => {
    switch (moduleKey) {
      case 'listening': return TEMPLATE_LISTENING;
      case 'reading': return TEMPLATE_READING;
      case 'writing': return TEMPLATE_WRITING;
      case 'speaking': return TEMPLATE_SPEAKING;
      case 'mock':
      default: return TEMPLATE_MOCK;
    }
  })();
  const [jsonText, setJsonText] = useState(JSON.stringify(moduleTemplate, null, 2));
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('paste');

  const downloadTemplate = () => {
    const blob = new Blob(
      [JSON.stringify(moduleTemplate, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `delf-${moduleKey}-template.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Local validation so we can flag syntax errors before hitting the server.
  const validateJson = (): unknown | null => {
    try {
      const parsed = JSON.parse(jsonText);
      setParseError(null);
      return parsed;
    } catch (e: any) {
      setParseError(e.message);
      return null;
    }
  };

  const submit = async () => {
    const parsed = validateJson();
    if (!parsed) {
      message.error('JSON 格式错误');
      return;
    }
    // 全真模拟必须包含 CO / CE / PE / PO 四个 skill
    if (moduleKey === 'mock') {
      const questions = (parsed as any).questions ?? [];
      const skills = new Set<string>(questions.map((q: any) => q.skill));
      const missing = ['CO', 'CE', 'PE', 'PO'].filter((s) => !skills.has(s));
      if (missing.length > 0) {
        message.error(`全真模拟必须包含四个板块，当前缺少：${missing.join('、')}`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const { data } = await adminApi.post('/exams/import', parsed);
      message.success(`导入成功：${data.questionCount} 道题`);
      navigate(`/admin/exams/${data.set.id}`);
    } catch (e: any) {
      const details = e.response?.data?.details;
      if (details && Array.isArray(details)) {
        message.error(
          `校验失败：${details.slice(0, 3).map((d: any) => `${d.path?.join('.')} ${d.message}`).join('; ')}`
        );
      } else {
        message.error(e.response?.data?.error || '导入失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Batch upload (multiple files, one exam set per file) ----
  type BatchStatus = 'ready' | 'parse-error' | 'skipped' | 'importing' | 'success' | 'error';
  interface BatchItem {
    uid: string;
    name: string;
    status: BatchStatus;
    title?: string;
    year?: number;
    questionCount?: number;
    message?: string;
    setId?: string;
    parsed?: any;
  }
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);

  const updateItem = (uid: string, patch: Partial<BatchItem>) =>
    setBatchItems((prev) => prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));

  const batchUploadProps: UploadProps = {
    accept: '.json,application/json',
    multiple: true,
    showUploadList: false,
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target?.result || '');
        const uid = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try {
          const parsed = JSON.parse(text);
          setBatchItems((prev) => [...prev, {
            uid,
            name: file.name,
            status: 'ready',
            title: parsed.title,
            year: parsed.year,
            questionCount: Array.isArray(parsed.questions) ? parsed.questions.length : 0,
            parsed,
          }]);
        } catch (err: any) {
          setBatchItems((prev) => [...prev, {
            uid, name: file.name, status: 'parse-error', message: err.message,
          }]);
        }
      };
      reader.readAsText(file);
      return false; // never auto-upload; we POST via runBatchImport
    },
  };

  // Sequentially import every parsed file. Dedupe by title (+ year when present).
  const runBatchImport = async () => {
    const targets = batchItems.filter((it) => it.status === 'ready' || it.status === 'error');
    if (targets.length === 0) {
      message.info('没有可导入的文件');
      return;
    }
    setBatchRunning(true);
    try {
      let existingKeys = new Set<string>();
      try {
        const { data } = await adminApi.get('/exams');
        existingKeys = new Set((data.sets || []).map((s: any) => `${s.title}|${s.year ?? ''}`));
      } catch {
        message.warning('无法获取已有套题列表，本次跳过去重检查');
      }

      for (const it of targets) {
        const key = `${it.parsed?.title}|${it.parsed?.year ?? ''}`;
        if (existingKeys.has(key)) {
          updateItem(it.uid, { status: 'skipped', message: '同名套题已存在，已跳过' });
          continue;
        }
        updateItem(it.uid, { status: 'importing', message: undefined });
        try {
          const { data } = await adminApi.post('/exams/import', it.parsed);
          existingKeys.add(key); // guard against duplicates within the same batch
          updateItem(it.uid, {
            status: 'success', setId: data.set.id, questionCount: data.questionCount, message: undefined,
          });
        } catch (e: any) {
          const details = e.response?.data?.details;
          const msg = details && Array.isArray(details)
            ? details.slice(0, 2).map((d: any) => `${d.path?.join('.')} ${d.message}`).join('; ')
            : (e.response?.data?.error || '导入失败');
          updateItem(it.uid, { status: 'error', message: msg });
        }
      }
      const done = batchItems.length;
      message.success(`批量导入完成（共 ${done} 个文件，详见下方状态）`);
    } finally {
      setBatchRunning(false);
    }
  };

  const batchCounts = batchItems.reduce(
    (acc, it) => { acc[it.status] = (acc[it.status] || 0) + 1; return acc; },
    {} as Record<BatchStatus, number>,
  );

  const uploadProps: UploadProps = {
    accept: '.json,application/json',
    beforeUpload: (file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target?.result || '');
        setJsonText(text);
        try {
          JSON.parse(text);
          setParseError(null);
          message.success(`已加载 ${file.name}，请点击"提交导入"`);
          setActiveTab('paste');
        } catch (err: any) {
          setParseError(err.message);
          message.error('JSON 解析失败，请检查格式');
        }
      };
      reader.readAsText(file);
      return false; // Don't upload automatically; we send via submit()
    },
    showUploadList: false,
    multiple: false,
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Title level={3} className="!mb-0">
          <CloudUploadOutlined className="mr-2" />
          题目上传（5 个板块）
        </Title>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
            下载 JSON 模板
          </Button>
          <Button onClick={() => navigate('/admin/exams')}>返回列表</Button>
        </Space>
      </div>

      <Card className="mb-4">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <Text strong>选择要上传的板块：</Text>
              <Text type="secondary" className="ml-2">（全真模拟 = 同一套题里同时包含 CO/CE/PE/PO）</Text>
            </div>
            <Segmented
              value={moduleKey}
              onChange={(v) => {
                const next = v as any;
                setModuleKey(next);
                const tmpl = (() => {
                  switch (next) {
                    case 'listening': return TEMPLATE_LISTENING;
                    case 'reading': return TEMPLATE_READING;
                    case 'writing': return TEMPLATE_WRITING;
                    case 'speaking': return TEMPLATE_SPEAKING;
                    case 'mock':
                    default: return TEMPLATE_MOCK;
                  }
                })();
                setJsonText(JSON.stringify(tmpl, null, 2));
                setParseError(null);
              }}
              options={[
                { label: '听力', value: 'listening' },
                { label: '阅读', value: 'reading' },
                { label: '写作', value: 'writing' },
                { label: '口语', value: 'speaking' },
                { label: '全真模拟', value: 'mock' },
              ]}
            />
          </div>
          <Alert
            type="info"
            showIcon
            message="提示"
            description={
              <div>
                <div>你可以为任意板块上传一套“套题”。前台练习会按题目中的 <Text code>skill</Text> 自动分流。</div>
                <div>听力题（CO）的 MP3：先导入 JSON，再到套题详情页对每道 CO 题单独上传音频。</div>
                <div>口语题：请用 <Text code>type=SPEAKING</Text> 并提供 <Text code>followUps</Text>（至少 1 条）。</div>
              </div>
            }
          />
        </Space>
      </Card>

      <Alert
        type="info"
        showIcon
        className="mb-4"
        message="批量导入工作流"
        description={
          <ol className="mb-0 pl-4">
            <li>下载 JSON 模板 → 按格式填好所有题目</li>
            <li>上传 JSON 文件（或直接把内容粘贴到下方编辑器）</li>
            <li>点击"提交导入"，系统校验后一次性创建整套题（事务保证原子性）</li>
            <li>导入成功后，听力题的 MP3 在详情页单独上传</li>
            <li>默认为 <Text code>草稿</Text> 状态，确认无误后手动发布</li>
          </ol>
        }
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'paste',
            label: '粘贴 / 编辑 JSON',
            children: (
              <Card>
                {parseError && (
                  <Alert
                    type="error"
                    className="mb-3"
                    message="JSON 格式错误"
                    description={parseError}
                    showIcon
                  />
                )}
                <Input.TextArea
                  rows={20}
                  value={jsonText}
                  onChange={(e) => setJsonText(e.target.value)}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  onBlur={validateJson}
                />
                <div className="mt-3 flex justify-end gap-2">
                  <Button onClick={() => setJsonText(JSON.stringify(moduleTemplate, null, 2))}>
                    重置为模板
                  </Button>
                  <Button onClick={validateJson}>仅校验 JSON</Button>
                  <Button
                    type="primary"
                    loading={submitting}
                    icon={<CloudUploadOutlined />}
                    onClick={submit}
                    disabled={!!parseError}
                  >
                    提交导入
                  </Button>
                </div>
              </Card>
            ),
          },
          {
            key: 'upload',
            label: '上传 JSON 文件',
            children: (
              <Card>
                <Dragger {...uploadProps} style={{ padding: 24 }}>
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽 .json 文件到此处</p>
                  <p className="ant-upload-hint">
                    上传后将加载到"粘贴编辑"页签，再点击提交导入
                  </p>
                </Dragger>
              </Card>
            ),
          },
          {
            key: 'batch',
            label: '批量上传（多文件）',
            children: (
              <Card>
                <Alert
                  type="info"
                  showIcon
                  className="mb-3"
                  message="一次拖入多个 .json 文件（每个文件 = 一套题）"
                  description="逐个导入，互不影响；同名（标题）+ 同年份的套题会自动跳过，可安全重跑。导入默认为草稿状态。"
                />
                <Dragger {...batchUploadProps} style={{ padding: 24 }} disabled={batchRunning}>
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">点击或拖拽多个 .json 文件到此处</p>
                  <p className="ant-upload-hint">支持一次选择多个文件，例如全部 oral-*.import.json</p>
                </Dragger>

                {batchItems.length > 0 && (
                  <>
                    <div className="mt-3 mb-2 flex items-center justify-between flex-wrap gap-2">
                      <Space size={8} wrap>
                        <Text>共 {batchItems.length} 个文件</Text>
                        {batchCounts.success ? <Tag color="green">成功 {batchCounts.success}</Tag> : null}
                        {batchCounts.skipped ? <Tag color="gold">跳过 {batchCounts.skipped}</Tag> : null}
                        {batchCounts.error ? <Tag color="red">失败 {batchCounts.error}</Tag> : null}
                        {batchCounts['parse-error'] ? <Tag color="red">JSON错误 {batchCounts['parse-error']}</Tag> : null}
                      </Space>
                      <Space>
                        <Button onClick={() => setBatchItems([])} disabled={batchRunning}>清空列表</Button>
                        <Button
                          type="primary"
                          icon={<CloudUploadOutlined />}
                          loading={batchRunning}
                          onClick={runBatchImport}
                          disabled={!batchItems.some((it) => it.status === 'ready' || it.status === 'error')}
                        >
                          开始批量导入
                        </Button>
                      </Space>
                    </div>
                    <Table<BatchItem>
                      size="small"
                      rowKey="uid"
                      pagination={false}
                      dataSource={batchItems}
                      columns={[
                        { title: '文件', dataIndex: 'name', ellipsis: true },
                        { title: '标题', dataIndex: 'title', ellipsis: true, render: (v) => v || '—' },
                        { title: '年份', dataIndex: 'year', width: 80, render: (v) => v ?? '—' },
                        { title: '题数', dataIndex: 'questionCount', width: 70, render: (v) => v ?? '—' },
                        {
                          title: '状态', dataIndex: 'status', width: 100,
                          render: (s: BatchStatus) => {
                            const map: Record<BatchStatus, { color: string; label: string }> = {
                              'ready': { color: 'default', label: '待导入' },
                              'parse-error': { color: 'red', label: 'JSON错误' },
                              'importing': { color: 'processing', label: '导入中' },
                              'success': { color: 'green', label: '成功' },
                              'skipped': { color: 'gold', label: '已跳过' },
                              'error': { color: 'red', label: '失败' },
                            };
                            return <Tag color={map[s].color}>{map[s].label}</Tag>;
                          },
                        },
                        {
                          title: '说明', dataIndex: 'message',
                          render: (msg: string | undefined, row) => row.status === 'success' && row.setId
                            ? <Link to={`/admin/exams/${row.setId}`}>查看套题 →</Link>
                            : (msg || ''),
                        },
                      ]}
                    />
                  </>
                )}
              </Card>
            ),
          },
        ]}
      />

      <Collapse
        className="mt-4"
        items={[
          {
            key: 'ref',
            label: (
              <span><FileTextOutlined /> 字段说明 / 业务规则</span>
            ),
            children: (
              <div>
                <Paragraph>
                  <Text strong>JSON 结构参考：</Text>
                </Paragraph>
                <pre
                  style={{
                    background: '#f5f5f5',
                    padding: 12,
                    borderRadius: 4,
                    fontSize: 12,
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'monospace',
                  }}
                >
                  {FIELD_REFERENCE}
                </pre>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
