import { describe, it, expect } from 'vitest'
import { 
  CHART_COLORS, 
  getModelChartConfig, 
  getInputOutputChartConfig, 
  prepareDonutData 
} from '../chart-utils'

describe('CHART_COLORS', () => {
  it('has exactly 5 colors', () => {
    expect(CHART_COLORS.length).toBe(5)
  })
  it('all are CSS var references', () => {
    CHART_COLORS.forEach(c => {
      expect(c).toMatch(/^var\(--chart-\d+\)$/) // Fixed regex escaping
    })
  })
})

describe('getModelChartConfig', () => {
  it('returns empty config for empty array', () => {
    const config = getModelChartConfig([])
    expect(Object.keys(config).length).toBe(0)
  })
  it('assigns colors cycling through CHART_COLORS', () => {
    const config = getModelChartConfig(['GPT-4', 'Claude-3', 'Gemini'])
    expect(config['GPT-4'].color).toBe(CHART_COLORS[0])
    expect(config['Claude-3'].color).toBe(CHART_COLORS[1])
    expect(config['Gemini'].color).toBe(CHART_COLORS[2])
  })
  it('wraps after 5 models (6th gets chart-1)', () => {
    const config = getModelChartConfig(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
    expect(config['m6'].color).toBe(CHART_COLORS[0]) // wrapped
    expect(config['m1'].color).toBe(CHART_COLORS[0])
    expect(config['m6'].color).toBe(config['m1'].color) // same color
  })
  it('each model has label property', () => {
    const config = getModelChartConfig(['GPT-4'])
    expect(config['GPT-4'].label).toBe('GPT-4')
  })
})

describe('getInputOutputChartConfig', () => {
  it('returns config with Input Tokens and Output Tokens', () => {
    const config = getInputOutputChartConfig()
    expect(config['inputTokens']).toBeDefined()
    expect(config['outputTokens']).toBeDefined()
  })
  it('maps to chart-1 and chart-2', () => {
    const config = getInputOutputChartConfig()
    expect(config['inputTokens'].color).toBe(CHART_COLORS[0])
    expect(config['outputTokens'].color).toBe(CHART_COLORS[1])
  })
})

describe('prepareDonutData', () => {
  it('returns empty array for empty input', () => {
    expect(prepareDonutData([])).toEqual([])
  })
  it('assigns fill colors cycling', () => {
    const data = prepareDonutData([
      { name: 'GPT-4', value: 100 },
      { name: 'Claude-3', value: 200 }
    ])
    expect(data[0].fill).toBe(CHART_COLORS[0])
    expect(data[1].fill).toBe(CHART_COLORS[1])
  })
  it('preserves name and value', () => {
    const data = prepareDonutData([{ name: 'Test', value: 42 }])
    expect(data[0].name).toBe('Test')
    expect(data[0].value).toBe(42)
  })
  it('wraps after 5 items', () => {
    const items = [0,1,2,3,4,5].map(i => ({ name: `m${i}`, value: i }))
    const data = prepareDonutData(items)
    expect(data[5].fill).toBe(CHART_COLORS[0]) // wrapped
  })
})