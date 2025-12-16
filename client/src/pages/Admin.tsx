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
      <div className="min-h-screen bg-background flex items-center justify-center cyber-grid">
        <Card className="w-full max-w-md p-8 glow-border scanlines">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-sm bg-primary/20 mb-4 glow-border">
              <Shield className="h-8 w-8 text-primary terminal-text" />
            </div>
            <h1 className="text-2xl font-mono font-semibold mb-2 terminal-text">System Control</h1>
            <p className="text-sm font-mono text-muted-foreground terminal-text">
              Authenticate to access system control panel
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="terminal-text">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="terminal-text"
                data-testid="input-admin-username"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="terminal-text">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="terminal-text"
                data-testid="input-admin-password"
              />
            </div>

            {error && (
              <div className="text-sm font-mono text-destructive terminal-text">{error}</div>
            )}

            <Button
              type="submit"
              className="w-full hack-button"
              disabled={loading}
              data-testid="button-admin-login"
            >
              {loading ? "Authenticating..." : "Initialize Session"}
            </Button>
          </form>

          <p className="text-xs font-mono text-muted-foreground text-center mt-4 terminal-text">
            Configure credentials in .env file (ADMIN_USERNAME and ADMIN_PASSWORD)
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background cyber-grid">
      <Header />

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl font-mono font-semibold mb-2 terminal-text">System Control Panel</h1>
            <p className="font-mono text-muted-foreground text-sm sm:text-base terminal-text">
              Manage nodes, access keys, and system configuration
            </p>
          </div>
          <Button variant="outline" onClick={handleLogout} className="terminal-text">Terminate Session</Button>
        </div>

        <div className="space-y-6">
          <div className="flex space-x-1 rounded-sm bg-muted/50 p-1 glow-border">
            <button
              onClick={() => setActiveTab("providers")}
              className={cn(
                "w-full rounded-sm py-2.5 text-sm font-mono font-medium leading-5 ring-primary ring-opacity-60 ring-offset-2 ring-offset-background focus:outline-none focus:ring-2 terminal-text",
                activeTab === "providers"
                  ? "bg-background text-foreground shadow glow-border"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
              )}
              data-testid="tab-providers"
            >
              Nodes
            </button>
            <button
              onClick={() => setActiveTab("tokens")}
              className={cn(
                "w-full rounded-sm py-2.5 text-sm font-mono font-medium leading-5 ring-primary ring-opacity-60 ring-offset-2 ring-offset-background focus:outline-none focus:ring-2 terminal-text",
                activeTab === "tokens"
                  ? "bg-background text-foreground shadow glow-border"
                  : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
              )}
              data-testid="tab-tokens"
            >
              Access Keys
            </button>
          </div>

          {activeTab === "providers" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-xl font-mono font-semibold mb-4 terminal-text">Initialize New Node</h2>
                <div className="max-w-2xl">
                  <AdminProviderForm />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-mono font-semibold mb-4 terminal-text">Active Nodes</h2>
                <AdminProviderList />
              </div>
            </div>
          )}

          {activeTab === "tokens" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-xl font-mono font-semibold mb-4 terminal-text">Generate New Access Key</h2>
                <div className="max-w-2xl">
                  <AdminUserTokenForm />
                </div>
              </div>

              <div>
                <h2 className="text-xl font-mono font-semibold mb-4 terminal-text">Active Access Keys</h2>
                <AdminUserTokenList />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
