import { describe, it, expect } from 'vitest'
import { 
  filterToday,
  aggregateTodayByModel,
  totalInputOutputSplit,
  todayInputOutputSplit,
  aggregateByDayLast30,
  startOfTodayUtc
} from '../usage-analytics'
import type { UsageRecord } from '../usage-analytics'

// Helper to create a usage record with a given timestamp
const makeRecord = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  id: '1',
  discordUserId: 'u1',
  modelId: 'gpt-4',
  providerId: 'p1',
  tokens: 100,
  inputTokens: 50,
  outputTokens: 50,
  timestamp: Date.now(),
  cost: 1,
  modelName: 'GPT-4',
  providerName: 'OpenAI',
  ...overrides
})

describe('filterToday', () => {
  it('returns empty array for empty input', () => {
    expect(filterToday([])).toEqual([])
  })
  it('filters records to today only', () => {
    const now = Date.now()
    const today = makeRecord({ timestamp: now })
    const yesterday = makeRecord({ timestamp: now - 86400000 })
    expect(filterToday([today, yesterday]).length).toBe(1)
  })
it('handles edge case at midnight UTC', () => {
  const midnight = startOfTodayUtc();
  const recordAtMidnight = makeRecord({ timestamp: midnight });
  expect(filterToday([recordAtMidnight])).toContainEqual(recordAtMidnight);
})
})

describe('aggregateTodayByModel', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateTodayByModel([])).toEqual([])
  })
  it('aggregates records by model name', () => {
    const r1 = makeRecord({ modelName: 'GPT-4', tokens: 100, timestamp: Date.now() })
    const r2 = makeRecord({ modelName: 'GPT-4', tokens: 200, timestamp: Date.now() })
    const r3 = makeRecord({ modelName: 'Claude-3', tokens: 150, timestamp: Date.now() })
    const result = aggregateTodayByModel([r1, r2, r3])
    expect(result.length).toBe(2)
  })
it('counts requests correctly', () => {
  const r1 = makeRecord({ modelName: 'GPT-4', timestamp: Date.now() });
  const r2 = makeRecord({ modelName: 'GPT-4', timestamp: Date.now() });
  const r3 = makeRecord({ modelName: 'Claude-3', timestamp: Date.now() });
  const result = aggregateTodayByModel([r1, r2, r3]);
  const gpt4 = result.find(r => r.model === 'GPT-4');
  const claude3 = result.find(r => r.model === 'Claude-3');
  expect(gpt4?.requests).toBe(2);
  expect(claude3?.requests).toBe(1);
})
})

describe('totalInputOutputSplit', () => {
  it('returns { input: 0, output: 0 } for empty input', () => {
    expect(totalInputOutputSplit([])).toEqual({ input: 0, output: 0 })
  })
  it('sums inputTokens and outputTokens correctly', () => {
    const r1 = makeRecord({ inputTokens: 100, outputTokens: 200 })
    const r2 = makeRecord({ inputTokens: 50, outputTokens: 75 })
    expect(totalInputOutputSplit([r1, r2])).toEqual({ input: 150, output: 275 })
  })
})

describe('todayInputOutputSplit', () => {
  it('returns { input: 0, output: 0 } when no today records', () => {
    const yesterday = makeRecord({ timestamp: Date.now() - 86400000 })
    expect(todayInputOutputSplit([yesterday])).toEqual({ input: 0, output: 0 })
  })
  it('sums only today records', () => {
    const today = makeRecord({ inputTokens: 100, outputTokens: 200, timestamp: Date.now() })
    const yesterday = makeRecord({ inputTokens: 50, outputTokens: 75, timestamp: Date.now() - 86400000 })
    expect(todayInputOutputSplit([today, yesterday])).toEqual({ input: 100, output: 200 })
  })
})

describe('aggregateByDayLast30', () => {
  it('returns empty array for empty input', () => {
    expect(aggregateByDayLast30([])).toEqual([])
  })
  it('groups by day correctly', () => {
    const now = Date.now()
    const r1 = makeRecord({ timestamp: now, tokens: 100, inputTokens: 50, outputTokens: 50 })
    const r2 = makeRecord({ timestamp: now + 1000, tokens: 50, inputTokens: 25, outputTokens: 25 })
    const result = aggregateByDayLast30([r1, r2])
    expect(result.length).toBe(1) // same day
  })
it('returns at most 30 entries', () => {
  const now = Date.now();
  const thirtyFiveDaysAgo = now - 35 * 86400000;
  const fiveDaysAgo = now - 5 * 86400000;
  const record35DaysAgo = makeRecord({ timestamp: thirtyFiveDaysAgo });
  const record5DaysAgo = makeRecord({ timestamp: fiveDaysAgo });
  const result = aggregateByDayLast30([record35DaysAgo, record5DaysAgo]);
  expect(result.length).toBe(1);
})
it('includes date, requests, tokens, inputTokens, outputTokens per entry', () => {
  const now = Date.now();
  const record = makeRecord({
    timestamp: now,
    tokens: 100,
    inputTokens: 60,
    outputTokens: 40
  });
  const result = aggregateByDayLast30([record]);
  const entry = result[0];
  expect(entry).toHaveProperty('date');
  expect(entry).toHaveProperty('requests');
  expect(entry).toHaveProperty('tokens');
  expect(entry).toHaveProperty('inputTokens');
  expect(entry).toHaveProperty('outputTokens');
  expect(entry.requests).toBe(1);
  expect(entry.tokens).toBe(100);
  expect(entry.inputTokens).toBe(60);
  expect(entry.outputTokens).toBe(40);
  expect(entry.tokens).toBe(entry.inputTokens + entry.outputTokens);
})
})