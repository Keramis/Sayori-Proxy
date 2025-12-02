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
  const [isExpanded, setIsExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const filteredModels = models.filter((model) =>
    model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <Card className="overflow-hidden break-inside-avoid">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full ${color} text-white p-4 flex items-center justify-between hover-elevate active-elevate-2`}
        data-testid={`button-toggle-${provider.toLowerCase()}`}
      >
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">{provider}</h3>
          <Badge variant="secondary" className="bg-white/20 text-white border-white/30">
            {searchQuery ? `${filteredModels.length}/${models.length}` : models.length}
          </Badge>
        </div>
        {isExpanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>
      
      {isExpanded && (
        <div className="p-4 space-y-2 bg-muted/30">
          <input
            type="text"
            placeholder="Search models in this provider..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-full px-3 py-2 rounded-md border bg-background text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {filteredModels.length > 0 ? (
            filteredModels.map((model, index) => (
            <button
              key={index}
              onClick={() => copyToClipboard(`${model} (${provider})`)}
              className="font-mono text-sm py-2 px-3 rounded-md bg-background w-full text-left hover:bg-muted/50 transition-colors cursor-pointer"
              data-testid={`model-${model}`}
              title="Click to copy"
            >
              {model} ({provider})
            </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No models found matching "{searchQuery}"
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
