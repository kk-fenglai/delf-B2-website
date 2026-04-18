import { Card, Col, Row, Typography, Button, Tag, List } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

const planKeys = [
  { key: 'free', link: '/register', highlight: false },
  { key: 'standard', link: '/pricing', highlight: false },
  { key: 'ai', link: '/pricing', highlight: true },
  { key: 'ai_unlimited', link: '/pricing', highlight: false },
] as const;

export default function Pricing() {
  const { t } = useTranslation();

  return (
    <div className="max-w-6xl mx-auto">
      <div className="text-center mb-8">
        <Title level={2}>{t('pricing.title')}</Title>
        <Paragraph className="text-gray-500">{t('pricing.subtitle')}</Paragraph>
      </div>

      <Row gutter={[16, 16]}>
        {planKeys.map((p) => {
          const features = t(`pricing.plans.${p.key}.features`, { returnObjects: true }) as string[];
          return (
            <Col xs={24} sm={12} lg={6} key={p.key}>
              <Card
                className="h-full"
                style={p.highlight ? { border: '2px solid #1A3A5C' } : {}}
                title={
                  <div className="flex items-center gap-2">
                    {t(`pricing.plans.${p.key}.name`)}
                    {p.highlight && <Tag color="gold">{t('pricing.popular')}</Tag>}
                  </div>
                }
              >
                <div className="mb-4">
                  <span className="text-3xl font-bold text-brand">
                    {t(`pricing.plans.${p.key}.price`)}
                  </span>
                  <span className="text-gray-500 ml-1">
                    {t(`pricing.plans.${p.key}.period`)}
                  </span>
                </div>
                <List
                  size="small"
                  dataSource={Array.isArray(features) ? features : []}
                  renderItem={(f) => (
                    <List.Item className="!px-0">
                      <CheckOutlined className="text-green-500 mr-2" />
                      {f}
                    </List.Item>
                  )}
                />
                <Link to={p.link}>
                  <Button type={p.highlight ? 'primary' : 'default'} block className="mt-4">
                    {t(`pricing.plans.${p.key}.cta`)}
                  </Button>
                </Link>
              </Card>
            </Col>
          );
        })}
      </Row>

      <div className="text-center mt-8 text-gray-500 text-sm">
        {t('pricing.paymentNote')}
      </div>
    </div>
  );
}
