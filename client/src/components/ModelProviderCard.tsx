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
  const [stripeVariant] = useState(() => Math.random() > 0.5 ? 'light' : 'dark');

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const filteredModels = models.filter((model) =>
    model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const isLight = stripeVariant === 'light';

  return (
    <Card className="overflow-hidden break-inside-avoid glow-border">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full relative overflow-hidden ${isLight ? 'bg-gradient-to-r from-blue-900/80 to-purple-900/80 text-white' : 'bg-gradient-to-r from-purple-900/80 to-blue-900/80 text-white'} p-4 flex items-center justify-between hover-elevate active-elevate-2 transition-all duration-300 scanlines`}
        data-testid={`button-toggle-${provider.toLowerCase()}`}
      >
        <div className="flex items-center gap-3 relative z-10">
          <h3 className={`text-lg font-mono font-semibold terminal-text ${isLight ? 'drop-shadow-sm dark:drop-shadow-md' : 'drop-shadow-md'}`}>{provider.toUpperCase()}</h3>
          <Badge
            variant="secondary"
            className={`${isLight ? 'bg-blue-800/60 text-white border-blue-600' : 'bg-purple-800/60 text-white border-purple-600'} backdrop-blur-sm shadow-sm terminal-text`}
          >
            {searchQuery ? `${filteredModels.length}/${models.length}` : models.length}
          </Badge>
        </div>
        <div className="relative z-10">
           {isExpanded ?
             <ChevronUp className={`h-5 w-5 ${isLight ? 'dark:drop-shadow-md' : 'drop-shadow-md'}`} /> :
             <ChevronDown className={`h-5 w-5 ${isLight ? 'dark:drop-shadow-md' : 'drop-shadow-md'}`} />
           }
        </div>
      </button>
      
      {isExpanded && (
        <div className="p-4 space-y-2 bg-muted/30 scanlines">
          <input
            type="text"
            placeholder="Scan algorithms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            className="w-full px-3 py-2 rounded-sm border bg-background/80 text-sm mb-3 font-mono terminal-text focus:outline-none focus:ring-2 focus:ring-primary/50 glow-border"
          />
          {filteredModels.length > 0 ? (
            filteredModels.map((model, index) => (
            <button
              key={index}
              onClick={() => copyToClipboard(`${model} (${provider})`)}
              className="font-mono text-sm py-2 px-3 rounded-sm bg-background/80 w-full text-left hover:bg-muted/50 transition-colors cursor-pointer terminal-text border border-border/30 hover:border-primary/50"
              data-testid={`model-${model}`}
              title="Click to copy"
            >
              {model} ({provider})
            </button>
            ))
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4 terminal-text">
              No algorithms found matching "{searchQuery}"
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
