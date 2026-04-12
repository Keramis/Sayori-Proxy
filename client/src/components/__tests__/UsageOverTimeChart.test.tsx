import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { UsageOverTimeChart } from "../UsageOverTimeChart"
import type { UsageRecord } from "@/lib/usage-analytics"

// Mock recharts because jsdom doesn't support SVG layout
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>
  const noop = () => <div />
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    LineChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    CartesianGrid: noop,
    XAxis: noop,
    YAxis: noop,
    Line: noop,
    Tooltip: noop,
    Legend: noop,
  }
})

const makeRecord = (overrides: Partial<UsageRecord> = {}): UsageRecord => ({
  id: "1",
  discordUserId: "u1",
  modelId: "gpt-4",
  providerId: "p1",
  tokens: 100,
  inputTokens: 50,
  outputTokens: 50,
  timestamp: Date.now(),
  cost: 1,
  modelName: "GPT-4",
  providerName: "OpenAI",
  ...overrides
})

describe("UsageOverTimeChart", () => {
  it("renders the title", () => {
    render(<UsageOverTimeChart records={[makeRecord()]} />)
    expect(screen.getByText("Usage Over Time")).toBeInTheDocument()
  })

  it("renders both tab buttons", () => {
    render(<UsageOverTimeChart records={[makeRecord()]} />)
    expect(screen.getByTestId("tab-requests")).toBeInTheDocument()
    expect(screen.getByTestId("tab-tokens")).toBeInTheDocument()
  })

  it("requests tab is active by default", () => {
    render(<UsageOverTimeChart records={[makeRecord()]} />)
    const requestsTab = screen.getByTestId("tab-requests")
    expect(requestsTab).toHaveAttribute("data-active", "true")
  })

  it("switches active tab on click", () => {
    render(<UsageOverTimeChart records={[makeRecord()]} />)
    const tokensTab = screen.getByTestId("tab-tokens")
    fireEvent.click(tokensTab)
    expect(tokensTab).toHaveAttribute("data-active", "true")
    expect(screen.getByTestId("tab-requests")).toHaveAttribute("data-active", "false")
  })

  it("renders with empty records without crashing", () => {
    render(<UsageOverTimeChart records={[]} />)
    expect(screen.getByText("Usage Over Time")).toBeInTheDocument()
  })

  it("shows total counts in tab buttons", () => {
    render(<UsageOverTimeChart records={[makeRecord()]} />)
    expect(screen.getByText("1")).toBeInTheDocument()
  })
})
