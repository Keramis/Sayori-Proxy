import { ThemeProvider } from "../ThemeProvider";
import { Header } from "../Header";

export default function HeaderExample() {
  return (
    <ThemeProvider>
      <Header />
      <div className="p-8">
        <p className="text-muted-foreground">This is the main content area</p>
      </div>
    </ThemeProvider>
  );
}
