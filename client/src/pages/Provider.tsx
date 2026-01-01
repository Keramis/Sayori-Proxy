import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { ProviderProviderForm } from "@/components/ProviderProviderForm";
import { ProviderProviderList } from "@/components/ProviderProviderList";
import { ProviderUserTokenForm } from "@/components/ProviderUserTokenForm";
import { ProviderUserTokenList } from "@/components/ProviderUserTokenList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Key } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Provider() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("providers");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.checkProviderAuth()
      .then(() => setIsAuthenticated(true))
      .catch(() => setIsAuthenticated(false));
  }, []);

  const handleLogout = async () => {
    try {
      await api.providerLogout();
      setIsAuthenticated(false);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.providerLogin(username, password);
      setIsAuthenticated(true);
      toast({
        title: "Login Successful",
        description: "Welcome to the provider panel!",
      });
    } catch (err: any) {
      const errorMessage = "Wrong Username or Password";
      setError(errorMessage);
      toast({
        title: "Authentication Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Provider Login
            </CardTitle>
            <CardDescription>
              Sign in to manage your providers and tokens
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="provider"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  data-testid="input-provider-username"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="input-provider-password"
                />
              </div>

              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
                data-testid="button-provider-login"
              >
                {loading ? "Logging in..." : "Login"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full mt-2"
                onClick={() => navigate("/")}
              >
                Back to Home
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header hideProviderLogin={true} />

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Provider Panel</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Manage your providers, API keys, and user tokens
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout}>Logout</Button>
        </div>

        <div className="space-y-6">
          <div className="flex space-x-1 rounded-xl bg-muted p-1">
            <button
              onClick={() => setActiveTab("providers")}
              className={cn(
                "w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2",
                activeTab === "providers"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:bg-white/[0.12] hover:text-white"
              )}
              data-testid="tab-provider-providers"
            >
              Providers
            </button>
            <button
              onClick={() => setActiveTab("tokens")}
              className={cn(
                "w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-white ring-opacity-60 ring-offset-2 ring-offset-blue-400 focus:outline-none focus:ring-2",
                activeTab === "tokens"
                  ? "bg-background text-foreground shadow"
                  : "text-muted-foreground hover:bg-white/[0.12] hover:text-white"
              )}
              data-testid="tab-provider-tokens"
            >
              User Tokens
            </button>
          </div>

          {activeTab === "providers" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-xl font-semibold mb-4">Add New Provider</h2>
                <div className="max-w-2xl">
                  <ProviderProviderForm />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Existing Providers</h2>
                <ProviderProviderList />
              </div>
            </div>
          )}

          {activeTab === "tokens" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-xl font-semibold mb-4">Create New Token</h2>
                <div className="max-w-2xl">
                  <ProviderUserTokenForm />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Existing Tokens</h2>
                <ProviderUserTokenList />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
