import { useState } from 'react';
import {
  Card, Typography, Button, Space, message, Upload, Alert, Input, Tabs, Collapse,
} from 'antd';
import type { UploadProps } from 'antd';
import {
  InboxOutlined, DownloadOutlined, CloudUploadOutlined, FileTextOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { adminApi } from '../../api/adminClient';

const { Title, Paragraph, Text } = Typography;
const { Dragger } = Upload;

// JSON template shown to admins & used as the "download template" payload.
const JSON_TEMPLATE = {
  title: 'DELF B2 仿真题 2024 · 第 1 套',
  year: 2024,
  description: '听 + 读 + 写 完整一套',
  isPublished: false,
  isFreePreview: false,
  questions: [
    {
      skill: 'CO',
      type: 'SINGLE',
      order: 1,
      prompt: "D'après le document, quel est le sujet principal ?",
      passage: '[录音稿转写文字，用户端不会看到]',
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
    {
      skill: 'CE',
      type: 'MULTIPLE',
      order: 2,
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
    {
      skill: 'PE',
      type: 'ESSAY',
      order: 3,
      prompt: 'Rédigez un essai argumenté sur... (250 mots minimum).',
      points: 25,
      options: [],
    },
  ],
};

const FIELD_REFERENCE = `
顶层字段
  title           必填，套题标题
  year            必填，整数年份
  description     可选，简介
  isPublished     可选，默认 false（草稿）
  isFreePreview   可选，默认 false
  questions       必填数组，≥1 项

每道题字段
  skill         必填：CO / CE / PE / PO
  type          必填：SINGLE / MULTIPLE / TRUE_FALSE / FILL / ESSAY
  order         可选，整数序号（省略则按数组顺序）
  prompt        必填，题干
  passage       可选，阅读材料 / 录音稿
  audioUrl      可选，听力题音频路径（导入后可再通过 UI 上传 MP3）
  explanation   可选，答题后展示的解析
  points        必填，整数分值 1–25
  options       选择/判断题必填，FILL/ESSAY 必须为空数组

选项字段
  label         必填（A / B / C / V / F）
  text          必填
  isCorrect     必填 boolean
  order         可选，展示顺序

业务规则
  SINGLE, TRUE_FALSE: 必须恰好 1 个 isCorrect=true
  MULTIPLE          : 至少 1 个 isCorrect=true
  FILL, ESSAY       : options 必须为空
`.trim();

export default function AdminExamImport() {
  const navigate = useNavigate();
  const [jsonText, setJsonText] = useState(JSON.stringify(JSON_TEMPLATE, null, 2));
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const downloadTemplate = () => {
    const blob = new Blob(
      [JSON.stringify(JSON_TEMPLATE, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'delf-exam-template.json';
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
          message.success(`已加载 ${file.name}`);
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
          JSON 批量导入题目
        </Title>
        <Space>
          <Button icon={<DownloadOutlined />} onClick={downloadTemplate}>
            下载 JSON 模板
          </Button>
          <Button onClick={() => navigate('/admin/exams')}>返回列表</Button>
        </Space>
      </div>

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
        defaultActiveKey="paste"
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
                  <Button onClick={() => setJsonText(JSON.stringify(JSON_TEMPLATE, null, 2))}>
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
