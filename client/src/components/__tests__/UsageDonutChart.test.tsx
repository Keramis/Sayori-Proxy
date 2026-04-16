// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import React from "react"
import { UsageDonutChart } from "../UsageDonutChart"
import type { ChartConfig } from "@/components/ui/chart"

// Mock recharts because jsdom doesn't support SVG layout
vi.mock("recharts", () => {
  const R = require("react")
  return {
    PieChart: ({ children }: { children: React.ReactNode }) => R.createElement("div", null, children),
    Pie: ({ children }: { children: React.ReactNode }) => R.createElement("div", null, children),
    Label: ({ content }: { content: (props: any) => React.ReactNode }) => {
      const result = content({ viewBox: { cx: 100, cy: 100 } })
      const extractText = (el: any): string[] => {
        if (typeof el === "string" || typeof el === "number") return [String(el)]
        if (!el?.props?.children) return []
        if (Array.isArray(el.props.children)) {
          return el.props.children.flatMap((c: any) => {
            if (typeof c === "string" || typeof c === "number") return [String(c)]
            return extractText(c)
          })
        }
        return extractText(el.props.children)
      }
      const texts = extractText(result)
      return R.createElement("div", { "data-testid": "pie-label" }, ...texts.map((t: string, i: number) =>
        R.createElement("span", { key: i }, t)
      ))
    },
    Tooltip: () => null,
    Legend: () => null,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => R.createElement("div", null, children),
  }
})

const chartConfig: ChartConfig = {
  gpt4: { label: "GPT-4", color: "var(--chart-1)" },
  claude: { label: "Claude-3", color: "var(--chart-2)" },
}

const data = [
  { name: "gpt4", value: 100, fill: "var(--chart-1)" },
  { name: "claude", value: 50, fill: "var(--chart-2)" },
]

describe("UsageDonutChart", () => {
  it("renders the title", () => {
    render(
      <UsageDonutChart
        title="Total Requests"
        data={data}
        chartConfig={chartConfig}
        centerValue={150}
        centerLabel="Requests"
      />
    )
    expect(screen.getByText("Total Requests")).toBeInTheDocument()
  })

  it("renders the center value", () => {
    render(
      <UsageDonutChart
        title="Total Requests"
        data={data}
        chartConfig={chartConfig}
        centerValue={150}
        centerLabel="Requests"
      />
    )
    expect(screen.getByText("150")).toBeInTheDocument()
  })

  it("renders the center label", () => {
    render(
      <UsageDonutChart
        title="Total Requests"
        data={data}
        chartConfig={chartConfig}
        centerValue={150}
        centerLabel="Requests"
      />
    )
    expect(screen.getByText("Requests")).toBeInTheDocument()
  })

  it("renders description when provided", () => {
    render(
      <UsageDonutChart
        title="Total Requests"
        description="All time"
        data={data}
        chartConfig={chartConfig}
        centerValue={150}
        centerLabel="Requests"
      />
    )
    expect(screen.getByText("All time")).toBeInTheDocument()
  })

  it("does not crash with empty data", () => {
    render(
      <UsageDonutChart
        title="Empty Chart"
        data={[]}
        chartConfig={{}}
        centerValue={0}
        centerLabel="None"
      />
    )
    expect(screen.getByText("Empty Chart")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
  })

  it("renders footer when provided", () => {
    render(
      <UsageDonutChart
        title="Test"
        data={data}
        chartConfig={chartConfig}
        centerValue={100}
        centerLabel="Total"
        footer={<span>Footer text</span>}
      />
    )
    expect(screen.getByText("Footer text")).toBeInTheDocument()
  })
})
