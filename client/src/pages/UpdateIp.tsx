import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldAlert, CheckCircle, Loader2, LogIn } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { DiscordLoginButton } from "@/components/DiscordLoginButton";

type PageState = "confirm" | "loading" | "success";

export default function UpdateIp() {
  const { isLoading, isAuthenticated, updateIp } = useAuth();
  const [, navigate] = useLocation();

  const [pageState, setPageState] = useState<PageState>("confirm");
  const [error, setError] = useState<string | null>(null);

  const ip = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("ip");
  }, []);

  const currentPath = useMemo(
    () => `${window.location.pathname}${window.location.search}`,
    [],
  );

  const handleUpdate = async () => {
    if (!ip) return;
    setError(null);
    setPageState("loading");
    try {
      await updateIp(ip);
      setPageState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update IP");
      setPageState("confirm");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
              <LogIn className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold">Login Required</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              You need to be logged in to update your IP.
            </p>
            <DiscordLoginButton returnTo={currentPath} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!ip) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
        <h1 className="font-script text-6xl mb-4 christmas-gradient-text drop-shadow-md pb-2">
          Sayori Proxy
        </h1>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit mb-4">
              <ShieldAlert className="h-10 w-10 text-destructive" />
            </div>
            <CardTitle className="text-2xl font-bold text-destructive">
              Invalid Link
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              Invalid link. No IP address specified.
            </p>
            <Button variant="outline" onClick={() => navigate("/")}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (pageState === "success") {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
        <h1 className="font-script text-6xl mb-4 christmas-gradient-text drop-shadow-md pb-2 mr-2">
          Sayori Proxy
        </h1>
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto bg-emerald-500/10 p-3 rounded-full w-fit mb-4">
              <CheckCircle className="h-10 w-10 text-emerald-500" />
            </div>
            <CardTitle className="text-2xl font-bold text-emerald-600">
              IP Updated
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-muted-foreground">
              IP updated successfully! You can now go back to using the API.
            </p>
            <Button onClick={() => navigate("/")}>Go Home</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isSubmitting = pageState === "loading";

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background p-4 gap-6">
      <h1 className="font-script text-6xl mb-4 christmas-gradient-text drop-shadow-md pb-2">
        Sayori Proxy
      </h1>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-4">
            <ShieldAlert className="h-10 w-10 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold">
            Update Authorized IP
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center">
            Your authorized IP will be changed to{" "}
            <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
              {ip}
            </code>
            . After updating, you won't be able to change it again for 30
            minutes.
          </p>

          {error && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm text-center">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={handleUpdate}
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSubmitting ? "Updating..." : "Do it!"}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => navigate("/")}
              disabled={isSubmitting}
            >
              Nevermind...
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
