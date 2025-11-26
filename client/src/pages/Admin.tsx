import { useState, useEffect } from "react";
import { Header } from "@/components/Header";
import { AdminProviderForm } from "@/components/AdminProviderForm";
import { AdminProviderList } from "@/components/AdminProviderList";
import { AdminUserTokenForm } from "@/components/AdminUserTokenForm";
import { AdminUserTokenList } from "@/components/AdminUserTokenList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function Admin() {
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState("providers");
  // authToken removed as we use session cookies now
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.checkAuth()
      .then(() => setIsAuthenticated(true))
      .catch(() => setIsAuthenticated(false));
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
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
      await api.adminLogin(username, password);
      setIsAuthenticated(true);
      toast({
        title: "Login Successful",
        description: "Welcome to the admin dashboard!",
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="w-full max-w-md p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-semibold mb-2">Admin Login</h1>
            <p className="text-sm text-muted-foreground">
              Enter your credentials to access the admin panel
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                data-testid="input-admin-username"
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
                data-testid="input-admin-password"
              />
            </div>

            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              data-testid="button-admin-login"
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground text-center mt-4">
            Configure credentials in .env file (ADMIN_USERNAME and ADMIN_PASSWORD)
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Admin Dashboard</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Manage providers, user tokens, and system settings
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
              data-testid="tab-providers"
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
              data-testid="tab-tokens"
            >
              User Tokens
            </button>
          </div>

          {activeTab === "providers" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-xl font-semibold mb-4">Add New Provider</h2>
                <div className="max-w-2xl">
                  <AdminProviderForm />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Existing Providers</h2>
                <AdminProviderList />
              </div>
            </div>
          )}

          {activeTab === "tokens" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-xl font-semibold mb-4">Create New Token</h2>
                <div className="max-w-2xl">
                  <AdminUserTokenForm />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-semibold mb-4">Existing Tokens</h2>
                <AdminUserTokenList />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
