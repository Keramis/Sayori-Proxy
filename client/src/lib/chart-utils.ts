import type { ChartConfig } from '@/components/ui/chart'

export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
] as const

export function getModelChartConfig(models: string[]): ChartConfig {
  const config: ChartConfig = {}
  models.forEach((model, i) => {
    config[model] = {
      label: model,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  })
  return config
}

export function getInputOutputChartConfig(): ChartConfig {
  return {
    inputTokens: {
      label: 'Input Tokens',
      color: CHART_COLORS[0],
    },
    outputTokens: {
      label: 'Output Tokens',
      color: CHART_COLORS[1],
    },
  }
}

export function prepareDonutData(
  items: { name: string; value: number }[]
): { name: string; value: number; fill: string }[] {
  return items.map((item, i) => ({
    ...item,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }))
}