import { useEffect, useState } from 'react';
import { Card, Col, Row, Tag, Typography, Button, Segmented, Empty } from 'antd';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api } from '../api/client';
import type { ExamSetBrief, Skill } from '../types';

const { Title, Paragraph } = Typography;

export default function Practice() {
  const { t } = useTranslation();
  const [sets, setSets] = useState<ExamSetBrief[]>([]);
  const [skill, setSkill] = useState<string>('ALL');

  useEffect(() => {
    const params = skill === 'ALL' ? {} : { skill };
    api.get('/exams', { params }).then((r) => setSets(r.data.sets));
  }, [skill]);

  return (
    <div className="max-w-6xl mx-auto">
      <Title level={2}>{t('practice.title')}</Title>
      <Paragraph className="text-gray-500">{t('practice.subtitle')}</Paragraph>

      <Segmented
        className="mb-4"
        value={skill}
        onChange={(v) => setSkill(v as string)}
        options={[
          { label: t('practice.all'), value: 'ALL' },
          { label: `${t('skill.CO')} (CO)`, value: 'CO' },
          { label: `${t('skill.CE')} (CE)`, value: 'CE' },
          { label: `${t('skill.PE')} (PE)`, value: 'PE' },
          { label: `${t('skill.PO')} (PO)`, value: 'PO' },
        ]}
      />

      {sets.length === 0 ? (
        <Empty description={t('practice.empty')} />
      ) : (
        <Row gutter={[16, 16]}>
          {sets.map((s) => (
            <Col xs={24} md={12} lg={8} key={s.id}>
              <Card
                title={s.title}
                extra={s.isFreePreview && <Tag color="green">{t('practice.freePreview')}</Tag>}
                actions={[
                  <Link key="go" to={`/practice/${s.id}`}>
                    <Button type="link">{t('practice.startPractice')}</Button>
                  </Link>,
                ]}
              >
                <Paragraph className="text-gray-500 mb-2">
                  {s.description || `${t('practice.year')}: ${s.year}`}
                </Paragraph>
                <div className="flex flex-wrap gap-1">
                  {Object.entries(s.countsBySkill).map(([k, v]) => (
                    <Tag key={k}>
                      {t(`skill.${k}`)} {t('practice.questionsCount', { count: v })}
                    </Tag>
                  ))}
                </div>
                <div className="mt-2 text-xs text-gray-400">
                  {t('practice.totalQuestions', { count: s.totalQuestions })}
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
