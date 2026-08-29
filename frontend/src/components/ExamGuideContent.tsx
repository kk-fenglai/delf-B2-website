import { Card, Col, Row, Tag, Typography, Button, Divider } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLevelStore } from '../stores/level';

const { Title, Paragraph } = Typography;

// 每个体系的科目列表（图标 + i18n 键）；口语单列在 "individual" 区。
const SKILLS_BY_SYSTEM: Record<string, { key: string; icon: string }[]> = {
  DELF: [
    { key: 'CO', icon: '🎧' },
    { key: 'CE', icon: '📖' },
    { key: 'PE', icon: '✍️' },
    { key: 'PO', icon: '🎙️' },
  ],
  IELTS: [
    { key: 'LISTENING', icon: '🎧' },
    { key: 'READING', icon: '📖' },
    { key: 'WRITING', icon: '✍️' },
    { key: 'SPEAKING', icon: '🎙️' },
  ],
};

// Shared body for the exam walkthrough — content follows the system + level
// the user is currently browsing (examGuide.levels.<level> in the locale
// files; IELTS uses level key IELTS_AC). Pass showCta={false} to hide the
// bottom buttons.
export default function ExamGuideContent({ showCta = true }: { showCta?: boolean }) {
  const { t } = useTranslation();
  const level = useLevelStore((s) => s.level);
  const system = useLevelStore((s) => s.system);
  const isIelts = system === 'IELTS';
  const skills = SKILLS_BY_SYSTEM[system] || SKILLS_BY_SYSTEM.DELF;
  const speakingKey = isIelts ? 'SPEAKING' : 'PO';

  const renderSkill = (key: string, icon: string) => {
    const tips = t(`examGuide.levels.${level}.skills.${key}.tips`, { returnObjects: true }) as string[];
    return (
      <Card key={key} className="mb-4" size="small">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className="text-2xl">{icon}</span>
          <Title level={4} style={{ margin: 0 }}>{t(`examGuide.levels.${level}.skills.${key}.name`)}</Title>
          <Tag color="blue">{t(`examGuide.levels.${level}.skills.${key}.time`)}</Tag>
          <Tag>{isIelts ? 'Band 0-9' : `25 ${t('landing.points')}`}</Tag>
        </div>
        <Paragraph className="text-gray-600 mb-2">{t(`examGuide.levels.${level}.skills.${key}.format`)}</Paragraph>
        <ul className="text-gray-500 pl-5 mb-0" style={{ listStyle: 'disc' }}>
          {Array.isArray(tips) && tips.map((tip, i) => <li key={i}>{tip}</li>)}
        </ul>
      </Card>
    );
  };

  return (
    <div>
      <Card className="mb-6">
        <Title level={3}>{t('examGuide.collectiveTitle')}</Title>
        <Paragraph className="text-gray-500">{t(`examGuide.levels.${level}.collectiveNote`)}</Paragraph>
        {skills.filter((s) => s.key !== speakingKey).map((s) => renderSkill(s.key, s.icon))}
      </Card>

      <Card className="mb-6">
        <Title level={3}>{t('examGuide.individualTitle')}</Title>
        <Paragraph className="text-gray-500">{t(`examGuide.levels.${level}.individualNote`)}</Paragraph>
        {renderSkill(speakingKey, '🎙️')}
      </Card>

      <Card className="mb-6">
        <Title level={3}>{t('examGuide.scoringTitle')}</Title>
        <ul className="pl-5" style={{ listStyle: 'disc' }}>
          {(t(isIelts ? 'examGuide.scoringIelts' : 'examGuide.scoring', { returnObjects: true, level }) as string[]).map((line, i) => (
            <li key={i} className="text-gray-700 mb-1">{line}</li>
          ))}
        </ul>
        <Divider />
        <Paragraph strong style={{ marginBottom: 0 }}>
          {isIelts ? t('examGuide.ieltsOverallNote') : t('landing.passRule')}
        </Paragraph>
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
