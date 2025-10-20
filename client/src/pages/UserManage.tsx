import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Key,
  TrendingUp,
  Activity,
  Calendar,
  Clock,
  ArrowLeft,
  Copy,
  CheckCircle2,
  BarChart3,
  PieChart,
  History,
  Settings,
  Plus,
  Trash2,
  Network,
  Power,
  Edit2,
  Check,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

const TOKEN_STORAGE_KEY = "sayori_user_token";

const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#8884D8", "#82CA9D"];

export default function UserManage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [token, setToken] = useState(() => {
    return localStorage.getItem(TOKEN_STORAGE_KEY) || "";
  });
  const [inputToken, setInputToken] = useState("");
  const [showTokenValue, setShowTokenValue] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Token name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [isUpdatingName, setIsUpdatingName] = useState(false);

  // Sub-key management state
  const [showSubKeyForm, setShowSubKeyForm] = useState(false);
  const [subKeyName, setSubKeyName] = useState("");
  const [subKeyRPD, setSubKeyRPD] = useState("");
  const [subKeyRPM, setSubKeyRPM] = useState("");
  const [subKeyExpiration, setSubKeyExpiration] = useState("");
  const [isCreatingSubKey, setIsCreatingSubKey] = useState(false);
  const [deletingSubKeyId, setDeletingSubKeyId] = useState<string | null>(null);
  const [togglingSubKeyId, setTogglingSubKeyId] = useState<string | null>(null);
  const subKeyFormRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/user/manage", token],
    queryFn: () => api.getUserManageData(token),
    enabled: !!token,
    refetchInterval: 10000, // Refresh every 10 seconds
    retry: false,
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Authentication Failed",
        description: "Invalid token. Please check your user token and try again.",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleLogin = () => {
    if (!inputToken.trim()) {
      toast({
        title: "Error",
        description: "Please enter your user token",
        variant: "destructive",
      });
      return;
    }
    localStorage.setItem(TOKEN_STORAGE_KEY, inputToken.trim());
    setToken(inputToken.trim());
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setInputToken("");
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(true);
    toast({
      title: "Copied!",
      description: "Token copied to clipboard",
    });
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "Never";
    return new Date(timestamp).toLocaleString();
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(2)}M`;
    } else if (num >= 1000) {
      return `${(num / 1000).toFixed(2)}K`;
    }
    return num.toLocaleString();
  };

  const handleCreateSubKey = async () => {
    if (!subKeyName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a name for the sub-key",
        variant: "destructive",
      });
      return;
    }

    const rpd = parseFloat(subKeyRPD);
    const rpm = parseFloat(subKeyRPM);

    if (isNaN(rpd) || rpd <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid Max RPD",
        variant: "destructive",
      });
      return;
    }

    if (isNaN(rpm) || rpm <= 0) {
      toast({
        title: "Error",
        description: "Please enter a valid Max RPM",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingSubKey(true);
    try {
      let tokenData = await api.getUserManageData(token);
      let gotProviders = tokenData.token.allowedProviders;
      await api.createSubKey(token, {
        name: subKeyName.trim(),
        maxRPD: rpd,
        maxRPM: rpm,
        allowedProviders: gotProviders,
        expiresAt: subKeyExpiration ? new Date(subKeyExpiration).getTime() : undefined,
      });

      toast({
        title: "Success",
        description: `Sub-key "${subKeyName}" created successfully`,
      });

      // Reset form
      setSubKeyName("");
      setSubKeyRPD("");
      setSubKeyRPM("");
      setSubKeyExpiration("");
      setShowSubKeyForm(false);

      // Refetch data
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create sub-key",
        variant: "destructive",
      });
    } finally {
      setIsCreatingSubKey(false);
    }
  };

  const handleDeleteSubKey = async (subKeyId: string, subKeyName: string) => {
    if (!confirm(`Are you sure you want to delete "${subKeyName}"? This will also delete all its sub-keys (cascade delete).`)) {
      return;
    }

    setDeletingSubKeyId(subKeyId);
    try {
      const result = await api.deleteSubKey(token, subKeyId);

      toast({
        title: "Success",
        description: `Deleted "${subKeyName}" and ${result.deletedCount - 1} child sub-keys`,
      });

      // Refetch data
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete sub-key",
        variant: "destructive",
      });
    } finally {
      setDeletingSubKeyId(null);
    }
  };

  const handleToggleSubKeyStatus = async (subKeyId: string, subKeyName: string, currentDisabled: boolean) => {
    const action = currentDisabled ? "enable" : "disable";
    if (!confirm(`Are you sure you want to ${action} "${subKeyName}"? This will also ${action} all its child sub-keys.`)) {
      return;
    }

    setTogglingSubKeyId(subKeyId);
    try {
      const result = currentDisabled
        ? await api.enableSubKey(token, subKeyId)
        : await api.disableSubKey(token, subKeyId);

      const count = currentDisabled ? result.enabledCount : result.disabledCount;

      toast({
        title: "Success",
        description: `${currentDisabled ? 'Enabled' : 'Disabled'} "${subKeyName}" and ${count - 1} child sub-keys`,
      });

      // Refetch data
      refetch();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${action} sub-key`,
        variant: "destructive",
      });
    } finally {
      setTogglingSubKeyId(null);
    }
  };

  const handleStartEditName = () => {
    setEditedName(data?.token?.name || "");
    setIsEditingName(true);
  };

  const handleCancelEditName = () => {
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

  const handleToggleSubKeyForm = () => {
    setShowSubKeyForm(!showSubKeyForm);

    // Scroll to form after state update
    if (!showSubKeyForm) {
      setTimeout(() => {
        subKeyFormRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest'
        });
      }, 100);
    }
  };

  // If not authenticated, show login form
  if (!token) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <div className="max-w-md mx-auto">
            <Button
              variant="ghost"
              onClick={() => navigate("/")}
              className="mb-4"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Dashboard
            </Button>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  User Token Management
                </CardTitle>
                <CardDescription>
                  Enter your user token to access detailed usage statistics
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token">User Token</Label>
                  <Input
                    id="token"
                    type="password"
                    placeholder="sk_..."
                    value={inputToken}
                    onChange={(e) => setInputToken(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                    className="font-mono"
                  />
                </div>
                <Button onClick={handleLogin} className="w-full">
                  Access Management Dashboard
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  // If loading or error, show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <div className="text-center">Loading...</div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-6 py-8">
          <div className="max-w-md mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Error</CardTitle>
                <CardDescription>
                  Failed to load user data. Please try again.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={handleLogout} variant="outline" className="w-full">
                  Try Different Token
                </Button>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    );
  }

  const usagePercentage = (data.usage.requestsToday / data.token.maxRPD) * 100;

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 py-8">
        {/* Header with back button */}
        <div className="flex items-center justify-between mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Dashboard
          </Button>
          <Button onClick={handleLogout} variant="outline">
            Logout
          </Button>
        </div>

        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">User Token Management</h1>
          <p className="text-muted-foreground text-sm md:text-base">
            Comprehensive usage statistics and analytics for your token
          </p>
        </div>

        {/* Token Details Card */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
              <Key className="h-5 w-5" />
              Token Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <div className="text-sm text-muted-foreground mb-1">Token Name</div>
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editedName}
                    onChange={(e) => setEditedName(e.target.value)}
                    className="flex-1 text-sm"
                    placeholder="Enter token name"
                    disabled={isUpdatingName}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleSaveName}
                    disabled={isUpdatingName}
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleCancelEditName}
                    disabled={isUpdatingName}
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="font-semibold text-base md:text-lg break-words flex-1">{data.token.name}</div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={handleStartEditName}
                    className="h-8 w-8 flex-shrink-0"
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Token Value</div>
              <div className="flex items-start gap-2 flex-wrap">
                {showTokenValue ? (
                  <code className="font-mono text-xs md:text-sm bg-muted px-2 py-1 rounded break-all flex-1 min-w-0">
                    {data.token.value}
                  </code>
                ) : (
                  <code className="font-mono text-xs md:text-sm bg-muted px-2 py-1 rounded flex-1">
                    ••••••••••••••••
                  </code>
                )}
                <div className="flex gap-1 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setShowTokenValue(!showTokenValue)}
                    className="h-8 text-xs"
                  >
                    {showTokenValue ? "Hide" : "Show"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(data.token.value)}
                    className="h-8 px-2"
                  >
                    {copiedToken ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Created At</div>
              <div className="font-semibold text-sm md:text-base break-words">{formatDate(data.token.createdAt)}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Last Used</div>
              <div className="font-semibold flex items-center gap-2 text-sm md:text-base flex-wrap">
                <Clock className="h-4 w-4 flex-shrink-0" />
                <span className="break-words">{formatDate(data.usage.lastUsed)}</span>
              </div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Max Requests Per Day</div>
              <div className="font-semibold text-sm md:text-base">{data.token.maxRPD}</div>
            </div>
            <div>
              <div className="text-sm text-muted-foreground mb-1">Max Requests Per Minute</div>
              <div className="font-semibold text-sm md:text-base">{data.token.maxRPM}</div>
            </div>
            {data.token.allowedProviders && data.token.allowedProviders.length > 0 && (
              <div className="md:col-span-2">
                <div className="text-sm text-muted-foreground mb-2">Allowed Providers</div>
                <div className="flex flex-wrap gap-2">
                  {data.token.allowedProviders.map((provider: string) => (
                    <Badge key={provider} variant="secondary" className="text-xs">
                      {provider}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Usage Overview Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Requests Today</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold">{data.usage.requestsToday}</div>
              <Progress value={usagePercentage} className="mt-2 h-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {data.usage.remainingRPD} remaining
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Total Requests</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold">{formatNumber(data.stats.totalRequests)}</div>
              <p className="text-xs text-muted-foreground mt-2">Lifetime</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Total Tokens</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold">{formatNumber(data.stats.totalTokens)}</div>
              <p className="text-xs text-muted-foreground mt-2 break-words">
                {formatNumber(data.stats.totalInputTokens)} in / {formatNumber(data.stats.totalOutputTokens)} out
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs md:text-sm font-medium">Total Cost</CardTitle>
              <PieChart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-xl md:text-2xl font-bold">{data.stats.totalCost}</div>
              <p className="text-xs text-muted-foreground mt-2">Request units</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          {/* Daily Usage Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Calendar className="h-5 w-5" />
                Daily Usage Trend (Last 7 Days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={data.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="usage"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    name="Usage"
                  />
                  <Line
                    type="monotone"
                    dataKey="requests"
                    stroke="hsl(var(--chart-2))"
                    strokeWidth={2}
                    name="Requests"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Model Usage Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <BarChart3 className="h-5 w-5" />
                Top Models Used
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={data.modelUsage.slice(0, 5)}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="modelId"
                    tick={{ fontSize: 9 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      fontSize: '12px'
                    }}
                  />
                  <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Provider Usage and Model Details */}
        <div className="grid gap-6 md:grid-cols-2 mb-6">
          {/* Provider Usage */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Usage Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.providerUsage.map((provider: any, index: number) => (
                  <div key={provider.providerId} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{provider.providerName}</span>
                      <span className="text-sm text-muted-foreground">
                        {provider.count} requests
                      </span>
                    </div>
                    <Progress
                      value={(provider.count / data.stats.totalRequests) * 100}
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatNumber(provider.totalTokens)} tokens</span>
                      <span>{provider.totalCost} cost units</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Model Usage Details */}
          <Card>
            <CardHeader>
              <CardTitle>Model Usage Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {data.modelUsage.map((model: any, index: number) => (
                  <div
                    key={model.modelId}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{model.modelId}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatNumber(model.totalTokens)} tokens • {model.totalCost} cost
                      </div>
                    </div>
                    <Badge variant="secondary">{model.count}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Usage History */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Recent Usage History
            </CardTitle>
            <CardDescription>Last 50 requests</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">In/Out</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentHistory.map((record: any) => (
                    <TableRow key={record.id}>
                      <TableCell className="font-mono text-xs">
                        {formatDate(record.timestamp)}
                      </TableCell>
                      <TableCell className="font-mono text-xs max-w-[200px] truncate">
                        {record.modelId}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{record.providerName}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {formatNumber(record.tokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {formatNumber(record.inputTokens)} / {formatNumber(record.outputTokens)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {record.cost}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Sub-Keys Management */}
        <Card className="mt-6">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg md:text-xl">
                  <Network className="h-5 w-5" />
                  Sub-Keys Management
                </CardTitle>
                <CardDescription className="text-xs md:text-sm">
                  Create and manage sub-keys with allocated quotas from this {data.token.keyType} key
                </CardDescription>
              </div>
              <Button onClick={handleToggleSubKeyForm} variant="outline" className="gap-2 w-full sm:w-auto">
                <Plus className="h-4 w-4" />
                <span className="text-sm">Create Sub-Key</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quota Overview */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card className="bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs md:text-sm font-medium">Allocated Quota</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs md:text-sm text-muted-foreground">RPD:</span>
                    <span className="font-mono text-xs md:text-sm font-semibold">
                      {data.allocatedQuota.rpd} / {data.token.maxRPD}
                    </span>
                  </div>
                  <Progress
                    value={(data.allocatedQuota.rpd / data.token.maxRPD) * 100}
                    className="h-2"
                  />
                  <div className="flex justify-between items-center mt-3">
                    <span className="text-xs md:text-sm text-muted-foreground">RPM:</span>
                    <span className="font-mono text-xs md:text-sm font-semibold">
                      {data.allocatedQuota.rpm} / {data.token.maxRPM}
                    </span>
                  </div>
                  <Progress
                    value={(data.allocatedQuota.rpm / data.token.maxRPM) * 100}
                    className="h-2"
                  />
                </CardContent>
              </Card>

              <Card className="bg-muted/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-xs md:text-sm font-medium">Available Quota</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs md:text-sm text-muted-foreground">RPD Available:</span>
                    <span className="font-mono text-xs md:text-sm font-semibold text-green-600">
                      {data.availableQuota.rpd}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs md:text-sm text-muted-foreground">RPM Available:</span>
                    <span className="font-mono text-xs md:text-sm font-semibold text-green-600">
                      {data.availableQuota.rpm}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Available quota can be allocated to new sub-keys
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Create Sub-Key Form */}
            {showSubKeyForm && (
              <div ref={subKeyFormRef}>
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-base md:text-lg">Create New Sub-Key</CardTitle>
                    <CardDescription className="text-xs md:text-sm">
                      Allocate quota from this key to create a new sub-key
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                      <div className="space-y-2">
                        <Label htmlFor="subKeyName" className="text-xs md:text-sm">Sub-Key Name</Label>
                        <Input
                          id="subKeyName"
                          placeholder="My Sub-Key"
                          value={subKeyName}
                          onChange={(e) => setSubKeyName(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="subKeyRPD" className="text-xs md:text-sm">
                          Max RPD (Avail: {data.availableQuota.rpd})
                        </Label>
                        <Input
                          id="subKeyRPD"
                          type="number"
                          placeholder="100"
                          value={subKeyRPD}
                          onChange={(e) => setSubKeyRPD(e.target.value)}
                          max={data.availableQuota.rpd}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="subKeyRPM" className="text-xs md:text-sm">
                          Max RPM (Avail: {data.availableQuota.rpm})
                        </Label>
                        <Input
                          id="subKeyRPM"
                          type="number"
                          placeholder="10"
                          value={subKeyRPM}
                          onChange={(e) => setSubKeyRPM(e.target.value)}
                          max={data.availableQuota.rpm}
                          className="text-sm"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="subKeyExpiration" className="text-xs md:text-sm">
                          Expiration (UTC, Optional)
                        </Label>
                        <Input
                          id="subKeyExpiration"
                          type="datetime-local"
                          value={subKeyExpiration}
                          onChange={(e) => setSubKeyExpiration(e.target.value)}
                          className="text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        onClick={handleCreateSubKey}
                        disabled={isCreatingSubKey}
                        className="gap-2 w-full sm:w-auto"
                      >
                        {isCreatingSubKey ? "Creating..." : "Create Sub-Key"}
                      </Button>
                      <Button
                        onClick={() => setShowSubKeyForm(false)}
                        variant="outline"
                        className="w-full sm:w-auto"
                      >
                        Cancel
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Sub-Keys List */}
            {data.subKeys && data.subKeys.length > 0 ? (
              <div className="space-y-3">
                <h3 className="font-semibold text-sm md:text-base">Active Sub-Keys ({data.subKeys.length})</h3>
                {data.subKeys.map((subKey: any) => {
                  const isExpired = subKey.expiresAt && subKey.expiresAt <= Date.now();
                  const isDisabled = subKey.disabled || false;
                  return (
                    <Card key={subKey.id} className={`border-l-4 ${isExpired || isDisabled ? 'border-l-red-500' : 'border-l-primary/50'}`}>
                      <CardContent className="pt-4 md:pt-6">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs md:text-sm text-muted-foreground mb-1">Name</div>
                              <div className="font-semibold text-sm md:text-base break-words">{subKey.name}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {isExpired && (
                                  <Badge variant="destructive" className="text-xs">Expired</Badge>
                                )}
                                {isDisabled ? (
                                  <Badge variant="destructive" className="text-xs">Disabled</Badge>
                                ) : (
                                  <Badge variant="default" className="text-xs bg-green-600">Online</Badge>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs md:text-sm text-muted-foreground mb-1">Token</div>
                              <div className="flex items-start gap-2 flex-wrap">
                                <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all flex-1 min-w-0">
                                  {subKey.token}
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => copyToClipboard(subKey.token)}
                                  className="h-7 px-2 flex-shrink-0"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-3">
                              <div>
                                <div className="text-xs md:text-sm text-muted-foreground mb-1">Max RPD</div>
                                <Badge variant="secondary" className="text-xs">{subKey.maxRPD}</Badge>
                              </div>
                              <div>
                                <div className="text-xs md:text-sm text-muted-foreground mb-1">Max RPM</div>
                                <Badge variant="secondary" className="text-xs">{subKey.maxRPM}</Badge>
                              </div>
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div>
                              <div className="text-xs md:text-sm text-muted-foreground mb-2">Today's Usage</div>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs md:text-sm">
                                  {subKey.usedRPD} / {subKey.maxRPD}
                                </span>
                                <span className="text-xs md:text-sm text-muted-foreground">
                                  {subKey.remainingRPD} remaining
                                </span>
                              </div>
                              <Progress
                                value={(subKey.usedRPD / subKey.maxRPD) * 100}
                                className="h-2"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <div className="text-xs md:text-sm text-muted-foreground mb-1">Created</div>
                                <div className="text-xs md:text-sm break-words">{formatDate(subKey.createdAt)}</div>
                              </div>
                              {subKey.expiresAt && (
                                <div>
                                  <div className="text-xs md:text-sm text-muted-foreground mb-1">Expires</div>
                                  <div className={`text-xs md:text-sm break-words ${isExpired ? 'text-red-600 font-semibold' : ''}`}>
                                    {formatDate(subKey.expiresAt)}
                                  </div>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                onClick={() => handleToggleSubKeyStatus(subKey.id, subKey.name, isDisabled)}
                                disabled={togglingSubKeyId === subKey.id}
                                variant={isDisabled ? "default" : "outline"}
                                size="sm"
                                className="w-full gap-2 text-xs md:text-sm"
                              >
                                <Power className="h-3 w-3 md:h-4 md:w-4" />
                                {togglingSubKeyId === subKey.id
                                  ? (isDisabled ? "Enabling..." : "Disabling...")
                                  : (isDisabled ? "Enable Sub-Key" : "Disable Sub-Key")}
                              </Button>
                              <Button
                                onClick={() => handleDeleteSubKey(subKey.id, subKey.name)}
                                disabled={deletingSubKeyId === subKey.id}
                                variant="destructive"
                                size="sm"
                                className="w-full gap-2 text-xs md:text-sm"
                              >
                                <Trash2 className="h-3 w-3 md:h-4 md:w-4" />
                                {deletingSubKeyId === subKey.id ? "Deleting..." : "Delete Sub-Key"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Network className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm md:text-base">No sub-keys created yet</p>
                <p className="text-xs md:text-sm">Create a sub-key to allocate quota from this key</p>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
