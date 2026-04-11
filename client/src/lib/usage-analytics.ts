import { format } from "date-fns";

export interface UsageRecord {
  id: string;
  discordUserId: string;
  modelId: string;
  providerId: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
  cost: number;
  modelName?: string;
  providerName?: string;
}

export interface HourlyBucket {
  timestamp: number;
  label: string;
  requests: number;
  cost: number;
  tokens: number;
}

export interface DailyBucket {
  timestamp: number;
  label: string;
  requests: number;
  cost: number;
  tokens: number;
}

export interface ModelBreakdown {
  modelId: string;
  modelName: string;
  requests: number;
  cost: number;
  tokens: number;
}

export interface ProviderBreakdown {
  providerId: string;
  providerName: string;
  requests: number;
  cost: number;
  tokens: number;
}

export interface SummaryStats {
  totalRequests: number;
  totalCost: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  todayRequests: number;
  todayCost: number;
  todayTokens: number;
  minuteRequests: number;
  minuteCost: number;
}

export function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
}

export function oneMinuteAgo(): number {
  return Date.now() - 60_000;
}

export function formatCost(cost: number): string {
  return cost % 1 === 0 ? cost.toString() : cost.toFixed(2);
}

export function getTimeRangeLabel(
  timestamp: number,
  granularity: "hour" | "day",
): string {
  if (granularity === "hour") {
    return format(new Date(timestamp), "h a");
  }
  return format(new Date(timestamp), "MMM d");
}

export function aggregateByHour(records: UsageRecord[]): HourlyBucket[] {
  const map = new Map<number, HourlyBucket>();

  for (const r of records) {
    const hourStart = new Date(r.timestamp).setMinutes(0, 0, 0);
    const existing = map.get(hourStart);
    if (existing) {
      existing.requests += 1;
      existing.cost += r.cost;
      existing.tokens += r.tokens;
    } else {
      map.set(hourStart, {
        timestamp: hourStart,
        label: getTimeRangeLabel(hourStart, "hour"),
        requests: 1,
        cost: r.cost,
        tokens: r.tokens,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function aggregateByDay(records: UsageRecord[]): DailyBucket[] {
  const map = new Map<number, DailyBucket>();

  for (const r of records) {
    const d = new Date(r.timestamp);
    const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0);
    const existing = map.get(dayStart);
    if (existing) {
      existing.requests += 1;
      existing.cost += r.cost;
      existing.tokens += r.tokens;
    } else {
      map.set(dayStart, {
        timestamp: dayStart,
        label: getTimeRangeLabel(dayStart, "day"),
        requests: 1,
        cost: r.cost,
        tokens: r.tokens,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
}

export function aggregateByModel(records: UsageRecord[]): ModelBreakdown[] {
  const map = new Map<
    string,
    { modelName: string; requests: number; cost: number; tokens: number }
  >();

  for (const r of records) {
    const existing = map.get(r.modelId);
    if (existing) {
      existing.requests += 1;
      existing.cost += r.cost;
      existing.tokens += r.tokens;
    } else {
      map.set(r.modelId, {
        modelName: r.modelName ?? r.modelId,
        requests: 1,
        cost: r.cost,
        tokens: r.tokens,
      });
    }
  }

  return Array.from(map.entries())
    .map(([modelId, { modelName, requests, cost, tokens }]) => ({
      modelId,
      modelName,
      requests,
      cost,
      tokens,
    }))
    .sort((a, b) => b.cost - a.cost);
}

export function aggregateByProvider(
  records: UsageRecord[],
): ProviderBreakdown[] {
  const map = new Map<
    string,
    { providerName: string; requests: number; cost: number; tokens: number }
  >();

  for (const r of records) {
    const existing = map.get(r.providerId);
    if (existing) {
      existing.requests += 1;
      existing.cost += r.cost;
      existing.tokens += r.tokens;
    } else {
      map.set(r.providerId, {
        providerName: r.providerName ?? r.providerId,
        requests: 1,
        cost: r.cost,
        tokens: r.tokens,
      });
    }
  }

  return Array.from(map.entries())
    .map(([providerId, { providerName, requests, cost, tokens }]) => ({
      providerId,
      providerName,
      requests,
      cost,
      tokens,
    }))
    .sort((a, b) => b.cost - a.cost);
}

export function computeSummaryStats(records: UsageRecord[]): SummaryStats {
  const now = Date.now();
  const todayStart = startOfTodayUtc();
  const minuteAgo = oneMinuteAgo();

  let totalRequests = 0;
  let totalCost = 0;
  let totalTokens = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let todayRequests = 0;
  let todayCost = 0;
  let todayTokens = 0;
  let minuteRequests = 0;
  let minuteCost = 0;

  for (const r of records) {
    totalRequests += 1;
    totalCost += r.cost;
    totalTokens += r.tokens;
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;

    if (r.timestamp >= todayStart) {
      todayRequests += 1;
      todayCost += r.cost;
      todayTokens += r.tokens;
    }

    if (r.timestamp >= minuteAgo) {
      minuteRequests += 1;
      minuteCost += r.cost;
    }
  }

  return {
    totalRequests,
    totalCost,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    todayRequests,
    todayCost,
    todayTokens,
    minuteRequests,
    minuteCost,
  };
}
