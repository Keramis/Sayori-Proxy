import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { UsageDonutChart } from "./UsageDonutChart";
import { UsageOverTimeChart } from "./UsageOverTimeChart";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { UsageRecord } from "@/lib/usage-analytics";
import {
  aggregateByModel,
  aggregateTodayByModel,
  totalInputOutputSplit,
  todayInputOutputSplit,
} from "@/lib/usage-analytics";
import {
  getModelChartConfig,
  getInputOutputChartConfig,
  prepareDonutData,
} from "@/lib/chart-utils";

export function UserUsageDashboard() {
  const { data: records = [], isLoading, isError, error } = useQuery<UsageRecord[]>({
    queryKey: ["/api/user/usage"],
    queryFn: api.getUserUsage,
  });

  const {
    totalRequestsData,
    totalRequestsConfig,
    totalRequests,
    totalTokensData,
    totalTokensConfig,
    totalTokens,
    todayRequestsData,
    todayRequestsConfig,
    todayRequests,
    todayTokensData,
    todayTokensConfig,
    todayTokens,
  } = useMemo(() => {
    const byModel = aggregateByModel(records);
    const models = byModel.map((m) => m.modelName);
    const totalRequestsConfig = getModelChartConfig(models);
    const totalRequestsData = prepareDonutData(
      byModel.map((m) => ({ name: m.modelName, value: m.requests }))
    );
    const totalRequests = byModel.reduce((acc, m) => acc + m.requests, 0);

    const split = totalInputOutputSplit(records);
    const totalTokensConfig = getInputOutputChartConfig();
    const totalTokensData = prepareDonutData([
      { name: "inputTokens", value: split.input },
      { name: "outputTokens", value: split.output },
    ]);
    const totalTokens = split.input + split.output;

    const todayByModel = aggregateTodayByModel(records);
    const todayModels = todayByModel.map((m) => m.model);
    const todayRequestsConfig = getModelChartConfig(todayModels);
    const todayRequestsData = prepareDonutData(
      todayByModel.map((m) => ({ name: m.model, value: m.requests }))
    );
    const todayRequests = todayByModel.reduce((acc, m) => acc + m.requests, 0);

    const todaySplit = todayInputOutputSplit(records);
    const todayTokensConfig = getInputOutputChartConfig();
    const todayTokensData = prepareDonutData([
      { name: "inputTokens", value: todaySplit.input },
      { name: "outputTokens", value: todaySplit.output },
    ]);
    const todayTokens = todaySplit.input + todaySplit.output;

    return {
      totalRequestsData,
      totalRequestsConfig,
      totalRequests,
      totalTokensData,
      totalTokensConfig,
      totalTokens,
      todayRequestsData,
      todayRequestsConfig,
      todayRequests,
      todayTokensData,
      todayTokensConfig,
      todayTokens,
    };
  }, [records]);

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
    <div className="space-y-6">
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <UsageDonutChart
          title="Total Requests"
          data={totalRequestsData}
          chartConfig={totalRequestsConfig}
          centerValue={totalRequests}
          centerLabel="Requests"
        />
        <UsageDonutChart
          title="Total Tokens"
          data={totalTokensData}
          chartConfig={totalTokensConfig}
          centerValue={totalTokens}
          centerLabel="Tokens"
        />
        <UsageDonutChart
          title="Today's Requests"
          data={todayRequestsData}
          chartConfig={todayRequestsConfig}
          centerValue={todayRequests}
          centerLabel="Requests"
        />
        <UsageDonutChart
          title="Today's Tokens"
          data={todayTokensData}
          chartConfig={todayTokensConfig}
          centerValue={todayTokens}
          centerLabel="Tokens"
        />
      </section>

      <section>
        <UsageOverTimeChart records={records} />
      </section>
    </div>
  );
}
