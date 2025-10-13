import { useLocation } from "wouter";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const [, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0"
          data-testid="link-home"
        >
          <h1 className="font-script text-3xl text-primary">Sayori Proxy</h1>
        </button>
        
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
