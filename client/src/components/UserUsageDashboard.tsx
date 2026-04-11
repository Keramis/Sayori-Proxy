import { useQuery } from "@tanstack/react-query";
import { UsageStatCards } from "./UsageStatCards";
import { UsageTimeSeriesChart } from "./UsageTimeSeriesChart";
import { ModelComparisonChart } from "./ModelComparisonChart";
import { ProviderDonutChart } from "./ProviderDonutChart";
import { Badge } from "@/components/ui/badge";
import { Server } from "lucide-react";
import { api } from "@/lib/api";
import { RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UsageRecord } from "@/lib/usage-analytics";

interface UserUsageDashboardProps {
  /** Admin view: displays a label for the viewed user. */
  userId?: string;
}

export function UserUsageDashboard({ userId }: UserUsageDashboardProps) {
  const { data: records = [], isLoading, isError, error } = useQuery<UsageRecord[]>({
    queryKey: ["/api/user/usage"],
    queryFn: api.getUserUsage,
  });

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

      {/* Row 1: Stat Cards */}
      <section>
        <h2 className="text-xl font-semibold text-primary mb-4">Overview</h2>
        <UsageStatCards records={records} />
      </section>

      {/* Row 2: Time Series Chart */}
      <section>
        <UsageTimeSeriesChart records={records} />
      </section>

      {/* Row 3: Bar + Donut side by side */}
      <section className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ModelComparisonChart records={records} />
        </div>
        <div className="lg:col-span-2">
          <ProviderDonutChart records={records} />
        </div>
      </section>
    </div>
  );
}