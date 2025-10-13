import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";

interface ModelProviderCardProps {
  provider: string;
  models: string[];
  color?: string;
}

export function ModelProviderCard({ provider, models, color = "bg-emerald-600" }: ModelProviderCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full ${color} text-white p-4 flex items-center justify-between hover-elevate active-elevate-2`}
        data-testid={`button-toggle-${provider.toLowerCase()}`}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{provider}</h3>
          <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
            {models.length}
          </Badge>
        </div>
        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>
      
      {isExpanded && (
        <div className="p-4 space-y-2 bg-muted/30">
          {models.map((model, index) => (
            <button
              key={index}
              onClick={() => copyToClipboard(`${model} (${provider})`)}
              className="font-mono text-sm py-2 px-3 rounded-md bg-background w-full text-left hover:bg-muted/50 transition-colors cursor-pointer"
              data-testid={`model-${model}`}
              title="Click to copy"
            >
              {model} ({provider})
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
