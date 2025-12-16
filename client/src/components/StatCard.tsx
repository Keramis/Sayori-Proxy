import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
}

export function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <Card className="p-6 flex flex-col items-center justify-center min-h-[140px] glow-border data-stream">
      {Icon && (
        <Icon className="h-5 w-5 text-primary mb-3 terminal-text" />
      )}
      <div className="text-sm font-mono text-muted-foreground mb-2 text-center terminal-text">{label}</div>
      <div className="text-3xl font-mono font-semibold text-primary terminal-text glitch" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {value}
      </div>
    </Card>
  );
}
