import { Button, Card, Col, Row, Typography } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

export default function Landing() {
  const { t } = useTranslation();

  const features = [
    { icon: '🎧', title: t('landing.features.co.title'), desc: t('landing.features.co.desc'), to: '/practice/listening' },
    { icon: '📖', title: t('landing.features.ce.title'), desc: t('landing.features.ce.desc'), to: '/practice/reading' },
    { icon: '✍️', title: t('landing.features.pe.title'), desc: t('landing.features.pe.desc'), to: '/practice/writing' },
    { icon: '🎙️', title: t('landing.features.po.title'), desc: t('landing.features.po.desc'), to: '/practice/speaking' },
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

      <Row gutter={[16, 16]} className="mb-6">
        {features.map((f) => (
          <Col xs={24} sm={12} md={6} key={f.title}>
            <Link to={f.to}>
              <Card hoverable className="h-full text-center">
                <div className="text-5xl mb-2">{f.icon}</div>
                <Title level={4}>{f.title}</Title>
                <Paragraph className="text-gray-500">{f.desc}</Paragraph>
              </Card>
            </Link>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} className="mb-12">
        <Col xs={24}>
          <Link to="/practice/mock">
            <Card hoverable className="text-center" style={{ borderColor: '#1A3A5C' }}>
              <div className="flex items-center justify-center gap-4 flex-wrap">
                <div className="text-5xl">📝</div>
                <div className="text-left">
                  <Title level={3} style={{ marginBottom: 4 }}>
                    {t('landing.mockTitle')}
                  </Title>
                  <Paragraph className="text-gray-500 mb-0">{t('landing.mockDesc')}</Paragraph>
                </div>
              </div>
            </Card>
          </Link>
        </Col>
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
