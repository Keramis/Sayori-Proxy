import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Key, RefreshCw, Edit2, Check, X, LogOut, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";

const TOKEN_STORAGE_KEY = "sayori_user_token";

export function UserTokenOverview() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [token, setToken] = useState(() => {
    // Load token from localStorage on mount
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  });
  const [shouldFetch, setShouldFetch] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);
  const [showTokenInput, setShowTokenInput] = useState(false);

  const { data: rawData, isLoading, error: queryError, refetch } = useQuery({
    queryKey: ["/api/token/stats", token],
    queryFn: () => api.getTokenStats(token),
    enabled: shouldFetch && token.length > 0,
    refetchInterval: shouldFetch ? 10000 : false,
    retry: false,
  });

  const stats = rawData ? {
    name: rawData.name,
    lastUsed: rawData.lastUsed ? new Date(rawData.lastUsed).toLocaleString() : "Never",
    requestsToday: rawData.requestsToday,
    maxRPD: rawData.maxRPD,
    remainingRPD: rawData.remainingRPD,
    models: rawData.modelUsage,
    disabled: rawData.disabled || false,
    expiresAt: rawData.expiresAt,
  } : null;

  const error = queryError ? (queryError as any).message || "Failed to fetch token stats" : "";

  // Auto-load token if it exists in localStorage
  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (savedToken) {
      setToken(savedToken);
      setShouldFetch(true);
    }
  }, []);

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
    // Save token to localStorage
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    setShouldFetch(true);
    setShowTokenInput(false);
  };

  const handleStartEdit = () => {
    setEditedName(stats?.name || "");
    setIsEditingName(true);
  };

  const handleCancelEdit = () => {
    setIsEditingName(false);
    setEditedName("");
  };

  const handleSaveName = async () => {
    if (!editedName.trim()) {
      toast({
        title: "Invalid Name",
        description: "Token name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingName(true);
    try {
      await api.updateTokenName(token, editedName.trim());
      toast({
        title: "Success",
        description: "Token name updated successfully",
      });
      setIsEditingName(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update token name",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingName(false);
    }
  };

  const handleManageToken = () => {
    setShowTokenInput(true);
    setShouldFetch(false);
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setShouldFetch(false);
    setShowTokenInput(true);
    toast({
      title: "Logged Out",
      description: "Your token has been cleared",
    });
  };

  // If no token or showing token input
  if (!token || !shouldFetch || showTokenInput) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            User Token Overview
          </CardTitle>
          <CardDescription>
            Enter your user token to view your usage statistics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <Button
            onClick={handleCheck}
            className="w-full"
            disabled={!token || isLoading}
            data-testid="button-verify-token"
          >
            {isLoading ? "Checking..." : "Check Stats"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // If stats are loaded, show them
  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Key className="h-5 w-5" />
          User Token Overview
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Auto-refreshing every 10 seconds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-sm text-muted-foreground mb-1">Token Name</div>
          {isEditingName ? (
            <div className="flex items-center gap-2">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                className="flex-1"
                placeholder="Enter token name"
                disabled={isUpdatingName}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSaveName}
                disabled={isUpdatingName}
                className="h-8 w-8"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={isUpdatingName}
                className="h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="font-semibold flex-1">{stats?.name}</div>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleStartEdit}
                className="h-8 w-8"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">Status</div>
          {(() => {
            const isExpired = stats?.expiresAt && stats.expiresAt <= Date.now();
            const isDisabled = stats?.disabled;

            if (isDisabled || isExpired) {
              return (
                <Badge variant="destructive" className="text-xs">
                  {isExpired ? "Expired & Disabled" : "Disabled"}
                </Badge>
              );
            }
            return (
              <Badge variant="default" className="text-xs bg-green-600">
                Online
              </Badge>
            );
          })()}
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-1">Last Used</div>
          <div className="font-semibold" data-testid="text-last-used">{stats?.lastUsed}</div>
        </div>

        <div>
          <div className="text-sm text-muted-foreground mb-2">Requests Today</div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold text-primary" data-testid="text-rpd">
              {stats?.requestsToday}/{stats?.maxRPD}
            </span>
            <span className="text-sm text-muted-foreground">
              {stats?.remainingRPD} remaining
            </span>
          </div>
          <Progress value={(stats ? (stats.requestsToday / stats.maxRPD) * 100 : 0)} className="h-2" />
        </div>

        {stats && stats.models.length > 0 && (
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

        <div className="pt-4 border-t space-y-2">
          <Button
            onClick={() => navigate("/user/manage")}
            variant="default"
            className="w-full gap-2"
          >
            <Settings className="h-4 w-4" />
            Manage User Token
          </Button>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="w-full gap-2"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
