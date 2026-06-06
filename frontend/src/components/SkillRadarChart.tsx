import ReactECharts from 'echarts-for-react';

interface Props {
  option: Record<string, unknown>;
}

export default function SkillRadarChart({ option }: Props) {
  return <ReactECharts option={option} style={{ height: 300 }} lazyUpdate />;
}
