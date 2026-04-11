"use client";

import { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart";
import { PieChart, Pie, Cell } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Server } from "lucide-react";
import { UsageRecord, aggregateByProvider, formatCost } from "@/lib/usage-analytics";

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface ProviderDonutChartProps {
  records: UsageRecord[];
}

export function ProviderDonutChart({ records }: ProviderDonutChartProps) {
  const providers = useMemo(() => aggregateByProvider(records), [records]);
  const totalCost = useMemo(
    () => providers.reduce((sum, p) => sum + p.cost, 0),
    [providers]
  );

  if (providers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Provider Distribution
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
          No provider usage data yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Server className="h-5 w-5" />
          Provider Distribution
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative">
          <ChartContainer
            config={{}}
            className="w-full h-[300px]"
          >
            <PieChart>
              <Pie
                data={providers}
                dataKey="cost"
                nameKey="providerName"
                innerRadius={60}
                outerRadius={100}
              >
                {providers.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} followCursor />
              <ChartLegend content={<ChartLegendContent />} />
            </PieChart>
          </ChartContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold">${formatCost(totalCost)}</span>
            <span className="text-xs text-muted-foreground">Total Cost</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
