import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { LogOut, User, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

export function UserMenu() {
  const { user, logout, isLoading, updateIp } = useAuth();
  const { toast } = useToast();
  const [isUpdatingIp, setIsUpdatingIp] = useState(false);
  
  if (!user) return null;
  
  const displayName = user.globalName || user.username;
  const initials = displayName.slice(0, 2).toUpperCase();

  const authorizedIp = localStorage.getItem('authorized_ip') || user.authorizedIp;
  const currentIp = user.currentIp;
  const isIpMismatch = authorizedIp && currentIp && authorizedIp !== currentIp;

  // Censor IP (e.g. 192.168.1.1 -> 192.168.*.*)
  const censoredIp = authorizedIp
    ? authorizedIp.split('.').map((part, index) => index < 2 ? part : '*').join('.')
    : 'Unknown IP';

  const handleUpdateIp = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (isUpdatingIp) return;
    setIsUpdatingIp(true);
    
    try {
      await updateIp();
      toast({
        title: "IP Updated",
        description: "Your authorized IP has been updated successfully.",
        variant: "default",
      });
    } catch (error: any) {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update IP address.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingIp(false);
    }
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src={user.avatarUrl} alt={displayName} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-64" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{displayName}</p>
            {user.email && (
              <p className="text-xs leading-none text-muted-foreground mb-2">
                {user.email}
              </p>
            )}
            
            {/* IP Display Section */}
            <div className={`flex items-center justify-between p-2 rounded-md border ${isIpMismatch ? 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-muted/50 border-transparent'}`}>
              <div className="flex flex-col">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">
                  Authorized IP
                </span>
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-mono ${isIpMismatch ? 'text-red-600 dark:text-red-400 font-bold' : 'text-foreground'}`}>
                    {censoredIp}
                  </span>
                  {isIpMismatch && (
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                  )}
                </div>
                {isIpMismatch && (
                  <span className="text-[10px] text-red-500 leading-tight mt-0.5">
                    IP mismatch detected
                  </span>
                )}
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleUpdateIp}
                disabled={isUpdatingIp}
                title="Update Authorized IP"
              >
                <RefreshCw className={`h-3 w-3 ${isUpdatingIp ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="cursor-pointer text-red-600 focus:text-red-600"
          onClick={() => logout()}
          disabled={isLoading}
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}