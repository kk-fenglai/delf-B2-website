import { Result, Button, Breadcrumb, Card, Typography, Space, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

export default function SpeakingPlaceholder() {
  const { t } = useTranslation();

  return (
    <div className="max-w-4xl mx-auto">
      <Breadcrumb
        className="mb-3"
        items={[
          { title: <Link to="/practice">{t('nav.practice')}</Link> },
          { title: t('skill.PO') },
        ]}
      />

      <Result
        status="info"
        icon={<div className="text-6xl">🎙️</div>}
        title={
          <Space>
            {t('skill.PO')}
            <Tag color="orange">{t('practice.hub.comingSoonTag')}</Tag>
          </Space>
        }
        subTitle={t('practice.po.comingSoonDesc')}
        extra={
          <Space>
            <Link to="/practice">
              <Button>{t('practice.po.backToHub')}</Button>
            </Link>
            <Link to="/pricing">
              <Button type="primary">{t('practice.po.seePricing')}</Button>
            </Link>
          </Space>
        }
      />

      <Card className="mt-4">
        <Title level={4}>{t('practice.po.previewTitle')}</Title>
        <Paragraph className="text-gray-500">{t('practice.po.previewDesc')}</Paragraph>
        <ul className="list-disc pl-6 text-gray-600">
          <li>{t('practice.po.bullet1')}</li>
          <li>{t('practice.po.bullet2')}</li>
          <li>{t('practice.po.bullet3')}</li>
        </ul>
      </Card>
    </div>
  );
}
