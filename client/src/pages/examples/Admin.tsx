import { ThemeProvider } from "@/components/ThemeProvider";
import Admin from "../Admin";

export default function AdminExample() {
  return (
    <ThemeProvider>
      <Admin />
    </ThemeProvider>
  );
}
