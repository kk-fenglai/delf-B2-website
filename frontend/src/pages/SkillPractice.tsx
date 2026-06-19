import { useEffect, useState } from 'react';
import { Card, Col, Row, Tag, Typography, Button, Empty, Breadcrumb, Spin, Divider } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import { localizeExamTitle } from '../utils/examTitle';
import type { ExamSetBrief, Skill, UserExamSetBrief } from '../types';

const { Title, Paragraph } = Typography;

type Props = {
  skill?: Skill;
  mockMode?: boolean;
};

const skillToSlug: Record<Skill, string> = {
  CO: 'listening',
  CE: 'reading',
  PE: 'writing',
  PO: 'speaking',
};

// DELF CO 有两种练习类型：documents courts(短听力)、document long(长听力)。
// 按标题归类(maxPlays 因导入统一为 2 已不可靠)。无法判定的归入 other。
function coGroupOf(title: string): 'long' | 'short' | 'other' {
  const s = title.toLowerCase();
  if (/documents?\s*courts?/.test(s) || /短听力/.test(title) || /\bcourts?\b/.test(s)) return 'short';
  if (
    /documents?\s*longs?/.test(s) ||
    /长听力/.test(title) ||
    /(entretien|d[eé]bat|table\s*ronde|interview|monologue|conf[eé]rence)/.test(s)
  ) return 'long';
  return 'other';
}

export default function SkillPractice({ skill, mockMode = false }: Props) {
  const { t } = useTranslation();
  const [sets, setSets] = useState<ExamSetBrief[]>([]);
  const [userSets, setUserSets] = useState<UserExamSetBrief[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = mockMode ? { mock: 'true' } : skill ? { skill } : {};
    setLoading(true);

    const platformReq = api.get('/exams', { params });
    const userReq = !mockMode && skill
      ? api.get('/user/exam-sets', { params: { skill, published: 'true' } })
      : Promise.resolve({ data: { sets: [] } });

    Promise.all([platformReq, userReq])
      .then(([platformRes, userRes]) => {
        setSets(platformRes.data.sets || []);
        setUserSets(
          (userRes.data.sets || []).filter((s: UserExamSetBrief) => s.questionCount > 0),
        );
      })
      .catch(() => {
        setSets([]);
        setUserSets([]);
      })
      .finally(() => setLoading(false));
  }, [skill, mockMode]);

  const runnerPathFor = (examId: string) => {
    if (mockMode) return `/practice/mock/${examId}`;
    if (skill) return `/practice/${skillToSlug[skill]}/${examId}`;
    return `/practice/${examId}`;
  };

  const pageTitle = mockMode
    ? t('practice.hub.mockTitle')
    : skill
      ? `${t(`skill.${skill}`)} · ${t('practice.hub.skillListTitle')}`
      : t('practice.title');

  const pageSubtitle = mockMode
    ? t('practice.hub.mockDesc')
    : skill
      ? t(`practice.hub.${skill.toLowerCase()}Desc`)
      : t('practice.subtitle');

  const renderPlatformCard = (s: ExamSetBrief) => {
    const countForSkill = skill ? s.countsBySkill[skill] ?? 0 : s.totalQuestions;
    return (
      <Col xs={24} md={12} lg={8} key={s.id}>
        <Card
          bordered={false}
          className="app-surface"
          title={localizeExamTitle(s.title, t)}
          extra={s.isFreePreview && <Tag color="green">{t('practice.freePreview')}</Tag>}
          actions={[
            <Link key="go" to={runnerPathFor(s.id)}>
              <Button type="link">{t('practice.startPractice')}</Button>
            </Link>,
          ]}
        >
          {mockMode ? (
            <div className="flex flex-wrap gap-1">
              {Object.entries(s.countsBySkill).map(([k, v]) => (
                <Tag key={k}>
                  {t(`skill.${k}`)} {t('practice.questionsCount', { count: v })}
                </Tag>
              ))}
            </div>
          ) : (
            <div>
              <Tag color="blue">
                {t(`skill.${skill}`)} {t('practice.questionsCount', { count: countForSkill })}
              </Tag>
            </div>
          )}
          <div className="mt-2 text-xs text-gray-400">
            {t('practice.totalQuestions', { count: s.totalQuestions })}
          </div>
        </Card>
      </Col>
    );
  };

  const renderUserCard = (s: UserExamSetBrief) => (
    <Col xs={24} md={12} lg={8} key={s.id}>
      <Card
        bordered={false}
        className="app-surface"
        title={s.title}
        extra={<Tag color="cyan">{t('mistakes.userOwnedTag')}</Tag>}
        actions={[
          <Link key="go" to={runnerPathFor(s.id)}>
            <Button type="link">{t('practice.startPractice')}</Button>
          </Link>,
        ]}
      >
        <Tag color="blue">
          {t(`skill.${skill}`)} {t('practice.questionsCount', { count: s.questionCount })}
        </Tag>
        {s.description && (
          <Paragraph type="secondary" className="!mb-0 mt-2 text-sm" ellipsis={{ rows: 2 }}>
            {s.description}
          </Paragraph>
        )}
      </Card>
    </Col>
  );

  return (
    <div className="max-w-6xl mx-auto">
      <Breadcrumb
        className="mb-3"
        items={[
          { title: <Link to="/practice">{t('nav.practice')}</Link> },
          { title: pageTitle },
        ]}
      />
      <Title level={2}>{pageTitle}</Title>
      <Paragraph className="text-gray-500">{pageSubtitle}</Paragraph>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : (
        <>
          {sets.length === 0 ? (
            <Empty description={t('practice.empty')} className="mb-8" />
          ) : skill === 'CO' && !mockMode ? (
            <div className="mb-8">
              {(['long', 'short', 'other'] as const).map((g) => {
                const items = sets.filter((s) => (s.coFormat ?? coGroupOf(s.title)) === g);
                if (items.length === 0) return null;
                return (
                  <div key={g} className="mb-6">
                    <Title level={4} className="!mb-3">
                      {t(`practice.co${g.charAt(0).toUpperCase()}${g.slice(1)}`)}
                    </Title>
                    <Row gutter={[16, 16]}>{items.map(renderPlatformCard)}</Row>
                  </div>
                );
              })}
            </div>
          ) : (
            <Row gutter={[16, 16]} className="mb-8">
              {sets.map(renderPlatformCard)}
            </Row>
          )}

          {!mockMode && skill && (
            <>
              <Divider />
              <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                <Title level={4} className="!mb-0">{t('practice.myExamsSection')}</Title>
                <Link to="/my-exams">
                  <Button type="link">{t('practice.manageMyExams')}</Button>
                </Link>
              </div>
              {userSets.length === 0 ? (
                <Empty description={t('practice.myExamsEmpty')}>
                  <Link to="/my-exams">
                    <Button type="primary">{t('practice.createMyExam')}</Button>
                  </Link>
                </Empty>
              ) : (
                <Row gutter={[16, 16]}>
                  {userSets.map(renderUserCard)}
                </Row>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
