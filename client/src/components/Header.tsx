import { useLocation } from "wouter";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const [, navigate] = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 glow-border">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-3 bg-transparent border-none cursor-pointer p-0 hover-elevate group"
          data-testid="link-home"
        >
          <div className="relative">
            <img src="/assets/fruin_icon.png" alt="System Icon" className="h-8 w-auto object-contain filter hue-rotate-180 group-hover:filter group-hover:hue-rotate-90 transition-all duration-300" />
            <div className="absolute inset-0 glow-border-purple opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-sm" />
          </div>
          <h1 className="font-mono text-2xl text-primary terminal-text glitch group-hover:text-primary/80 transition-colors duration-300">
            SAYORI.PROXY
          </h1>
        </button>
        
        <div className="flex items-center gap-3">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
