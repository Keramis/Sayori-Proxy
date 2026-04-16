import { describe, it, expect } from 'vitest'
import { 
  CHART_COLORS, 
  getModelChartConfig, 
  getInputOutputChartConfig, 
  prepareDonutData,
  toConfigKey
} from '../chart-utils'

describe('CHART_COLORS', () => {
  it('has exactly 5 colors', () => {
    expect(CHART_COLORS.length).toBe(5)
  })
  it('all are CSS var references', () => {
    CHART_COLORS.forEach(c => {
      expect(c).toMatch(/^var\(--chart-\d+\)$/)
    })
  })
})

describe('toConfigKey', () => {
  it('returns unchanged string for valid identifiers', () => {
    expect(toConfigKey('GPT-4')).toBe('GPT-4')
  })
  it('replaces slashes and dots with underscores', () => {
    expect(toConfigKey('x-ai/grok-4.1-fast')).toBe('x-ai_grok-4_1-fast')
  })
  it('replaces spaces with underscores', () => {
    expect(toConfigKey('my model')).toBe('my_model')
  })
})

describe('getModelChartConfig', () => {
  it('returns empty config for empty array', () => {
    expect(Object.keys(getModelChartConfig([])).length).toBe(0)
  })
  it('uses sanitized keys for config entries', () => {
    const config = getModelChartConfig(['x-ai/grok-4.1-fast', 'GPT-4'])
    expect(config['x-ai_grok-4_1-fast']).toBeDefined()
    expect(config['x-ai_grok-4_1-fast'].label).toBe('x-ai/grok-4.1-fast')
    expect(config['x-ai_grok-4_1-fast'].color).toBe(CHART_COLORS[0])
    expect(config['GPT-4'].color).toBe(CHART_COLORS[1])
  })
  it('wraps after 5 models', () => {
    const config = getModelChartConfig(['m1', 'm2', 'm3', 'm4', 'm5', 'm6'])
    expect(config['m6'].color).toBe(CHART_COLORS[0])
    expect(config['m1'].color).toBe(CHART_COLORS[0])
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
  it('wraps fill in hsl() with sanitized key', () => {
    const data = prepareDonutData([
      { name: 'GPT-4', value: 100 },
      { name: 'Claude-3', value: 200 }
    ])
    expect(data[0].fill).toBe('hsl(var(--color-GPT-4))')
    expect(data[1].fill).toBe('hsl(var(--color-Claude-3))')
  })
  it('sanitizes name for fill and data key', () => {
    const data = prepareDonutData([{ name: 'x-ai/grok-4.1-fast', value: 50 }])
    expect(data[0].name).toBe('x-ai_grok-4_1-fast')
    expect(data[0].fill).toBe('hsl(var(--color-x-ai_grok-4_1-fast))')
    expect(data[0].value).toBe(50)
  })
})
