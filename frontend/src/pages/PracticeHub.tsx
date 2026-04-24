import { Card, Col, Row, Typography, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

type HubEntry = {
  icon: string;
  titleKey: string;
  descKey: string;
  to: string;
  tagKey?: string;
  tagColor?: string;
};

const entries: HubEntry[] = [
  { icon: '🎧', titleKey: 'skill.CO', descKey: 'practice.hub.coDesc', to: '/practice/listening' },
  { icon: '📖', titleKey: 'skill.CE', descKey: 'practice.hub.ceDesc', to: '/practice/reading' },
  { icon: '✍️', titleKey: 'skill.PE', descKey: 'practice.hub.peDesc', to: '/practice/writing' },
  {
    icon: '🎙️',
    titleKey: 'skill.PO',
    descKey: 'practice.hub.poDesc',
    to: '/practice/speaking',
    tagKey: 'practice.hub.comingSoonTag',
    tagColor: 'orange',
  },
];

const mockEntry: HubEntry = {
  icon: '📝',
  titleKey: 'practice.hub.mockTitle',
  descKey: 'practice.hub.mockDesc',
  to: '/practice/mock',
  tagKey: 'practice.hub.mockTag',
  tagColor: 'blue',
};

export default function PracticeHub() {
  const { t } = useTranslation();

  const renderCard = (e: HubEntry) => (
    <Link to={e.to} className="block h-full">
      <Card hoverable bordered={false} className="h-full text-center app-surface">
        <div className="text-5xl mb-2">{e.icon}</div>
        <div className="flex justify-center items-center gap-2 mb-1">
          <Title level={4} style={{ marginBottom: 0 }}>
            {t(e.titleKey)}
          </Title>
          {e.tagKey && <Tag color={e.tagColor}>{t(e.tagKey)}</Tag>}
        </div>
        <Paragraph className="text-muted mb-0">{t(e.descKey)}</Paragraph>
      </Card>
    </Link>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <Title level={2}>{t('practice.hub.title')}</Title>
      <Paragraph className="text-gray-500">{t('practice.hub.subtitle')}</Paragraph>

      <Row gutter={[16, 16]} className="mb-8">
        {entries.map((e) => (
          <Col xs={24} sm={12} md={6} key={e.to}>
            {renderCard(e)}
          </Col>
        ))}
      </Row>

      <Title level={3} className="mt-8">
        {t('practice.hub.mockSectionTitle')}
      </Title>
      <Row gutter={[16, 16]}>
        <Col xs={24}>{renderCard(mockEntry)}</Col>
      </Row>
    </div>
  );
}
