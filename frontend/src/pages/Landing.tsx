import { Button, Card, Col, Row, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

export default function Landing() {
  const { t } = useTranslation();

  const features = [
    { icon: '🎧', title: t('landing.features.co.title'), desc: t('landing.features.co.desc') },
    { icon: '📖', title: t('landing.features.ce.title'), desc: t('landing.features.ce.desc') },
    { icon: '✍️', title: t('landing.features.pe.title'), desc: t('landing.features.pe.desc') },
    { icon: '🎙️', title: t('landing.features.po.title'), desc: t('landing.features.po.desc') },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center py-16">
        <Title level={1} style={{ color: '#1A3A5C', marginBottom: 8 }}>
          {t('landing.title')}
        </Title>
        <Paragraph className="text-lg text-gray-600 mb-8">{t('landing.subtitle')}</Paragraph>
        <div className="flex gap-3 justify-center">
          <Link to="/register">
            <Button type="primary" size="large">{t('landing.ctaStart')}</Button>
          </Link>
          <Link to="/pricing">
            <Button size="large">{t('landing.ctaPricing')}</Button>
          </Link>
        </div>
      </div>

      <Row gutter={[16, 16]} className="mb-12">
        {features.map((f) => (
          <Col xs={24} sm={12} md={6} key={f.title}>
            <Card hoverable className="h-full text-center">
              <div className="text-5xl mb-2">{f.icon}</div>
              <Title level={4}>{f.title}</Title>
              <Paragraph className="text-gray-500">{f.desc}</Paragraph>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="mb-12">
        <Title level={3}>{t('landing.examStructure')}</Title>
        <Row gutter={16}>
          <Col span={6}><strong>{t('skill.CO')}</strong><br/>~30 {t('landing.minutes')} · 25 {t('landing.points')}</Col>
          <Col span={6}><strong>{t('skill.CE')}</strong><br/>~60 {t('landing.minutes')} · 25 {t('landing.points')}</Col>
          <Col span={6}><strong>{t('skill.PE')}</strong><br/>~60 {t('landing.minutes')} · 25 {t('landing.points')}</Col>
          <Col span={6}><strong>{t('skill.PO')}</strong><br/>~20 {t('landing.minutes')} · 25 {t('landing.points')}</Col>
        </Row>
        <Paragraph className="mt-4 text-gray-500">{t('landing.passRule')}</Paragraph>
      </Card>
    </div>
  );
}
