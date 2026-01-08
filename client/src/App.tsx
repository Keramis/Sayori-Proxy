import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Dashboard from "@/pages/Dashboard";
import Admin from "@/pages/Admin";
import Provider from "@/pages/Provider";
import UserManage from "@/pages/UserManage";
import UserApiKeyManagement from "@/pages/UserApiKeyManagement";
import Banned from "@/pages/Banned";
import NotFound from "@/pages/not-found";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();
  
  // Show nothing while loading
  if (isLoading) {
    return null;
  }
  
  // If user is banned, redirect to /banned
  if (user?.banned) {
    return <Redirect to="/banned" />;
  }
  
  return <Component />;
}

function BannedRoute() {
  const { user, isLoading } = useAuth();
  
  // Show nothing while loading
  if (isLoading) {
    return null;
  }
  
  // If user is not banned, redirect to home
  if (user && !user.banned) {
    return <Redirect to="/" />;
  }
  
  return <Banned />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={(props) => <ProtectedRoute {...props} component={Dashboard} />} />
      <Route path="/admin" component={(props) => <ProtectedRoute {...props} component={Admin} />} />
      <Route path="/provider" component={(props) => <ProtectedRoute {...props} component={Provider} />} />
      <Route path="/user/manage" component={(props) => <ProtectedRoute {...props} component={UserManage} />} />
      <Route path="/api-key" component={(props) => <ProtectedRoute {...props} component={UserApiKeyManagement} />} />
      <Route path="/banned" component={BannedRoute} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider defaultTheme="light">
          <AuthProvider>
            <Toaster />
            <Router />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
