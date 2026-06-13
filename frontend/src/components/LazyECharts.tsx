import { lazy, Suspense } from 'react';
import type { EChartsReactProps } from 'echarts-for-react';

const ReactECharts = lazy(() => import('echarts-for-react'));

export default function LazyECharts(props: EChartsReactProps) {
  const { style, ...rest } = props;
  return (
    <Suspense fallback={<div style={style} aria-hidden />}>
      <ReactECharts style={style} {...rest} />
    </Suspense>
  );
}
