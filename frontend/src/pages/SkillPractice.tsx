import { useEffect, useState } from 'react';
import { Card, Col, Row, Tag, Typography, Button, Empty, Breadcrumb } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { ExamSetBrief, Skill } from '../types';

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

export default function SkillPractice({ skill, mockMode = false }: Props) {
  const { t } = useTranslation();
  const [sets, setSets] = useState<ExamSetBrief[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = skill ? { skill } : {};
    setLoading(true);
    api
      .get('/exams', { params })
      .then((r) => setSets(r.data.sets))
      .finally(() => setLoading(false));
  }, [skill]);

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

      {loading ? null : sets.length === 0 ? (
        <Empty description={t('practice.empty')} />
      ) : (
        <Row gutter={[16, 16]}>
          {sets.map((s) => {
            const countForSkill = skill ? s.countsBySkill[skill] ?? 0 : s.totalQuestions;
            return (
              <Col xs={24} md={12} lg={8} key={s.id}>
                <Card
                  title={s.title}
                  extra={s.isFreePreview && <Tag color="green">{t('practice.freePreview')}</Tag>}
                  actions={[
                    <Link key="go" to={runnerPathFor(s.id)}>
                      <Button type="link">{t('practice.startPractice')}</Button>
                    </Link>,
                  ]}
                >
                  <Paragraph className="text-gray-500 mb-2">
                    {s.description || `${t('practice.year')}: ${s.year}`}
                  </Paragraph>
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
          })}
        </Row>
      )}
    </div>
  );
}
