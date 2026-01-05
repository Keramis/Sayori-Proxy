import { useLocation } from "wouter";
import { Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { DiscordLoginButton } from "./DiscordLoginButton";
import { UserMenu } from "./UserMenu";
import { Skeleton } from "@/components/ui/skeleton";

interface HeaderProps {
  hideProviderLogin?: boolean;
}

export function Header({ hideProviderLogin = false }: HeaderProps) {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading } = useAuth();

  // Check user roles
  const roles = user?.roles || ["user"];
  const isProvider = roles.includes("provider");
  const isAdmin = roles.includes("admin");

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0"
          data-testid="link-home"
        >
          <img src="/assets/fruin_icon.png" alt="Fruin Icon" className="h-8 w-auto object-contain" />
          <h1 className="font-script text-3xl text-primary">Sayori Proxy</h1>
        </button>
        
        <div className="flex items-center gap-3">
          {/* Show role-based dashboard links for authenticated users */}
          {!hideProviderLogin && isAuthenticated && (
            <>
              {isAdmin && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/admin")}
                >
                  Admin Dashboard
                </Button>
              )}
              {isProvider && (
                <Button
                  variant="outline"
                  onClick={() => navigate("/provider")}
                >
                  Provider Dashboard
                </Button>
              )}
            </>
          )}
          
          {/* Discord Auth Section */}
          {isLoading ? (
            <Skeleton className="h-10 w-10 rounded-full" />
          ) : isAuthenticated ? (
            <UserMenu />
          ) : (
            <DiscordLoginButton size="default" />
          )}
          
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
