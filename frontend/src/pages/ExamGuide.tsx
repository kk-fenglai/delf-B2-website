import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import ExamGuideContent from '../components/ExamGuideContent';
import { useLevelStore } from '../stores/level';

const { Title, Paragraph } = Typography;

export default function ExamGuide() {
  const { t } = useTranslation();
  const level = useLevelStore((s) => s.level);
  const system = useLevelStore((s) => s.system);
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center py-8">
        <Title level={1} style={{ color: '#1A3A5C', marginBottom: 8 }}>{system === 'TCF' ? t('examGuide.tcfTitle') : t('examGuide.title', { level })}</Title>
        <Paragraph className="text-lg text-gray-600">{t('examGuide.subtitle')}</Paragraph>
      </div>
      <ExamGuideContent />
    </div>
  );
}
