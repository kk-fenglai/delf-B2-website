import { Card, Col, Row, Tag, Typography, Button, Divider } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Paragraph } = Typography;

const SKILLS: { key: string; icon: string }[] = [
  { key: 'CO', icon: '🎧' },
  { key: 'CE', icon: '📖' },
  { key: 'PE', icon: '✍️' },
  { key: 'PO', icon: '🎙️' },
];

// Shared body for the DELF B2 exam walkthrough. Rendered on the Landing page
// (and reusable elsewhere). Pass showCta={false} to hide the bottom buttons.
export default function ExamGuideContent({ showCta = true }: { showCta?: boolean }) {
  const { t } = useTranslation();

  const renderSkill = (key: string, icon: string) => {
    const tips = t(`examGuide.skills.${key}.tips`, { returnObjects: true }) as string[];
    return (
      <Card key={key} className="mb-4" size="small">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-2xl">{icon}</span>
          <Title level={4} style={{ margin: 0 }}>{t(`examGuide.skills.${key}.name`)}</Title>
          <Tag color="blue">{t(`examGuide.skills.${key}.time`)}</Tag>
          <Tag>25 {t('landing.points')}</Tag>
        </div>
        <Paragraph className="text-gray-600 mb-2">{t(`examGuide.skills.${key}.format`)}</Paragraph>
        <ul className="text-gray-500 pl-5 mb-0" style={{ listStyle: 'disc' }}>
          {tips.map((tip, i) => <li key={i}>{tip}</li>)}
        </ul>
      </Card>
    );
  };

  return (
    <div>
      <Card className="mb-6">
        <Title level={3}>{t('examGuide.collectiveTitle')}</Title>
        <Paragraph className="text-gray-500">{t('examGuide.collectiveNote')}</Paragraph>
        {SKILLS.filter((s) => s.key !== 'PO').map((s) => renderSkill(s.key, s.icon))}
      </Card>

      <Card className="mb-6">
        <Title level={3}>{t('examGuide.individualTitle')}</Title>
        <Paragraph className="text-gray-500">{t('examGuide.individualNote')}</Paragraph>
        {renderSkill('PO', '🎙️')}
      </Card>

      <Card className="mb-6">
        <Title level={3}>{t('examGuide.scoringTitle')}</Title>
        <ul className="pl-5" style={{ listStyle: 'disc' }}>
          {(t('examGuide.scoring', { returnObjects: true }) as string[]).map((line, i) => (
            <li key={i} className="text-gray-700 mb-1">{line}</li>
          ))}
        </ul>
        <Divider />
        <Paragraph strong style={{ marginBottom: 0 }}>{t('landing.passRule')}</Paragraph>
      </Card>

      {showCta && (
        <Row gutter={[12, 12]} className="justify-center">
          <Col>
            <Link to="/practice">
              <Button type="primary" size="large">{t('examGuide.ctaStart')}</Button>
            </Link>
          </Col>
          <Col>
            <Link to="/practice/mock">
              <Button size="large">{t('examGuide.ctaMock')}</Button>
            </Link>
          </Col>
        </Row>
      )}
    </div>
  );
}
