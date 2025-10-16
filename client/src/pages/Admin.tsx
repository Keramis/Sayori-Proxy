import { useState } from "react";
import { Header } from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function Admin() {
  const { toast } = useToast();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await api.adminLogin(username, password);
      setAuthToken(result.token);
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
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Admin Dashboard</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Manage providers, user tokens, and system settings
          </p>
        </div>

        <Tabs defaultValue="providers" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="providers" data-testid="tab-providers">Providers</TabsTrigger>
            <TabsTrigger value="tokens" data-testid="tab-tokens">User Tokens</TabsTrigger>
          </TabsList>

          <TabsContent value="providers" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Add New Provider</h2>
              <div className="max-w-2xl">
                <AdminProviderForm authToken={authToken} />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Existing Providers</h2>
              <AdminProviderList authToken={authToken} />
            </div>
          </TabsContent>

          <TabsContent value="tokens" className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-4">Create New Token</h2>
              <div className="max-w-2xl">
                <AdminUserTokenForm authToken={authToken} />
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-4">Existing Tokens</h2>
              <AdminUserTokenList authToken={authToken} />
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
