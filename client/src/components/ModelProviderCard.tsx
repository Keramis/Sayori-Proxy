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
    <Card className="overflow-hidden break-inside-avoid">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full relative overflow-hidden ${isLight ? 'candy-stripe-light text-red-700 dark:text-white' : 'candy-stripe-dark text-white'} p-4 flex items-center justify-between hover-elevate active-elevate-2 transition-all duration-300`}
        data-testid={`button-toggle-${provider.toLowerCase()}`}
      >
        <div className="flex items-center gap-3 relative z-10">
          <h3 className={`text-lg font-semibold ${isLight ? 'drop-shadow-sm dark:drop-shadow-md' : 'drop-shadow-md'}`}>{provider}</h3>
          <Badge 
            variant="secondary" 
            className={`${isLight ? 'bg-white/60 text-red-700 border-red-200 dark:bg-white/20 dark:text-white dark:border-white/30' : 'bg-white/20 text-white border-white/30'} backdrop-blur-sm shadow-sm`}
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
