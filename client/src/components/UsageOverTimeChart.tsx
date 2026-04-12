"use client"

import * as React from "react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { aggregateByDayLast30 } from "@/lib/usage-analytics"

const chartConfig = {
  requests: {
    label: "Requests",
    color: "var(--chart-1)",
  },
  tokens: {
    label: "Tokens",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

type ActiveChart = keyof typeof chartConfig

interface UsageOverTimeChartProps {
  records: import("@/lib/usage-analytics").UsageRecord[]
}

export function UsageOverTimeChart({ records }: UsageOverTimeChartProps) {
  const [activeChart, setActiveChart] = React.useState<ActiveChart>("requests")

  const data = React.useMemo(() => aggregateByDayLast30(records), [records])

  const total = React.useMemo(
    () => ({
      requests: data.reduce((acc, curr) => acc + curr.requests, 0),
      tokens: data.reduce((acc, curr) => acc + curr.tokens, 0),
    }),
    [data]
  )

  return (
    <Card className="py-4 sm:py-0">
      <CardHeader className="flex flex-col items-stretch border-b p-0! sm:flex-row">
        <div className="flex flex-1 flex-col justify-center gap-1 px-6 pb-3 sm:pb-0">
          <CardTitle>Usage Over Time</CardTitle>
          <CardDescription>
            Showing usage for the last 30 days
          </CardDescription>
        </div>
        <div className="flex">
          {(["requests", "tokens"] as const).map((chart) => (
            <button
              key={chart}
              data-active={activeChart === chart}
              data-testid={`tab-${chart}`}
              className="flex flex-1 flex-col justify-center gap-1 border-t px-6 py-4 text-left even:border-l data-[active=true]:bg-muted/50 sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
              onClick={() => setActiveChart(chart)}
            >
              <span className="text-xs text-muted-foreground">
                {chartConfig[chart].label}
              </span>
              <span className="text-lg leading-none font-bold sm:text-3xl">
                {total[chart].toLocaleString()}
              </span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:p-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <LineChart
            accessibilityLayer
            data={data}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value + "T00:00:00")
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[150px]"
                  labelFormatter={(value) => {
                    return new Date(value + "T00:00:00").toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  }}
                />
              }
            />
            <Line
              dataKey={activeChart}
              type="monotone"
              stroke={`var(--color-${activeChart})`}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
