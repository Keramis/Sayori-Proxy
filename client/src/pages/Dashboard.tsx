import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { StatCard } from "@/components/StatCard";
import { ModelProviderCard } from "@/components/ModelProviderCard";
import { UserTokenDialog } from "@/components/UserTokenDialog";
import { Activity, TrendingUp, Zap, Clock, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";

interface Stats {
  totalTokens: number;
  totalRequests: number;
  successRate: number;
  activeRequests: number;
  uptime: number;
}

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  } else if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalTokens: 0,
    totalRequests: 0,
    successRate: 100,
    activeRequests: 0,
    uptime: 0,
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["/api/providers/public"],
    queryFn: api.getPublicProviders,
  });

  const { data: sayoriModels = [] } = useQuery({
    queryKey: ["/v1/models"],
    queryFn: () => fetch("/v1/models").then(res => res.json()).then(data => data.data || []),
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  // WebSocket for real-time stats
  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/stats`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setStats(data);
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      ws.close();
    };
  }, []);

  // Assign colors to providers
  const providerColors = [
    "bg-emerald-600",
    "bg-purple-600",
    "bg-blue-600",
    "bg-pink-600",
    "bg-orange-600",
    "bg-teal-600",
  ];

  return (
    <div className="min-h-screen bg-background relative">
      {/* Subtle background image */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: 'url(/assets/sayori.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.12,
        }}
      />

      <Header />

      <main className="container mx-auto px-6 py-8">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h1 className="font-script text-6xl text-primary mb-4">Sayori Proxy</h1>
          <p className="text-muted-foreground text-lg mb-6">
            Router that will never leave you hanging.
          </p>
          <UserTokenDialog />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
          <StatCard
            label="Total Tokens"
            value={formatTokens(stats.totalTokens)}
            icon={Activity}
          />
          <StatCard
            label="Total Requests"
            value={stats.totalRequests}
            icon={TrendingUp}
          />
          <StatCard
            label="Success Rate"
            value={`${stats.successRate.toFixed(1)}%`}
            icon={Zap}
          />
          <StatCard
            label="Active Request"
            value={stats.activeRequests}
            icon={BarChart3}
          />
          <StatCard
            label="Uptime"
            value={formatUptime(stats.uptime)}
            icon={Clock}
          />
        </div>

        {/* Available Models Section */}
        {providers.length > 0 && (
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-6 text-primary">Available Models</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {providers.map((provider: any, index: number) => (
                <ModelProviderCard
                  key={provider.id}
                  provider={provider.name}
                  color={providerColors[index % providerColors.length]}
                  models={provider.models.map((m: any) => m.modelId)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Usage Guide Section */}
      <div className="container mx-auto px-6 mb-8">
        <h2 className="text-2xl font-semibold mb-6 text-primary">Model Usage Guide</h2>
        <div className="bg-muted/30 rounded-lg p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            When using Sayori Proxy, use the following model IDs in your API requests to <code className="text-xs bg-background px-2 py-1 rounded font-mono border">/v1/chat/completions</code>:
          </p>
          {sayoriModels.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-[400px] overflow-y-auto pr-2">
                {sayoriModels.map((model: any) => (
                  <button
                    key={model.id}
                    onClick={() => copyToClipboard(model.id)}
                    className="text-xs bg-background px-3 py-2 rounded font-mono border break-all text-left hover:bg-muted/50 transition-colors cursor-pointer"
                    title="Click to copy"
                  >
                    {model.id}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-4">
                Total models available: {sayoriModels.length} • Click any model to copy
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">(no example present)</p>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t mt-12 py-6">
        <div className="container mx-auto px-6 text-center text-sm text-muted-foreground">
          <p>Sayori Proxy - Will you gently open the door?</p>
        </div>
      </footer>
    </div>
  );
}