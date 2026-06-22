import { Typography } from 'antd';
import { useTranslation } from 'react-i18next';
import ExamGuideContent from '../components/ExamGuideContent';

const { Title, Paragraph } = Typography;

export default function ExamGuide() {
  const { t } = useTranslation();
  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center py-8">
        <Title level={1} style={{ color: '#1A3A5C', marginBottom: 8 }}>{t('examGuide.title')}</Title>
        <Paragraph className="text-lg text-gray-600">{t('examGuide.subtitle')}</Paragraph>
      </div>
      <ExamGuideContent />
    </div>
  );
}
