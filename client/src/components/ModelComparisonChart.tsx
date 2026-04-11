"use client";

import { useMemo } from "react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis } from "recharts";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BrainCircuit } from "lucide-react";
import { UsageRecord, aggregateByModel } from "@/lib/usage-analytics";

interface ModelComparisonChartProps {
  records: UsageRecord[];
}

const chartConfig = {
  cost: { label: "Cost", color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

export function ModelComparisonChart({ records }: ModelComparisonChartProps) {
  const topModels = useMemo(
    () => aggregateByModel(records).slice(0, 8),
    [records]
  );

  if (topModels.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5" />
            Model Usage
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[300px] text-muted-foreground">
          No model usage data yet
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5" />
          Model Usage
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="w-full h-[300px]">
          <BarChart layout="vertical" data={topModels}>
            <XAxis type="number" dataKey="cost" />
            <YAxis
              type="category"
              dataKey="modelName"
              width={120}
              style={{ fontSize: "12px" }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelKey="modelName"
                  formatter={(value, name, props) => {
                    const payload = props.payload;
                    return [
                      <div key="cost" className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Cost:</span>
                        <span className="font-medium">
                          ${payload.cost.toFixed(2)}
                        </span>
                      </div>,
                      <div key="requests" className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Requests:</span>
                        <span className="font-medium">
                          {payload.requests.toLocaleString()}
                        </span>
                      </div>,
                      <div key="tokens" className="flex justify-between gap-4">
                        <span className="text-muted-foreground">Tokens:</span>
                        <span className="font-medium">
                          {payload.tokens.toLocaleString()}
                        </span>
                      </div>,
                    ];
                  }}
                />
              }
            />
            <Bar
              dataKey="cost"
              fill="hsl(var(--chart-1))"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}