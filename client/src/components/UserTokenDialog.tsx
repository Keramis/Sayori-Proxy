import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Key, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";

export function UserTokenDialog() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [shouldFetch, setShouldFetch] = useState(false);

  const { data: rawData, isLoading, error: queryError } = useQuery({
    queryKey: ["/api/token/stats", token],
    queryFn: () => api.getTokenStats(token),
    enabled: shouldFetch && token.length > 0,
    refetchInterval: shouldFetch ? 3000 : false,
    retry: false,
  });

  const stats = rawData ? {
    lastUsed: rawData.lastUsed ? new Date(rawData.lastUsed).toLocaleString() : "Never",
    requestsToday: rawData.requestsToday,
    maxRPD: rawData.maxRPD,
    remainingRPD: rawData.remainingRPD,
    models: rawData.modelUsage,
  } : null;

  const error = queryError ? (queryError as any).message || "Failed to fetch token stats" : "";
  const loading = isLoading;

  // Show error toast when there's a query error
  useEffect(() => {
    if (queryError && shouldFetch) {
      toast({
        title: "Invalid Token",
        description: "Token not found. Please check your user token and try again.",
        variant: "destructive",
      });
    }
  }, [queryError, shouldFetch, toast]);

  const handleCheck = () => {
    setShouldFetch(true);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" size="lg" className="gap-2" data-testid="button-check-token">
          <Key className="h-5 w-5" />
          Check Your User Token
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>User Token Stats</DialogTitle>
          <DialogDescription>
            Enter your user token to view your usage statistics
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="token">User Token</Label>
            <Input
              id="token"
              type="password"
              placeholder="sk_..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="font-mono"
              data-testid="input-token"
            />
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}

          {!stats ? (
            <Button
              onClick={handleCheck}
              className="w-full"
              disabled={!token || loading}
              data-testid="button-verify-token"
            >
              {loading ? "Checking..." : "Check Stats"}
            </Button>
          ) : (
            <>
              <div className="flex items-center justify-between pb-2">
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <RefreshCw className="h-3 w-3 animate-spin" />
                  Auto-refreshing every 3 seconds
                </p>
              </div>
            <div className="space-y-4 pt-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">Last Used</div>
                <div className="font-semibold" data-testid="text-last-used">{stats.lastUsed}</div>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-2">Requests Today</div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-2xl font-bold text-primary" data-testid="text-rpd">
                    {stats.requestsToday}/{stats.maxRPD}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {stats.remainingRPD} remaining
                  </span>
                </div>
                <Progress value={(stats.requestsToday / stats.maxRPD) * 100} className="h-2" />
              </div>

              {stats.models.length > 0 && (
                <div>
                  <div className="text-sm text-muted-foreground mb-3">Model Usage</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={stats.models}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="name" 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <YAxis 
                        tick={{ fontSize: 12 }}
                        className="text-muted-foreground"
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                      />
                      <Bar 
                        dataKey="count" 
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
