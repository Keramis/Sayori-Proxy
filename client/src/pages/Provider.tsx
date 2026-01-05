import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Header } from "@/components/Header";
import { ProviderProviderForm } from "@/components/ProviderProviderForm";
import { ProviderProviderList } from "@/components/ProviderProviderList";
import { ProviderUserTokenForm } from "@/components/ProviderUserTokenForm";
import { ProviderUserTokenList } from "@/components/ProviderUserTokenList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert, Briefcase } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DiscordLoginButton } from "@/components/DiscordLoginButton";
import { cn } from "@/lib/utils";

export default function Provider() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("providers");

  // Check if user has provider role
  const roles = user?.roles || [];
  const isProvider = roles.includes("provider");

  // Redirect to home if not authenticated or not a provider
  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !isProvider)) {
      // Don't redirect immediately, show access denied message
    }
  }, [isLoading, isAuthenticated, isProvider]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Show login prompt if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Provider Dashboard
            </CardTitle>
            <CardDescription>
              Sign in with Discord to access the provider dashboard
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You need to be logged in with a Discord account that has provider permissions to access this page.
            </p>
            <DiscordLoginButton size="lg" className="w-full" />
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show access denied if authenticated but not a provider
  if (!isProvider) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" />
              Access Denied
            </CardTitle>
            <CardDescription>
              You don't have permission to access this page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              The provider dashboard is only accessible to users with provider permissions.
              Please contact an administrator if you believe you should have access.
            </p>
            <Button
              type="button"
              variant="default"
              className="w-full"
              onClick={() => navigate("/")}
            >
              Back to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // User is authenticated and has provider role - show dashboard
  return (
    <div className="min-h-screen bg-background">
      <Header hideProviderLogin={true} />

      <main className="container mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold mb-2">Provider Dashboard</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Manage your providers, API keys, and user tokens
            </p>
          </div>
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
