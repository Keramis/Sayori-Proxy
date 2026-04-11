import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Hash, Coins, BrainCircuit, CalendarDays, Gauge } from "lucide-react";
import { UsageRecord, computeSummaryStats, formatCost } from "@/lib/usage-analytics";

interface UsageStatCardsProps {
  records: UsageRecord[];
}

interface MetricCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}

function MetricCard({ label, value, icon: Icon }: MetricCardProps) {
  return (
    <Card className="p-6 flex flex-col items-center justify-center gap-2">
      <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-1">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      <div className="text-3xl font-semibold">{value}</div>
      <div className="text-sm text-muted-foreground text-center">{label}</div>
    </Card>
  );
}

export function UsageStatCards({ records }: UsageStatCardsProps) {
  const stats = useMemo(() => computeSummaryStats(records), [records]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      <MetricCard
        label="Total Requests"
        value={stats.totalRequests.toString()}
        icon={Hash}
      />
      <MetricCard
        label="Total Cost"
        value={formatCost(stats.totalCost)}
        icon={Coins}
      />
      <MetricCard
        label="Total Tokens"
        value={stats.totalTokens.toLocaleString()}
        icon={BrainCircuit}
      />
      <MetricCard
        label="Today's Requests"
        value={stats.todayRequests.toString()}
        icon={CalendarDays}
      />
      <MetricCard
        label="Today's Cost"
        value={formatCost(stats.todayCost)}
        icon={Coins}
      />
      <MetricCard
        label="Active RPM"
        value={stats.minuteRequests.toString()}
        icon={Gauge}
      />
    </div>
  );
}