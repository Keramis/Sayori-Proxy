import { ThemeProvider } from "@/components/ThemeProvider";
import Dashboard from "../Dashboard";

export default function DashboardExample() {
  return (
    <ThemeProvider>
      <Dashboard />
    </ThemeProvider>
  );
}
