import LazyECharts from './LazyECharts';

interface Props {
  option: Record<string, unknown>;
}

export default function SkillRadarChart({ option }: Props) {
  return <LazyECharts option={option} style={{ height: 300 }} lazyUpdate />;
}
