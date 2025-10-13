import { useState } from "react";
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
import { Key } from "lucide-react";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export function UserTokenDialog() {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCheck = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getTokenStats(token);
      
      // Format last used
      const lastUsedStr = data.lastUsed
        ? new Date(data.lastUsed).toLocaleString()
        : "Never";

      setStats({
        lastUsed: lastUsedStr,
        requestsToday: data.requestsToday,
        maxRPD: data.maxRPD,
        remainingRPD: data.remainingRPD,
        models: data.modelUsage,
      });
    } catch (err: any) {
      setError(err.message || "Failed to fetch token stats");
      setStats(null);
    } finally {
      setLoading(false);
    }
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
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
