"use client"

import * as React from "react"
import { Label, Pie, PieChart } from "recharts"
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

interface UsageDonutChartProps {
  title: string
  description?: string
  data: { name: string; value: number; fill: string }[]
  chartConfig: ChartConfig
  centerValue: string | number
  centerLabel: string
  dataKey?: string
  nameKey?: string
  footer?: React.ReactNode
}

export function UsageDonutChart({
  title,
  description,
  data,
  chartConfig,
  centerValue,
  centerLabel,
  dataKey = "value",
  nameKey = "name",
  footer,
}: UsageDonutChartProps) {
  const hasData = data.length > 0 && data.some(d => d.value > 0)

  return (
    <Card className="flex flex-col">
      <CardHeader className="items-center pb-0">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <div className="relative mx-auto aspect-square max-h-[250px]">
          <ChartContainer
            config={chartConfig}
            className="h-full w-full"
          >
            <PieChart>
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Pie
                data={data}
                dataKey={dataKey}
                nameKey={nameKey}
                innerRadius={60}
                strokeWidth={5}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          x={viewBox.cx}
                          y={viewBox.cy}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          <tspan
                            x={viewBox.cx}
                            y={viewBox.cy}
                            className="fill-foreground text-3xl font-bold"
                          >
                            {typeof centerValue === "number"
                              ? centerValue.toLocaleString()
                              : centerValue}
                          </tspan>
                          <tspan
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                            className="fill-muted-foreground"
                          >
                            {centerLabel}
                          </tspan>
                        </text>
                      )
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>
          {!hasData && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-bold text-foreground">
                {typeof centerValue === "number"
                  ? centerValue.toLocaleString()
                  : centerValue}
              </span>
              <span className="text-muted-foreground">{centerLabel}</span>
            </div>
          )}
        </div>
      </CardContent>
      {footer && (
        <div className="px-6 pb-4 text-sm text-muted-foreground">
          {footer}
        </div>
      )}
    </Card>
  )
}
