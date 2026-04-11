import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import {
  CalendarDays,
  Gauge,
  BrainCircuit,
  Server,
  RefreshCw,
  Coins,
  Hash,
} from "lucide-react";

interface UsageRecord {
  id: string;
  discordUserId: string;
  modelId: string;
  providerId: string;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
  timestamp: number;
  cost: number;
}

interface UserUsageDashboardProps {
  /** Admin view: displays a label for the viewed user. The fetch still uses the
   *  session-based endpoint; swap to an admin-specific endpoint later. */
  userId?: string;
}

function startOfTodayUtc(): number {
  const now = new Date();
  return Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
}

function oneMinuteAgo(): number {
  return Date.now() - 60_000;
}

function aggregateBy<K extends string>(
  records: UsageRecord[],
  keyFn: (r: UsageRecord) => K,
): Array<{ key: K; cost: number; requests: number; tokens: number }> {
  const map = new Map<
    K,
    { cost: number; requests: number; tokens: number }
  >();
  for (const r of records) {
    const k = keyFn(r);
    const existing = map.get(k) ?? { cost: 0, requests: 0, tokens: 0 };
    existing.cost += r.cost;
    existing.requests += 1;
    existing.tokens += r.tokens;
    map.set(k, existing);
  }
  return Array.from(map.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.cost - a.cost);
}

function formatCost(cost: number): string {
  return cost % 1 === 0 ? cost.toString() : cost.toFixed(2);
}

export function UserUsageDashboard({ userId }: UserUsageDashboardProps) {
  const {
    data: records = [] as UsageRecord[],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["/api/user/usage"],
    queryFn: api.getUserUsage,
  });

  const todayStart = useMemo(() => startOfTodayUtc(), []);
  const minuteAgo = useMemo(() => oneMinuteAgo(), []);

  const todayRecords = useMemo(
    () => records.filter((r) => r.timestamp >= todayStart),
    [records, todayStart],
  );

  const minuteRecords = useMemo(
    () => records.filter((r) => r.timestamp >= minuteAgo),
    [records, minuteAgo],
  );

  const todayCost = useMemo(
    () => todayRecords.reduce((sum, r) => sum + r.cost, 0),
    [todayRecords],
  );
  const todayRequests = todayRecords.length;

  const minuteCost = useMemo(
    () => minuteRecords.reduce((sum, r) => sum + r.cost, 0),
    [minuteRecords],
  );
  const minuteRequests = minuteRecords.length;

  const modelBreakdown = useMemo(
    () => aggregateBy(records, (r) => r.modelId),
    [records],
  );

  const providerBreakdown = useMemo(
    () => aggregateBy(records, (r) => r.providerId),
    [records],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card className="p-6 text-center">
        <p className="text-destructive">
          Failed to load usage data: {error instanceof Error ? error.message : "Unknown error"}
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Admin-view banner */}
      {userId && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Server className="h-4 w-4" />
          <span>
            Viewing usage for user <Badge variant="secondary">{userId}</Badge>
          </span>
        </div>
      )}

      {/* ── Section 1: Today's Usage ── */}
      <section>
        <h2 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Today&apos;s Usage
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Today's Cost" value={formatCost(todayCost)} icon={Coins} />
          <StatCard label="Today's Requests" value={todayRequests} icon={Hash} />
          <StatCard
            label="Today's Tokens"
            value={todayRecords.reduce((s, r) => s + r.tokens, 0).toLocaleString()}
            icon={BrainCircuit}
          />
        </div>
      </section>

      {/* ── Section 2: Minute Usage ── */}
      <section>
        <h2 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
          <Gauge className="h-5 w-5" />
          Last Minute Usage
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label="Minute Cost" value={formatCost(minuteCost)} icon={Coins} />
          <StatCard label="Minute Requests" value={minuteRequests} icon={Hash} />
        </div>
      </section>

      {/* ── Section 3: Model Usage Breakdown ── */}
      <section>
        <h2 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
          <BrainCircuit className="h-5 w-5" />
          Model Usage Breakdown
        </h2>
        {modelBreakdown.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Model</th>
                      <th className="px-4 py-3 font-medium text-right">Requests</th>
                      <th className="px-4 py-3 font-medium text-right">Cost</th>
                      <th className="px-4 py-3 font-medium text-right">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modelBreakdown.map((row) => (
                      <tr
                        key={row.key}
                        className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs">{row.key}</td>
                        <td className="px-4 py-3 text-right">{row.requests}</td>
                        <td className="px-4 py-3 text-right">{formatCost(row.cost)}</td>
                        <td className="px-4 py-3 text-right">{row.tokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="p-6 text-center text-muted-foreground">
            No model usage data available.
          </Card>
        )}
      </section>

      {/* ── Section 4: Provider Usage Breakdown ── */}
      <section>
        <h2 className="text-xl font-semibold text-primary mb-4 flex items-center gap-2">
          <Server className="h-5 w-5" />
          Provider Usage Breakdown
        </h2>
        {providerBreakdown.length > 0 ? (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Provider</th>
                      <th className="px-4 py-3 font-medium text-right">Requests</th>
                      <th className="px-4 py-3 font-medium text-right">Cost</th>
                      <th className="px-4 py-3 font-medium text-right">Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {providerBreakdown.map((row) => (
                      <tr
                        key={row.key}
                        className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 font-mono text-xs">{row.key}</td>
                        <td className="px-4 py-3 text-right">{row.requests}</td>
                        <td className="px-4 py-3 text-right">{formatCost(row.cost)}</td>
                        <td className="px-4 py-3 text-right">{row.tokens.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="p-6 text-center text-muted-foreground">
            No provider usage data available.
          </Card>
        )}
      </section>
    </div>
  );
}
