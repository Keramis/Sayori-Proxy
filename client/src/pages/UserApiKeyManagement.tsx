import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import {
  Copy,
  RefreshCw,
  Eye,
  EyeOff,
  Key,
  AlertTriangle,
  Gauge,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { UserUsageDashboard } from "@/components/UserUsageDashboard";

export default function UserApiKeyManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [showKey, setShowKey] = useState(false);
  const [isRegenerateDialogOpen, setIsRegenerateDialogOpen] = useState(false);

  // Redirect if not authenticated
  if (!user) {
    navigate("/");
    return null;
  }

  // Fetch API key
  const { data: apiKeyData, isLoading } = useQuery({
    queryKey: ["/api/user/api-key"],
    queryFn: api.getUserApiKey,
  });

  // Rotate API key mutation
  const rotateMutation = useMutation({
    mutationFn: api.rotateUserApiKey,
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/user/api-key"], data);
      toast({
        title: "API Key Rotated",
        description: "Your API key has been successfully regenerated.",
      });
      setIsRegenerateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Rotation Failed",
        description:
          error.message || "Failed to rotate API key. Please try again later.",
        variant: "destructive",
      });
    },
  });

  const handleCopyKey = () => {
    if (apiKeyData?.apiKey) {
      navigator.clipboard.writeText(apiKeyData.apiKey);
      toast({
        title: "Copied!",
        description: "API key copied to clipboard.",
      });
    }
  };

  const handleRegenerateKey = () => {
    rotateMutation.mutate();
  };

  // Censor API key - show first 8 characters, rest as asterisks
  const censoredKey = apiKeyData?.apiKey
    ? `${apiKeyData.apiKey.substring(0, 8)}${"*".repeat(apiKeyData.apiKey.length - 8)}`
    : "••••••••••••••••••••••••••••••••";

  const displayKey = showKey ? apiKeyData?.apiKey : censoredKey;

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-6 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">API Key Management</h1>
          <p className="text-muted-foreground">
            Manage your personal API key for accessing the platform.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Your Personal API Key
            </CardTitle>
            <CardDescription>
              This key is unique to your account and will be used for
              authentication in the future. Currently, this key is decorative
              and has no function on the platform.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* API Key Display */}
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="api-key"
                      type="text"
                      value={displayKey}
                      readOnly
                      className="font-mono text-sm flex-1"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setShowKey(!showKey)}
                      title={showKey ? "Hide key" : "Show key"}
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handleCopyKey}
                      disabled={!apiKeyData?.apiKey}
                      title="Copy to clipboard"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Keep this key secure. Do not share it with anyone.
                  </p>
                </div>

                {/* Key Metadata */}
                {apiKeyData && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                    <div>
                      <Label className="text-xs text-muted-foreground">
                        Created At
                      </Label>
                      <p className="text-sm font-medium">
                        {formatDate(apiKeyData.createdAt)}
                      </p>
                    </div>
                    {apiKeyData.lastRotatedAt && (
                      <div>
                        <Label className="text-xs text-muted-foreground">
                          Last Rotated
                        </Label>
                        <p className="text-sm font-medium">
                          {formatDate(apiKeyData.lastRotatedAt)}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Rate Limits */}
                {apiKeyData && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <Gauge className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-semibold">Rate Limits</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="rounded-lg border p-3">
                        <Label className="text-xs text-muted-foreground">
                          Max Requests Per Day
                        </Label>
                        <p className="text-2xl font-bold tabular-nums">
                          {apiKeyData.maxRPD}
                        </p>
                      </div>
                      <div className="rounded-lg border p-3">
                        <Label className="text-xs text-muted-foreground">
                          Max Requests Per Minute
                        </Label>
                        <p className="text-2xl font-bold tabular-nums">
                          {apiKeyData.maxRPM}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                {/* Warning Notice */}
                <div className="flex items-start gap-3 p-4 bg-blue-300/10 border bg-blue-300/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-blue-500">Limits</p>
                    <p className="text-sm text-muted-foreground">
                      Currently limits are applied equally to all users equally,
                      in the future users will have different limits based on
                      role. These are your global limits on the platform, each
                      provider has their own rate limits which work separately
                      from these. Be cognizant of that.
                    </p>
                  </div>
                </div>

                {/* Regenerate Button */}
                <div className="pt-4 border-t">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold mb-1">
                        Regenerate API Key
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Generate a new API key. Your old key will be immediately
                        invalidated. You can only regenerate your key once every
                        5 minutes.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={() => setIsRegenerateDialogOpen(true)}
                      disabled={rotateMutation.isPending}
                    >
                      {rotateMutation.isPending ? (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Regenerate
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Warning Notice */}
                <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-amber-500">
                      Important Notice
                    </p>
                    <p className="text-sm text-muted-foreground">
                      User API keys are still in beta. If you find any issues,
                      make sure to report them on Discord via the
                      #holy-fuck-help-the-world-is-burning channel.
                    </p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Usage Statistics */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Usage Statistics
            </CardTitle>
            <CardDescription>
              Your API usage breakdown by model, provider, and time period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UserUsageDashboard />
          </CardContent>
        </Card>
      </main>

      {/* Regenerate Confirmation Dialog */}
      {isRegenerateDialogOpen && (
        <AlertDialog
          open={isRegenerateDialogOpen}
          onOpenChange={setIsRegenerateDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
              <AlertDialogDescription>
                This will generate a new API key and immediately invalidate your
                current key. Any applications using the old key will stop
                working. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={rotateMutation.isPending}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRegenerateKey}
                disabled={rotateMutation.isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {rotateMutation.isPending ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  "Regenerate Key"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
