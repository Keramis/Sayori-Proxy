import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { StatCard } from "@/components/StatCard";
import { ModelProviderCard } from "@/components/ModelProviderCard";
import { UserTokenOverview } from "@/components/UserTokenOverview";
import { Activity, TrendingUp, Zap, Clock, BarChart3 } from "lucide-react";
import { api } from "@/lib/api";

const REFRESH_INTERVAL = 3000;

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

import { SnowEffect } from "@/components/SnowEffect";

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalTokens: 0,
    totalRequests: 0,
    successRate: 100,
    activeRequests: 0,
    uptime: 0,
  });

  const [globalModelSearch, setGlobalModelSearch] = useState("");

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

  // Filter providers based on global search
  const filteredProviders = providers.map((provider: any) => {
    if (!globalModelSearch) return provider;
    
    const filteredModels = provider.models.filter((m: any) =>
      m.modelId.toLowerCase().includes(globalModelSearch.toLowerCase())
    );
    
    return {
      ...provider,
      models: filteredModels,
    };
  }).filter((p: any) => p.models.length > 0);

  // WebSocket for real-time stats with HTTP polling fallback
  useEffect(() => {
    let ws: WebSocket | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let wsConnected = false;
    let isUnmounted = false;

    // Try WebSocket first
    const tryWebSocket = () => {
      try {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        ws = new WebSocket(`${protocol}//${window.location.host}/ws/stats`);

        ws.onopen = () => {
          console.log("WebSocket connected");
          wsConnected = true;
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          setStats(data);
        };

        ws.onerror = (error) => {
          console.error("WebSocket error:", error);
        };

        ws.onclose = () => {
          console.log("WebSocket closed");
          const wasConnected = wsConnected;
          wsConnected = false;
          // If WebSocket closes and wasn't connected, start polling
          // but only if we're not unmounting
          if (!wasConnected && !isUnmounted) {
            console.log("Falling back to HTTP polling");
            startPolling();
          }
        };
      } catch (error) {
        console.error("Failed to create WebSocket:", error);
        startPolling();
      }
    };

    // HTTP polling fallback
    const startPolling = () => {
      if (pollInterval || isUnmounted) return; // Already polling or unmounted

      const fetchStats = async () => {
        try {
          const response = await fetch("/api/stats");
          const data = await response.json();
          setStats(data);
        } catch (error) {
          console.error("Failed to fetch stats:", error);
        }
      };

      // Fetch immediately
      fetchStats();

      // Then poll every 3 seconds
      pollInterval = setInterval(fetchStats, REFRESH_INTERVAL);
    };

    // Try WebSocket first, with fallback to polling after 2 seconds if no connection
    tryWebSocket();
    const fallbackTimer = setTimeout(() => {
      if (!wsConnected && !isUnmounted) {
        console.log("WebSocket connection timeout, switching to HTTP polling");
        startPolling();
      }
    }, 2000);

    return () => {
      isUnmounted = true;
      clearTimeout(fallbackTimer);
      if (ws) {
        ws.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
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
      <SnowEffect />
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
          <h1 className="font-script text-6xl mb-4 christmas-gradient-text drop-shadow-md pb-2">Sayori Proxy</h1>
          <p className="text-muted-foreground text-lg mb-6">
            Router that will never leave you hanging.
          </p>
        </div>

        {/* User Token Overview */}
        <div className="mb-12">
          <UserTokenOverview />
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
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <h2 className="text-2xl font-semibold text-primary">Available Models</h2>
              <div className="w-full sm:w-64">
                <input
                  type="text"
                  placeholder="Search all models..."
                  value={globalModelSearch}
                  onChange={(e) => setGlobalModelSearch(e.target.value)}
                  className="w-full px-4 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            {filteredProviders.length > 0 ? (
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1 space-y-4">
                  {filteredProviders.filter((_: any, index: number) => index % 2 === 0).map((provider: any) => {
                    const originalIndex = filteredProviders.indexOf(provider);
                    return (
                      <ModelProviderCard
                        key={provider.id}
                        provider={provider.name}
                        color={providerColors[originalIndex % providerColors.length]}
                        models={provider.models.map((m: any) => m.modelId)}
                      />
                    );
                  })}
                </div>
                <div className="flex-1 space-y-4">
                  {filteredProviders.filter((_: any, index: number) => index % 2 === 1).map((provider: any) => {
                    const originalIndex = filteredProviders.indexOf(provider);
                    return (
                      <ModelProviderCard
                        key={provider.id}
                        provider={provider.name}
                        color={providerColors[originalIndex % providerColors.length]}
                        models={provider.models.map((m: any) => m.modelId)}
                      />
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No models found matching "{globalModelSearch}"
              </p>
            )}
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
