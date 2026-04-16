import { useLocation } from "wouter";
import { Shield, LayoutDashboard, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "./ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import { DiscordLoginButton } from "./DiscordLoginButton";
import { UserMenu } from "./UserMenu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
      <div className="container mx-auto px-4 md:px-6 py-4 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 bg-transparent border-none cursor-pointer p-0"
          data-testid="link-home"
        >
          <img src="/assets/fruin_icon.png" alt="Fruin Icon" className="h-8 w-auto object-contain" />
          <h1 className="font-script text-3xl text-primary">Sayori Proxy</h1>
        </button>
        
        <div className="flex items-center gap-3">
          {/* Show role-based panels dropdown for authenticated users */}
          {isAuthenticated && (isAdmin || isProvider) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Panels</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate("/admin")}>
                    <Shield className="mr-2 h-4 w-4" />
                    Admin Dashboard
                  </DropdownMenuItem>
                )}
                {isProvider && (
                  <DropdownMenuItem onClick={() => navigate("/provider")}>
                    <Briefcase className="mr-2 h-4 w-4" />
                    Provider Dashboard
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          
          {/* Discord Auth Section */}
          {isLoading ? (
            <Skeleton className="h-10 w-10 rounded-full" />
          ) : isAuthenticated ? (
            <UserMenu />
          ) : (
            <DiscordLoginButton size="default" responsive={true} />
          )}
          
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
