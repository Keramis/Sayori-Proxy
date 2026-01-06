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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { LogOut, User, RefreshCw, CheckCircle2, Shield, Briefcase } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

export function UserMenu() {
  const { user, logout, isLoading, updateIp } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isUpdatingIp, setIsUpdatingIp] = useState(false);
  const [isIpModalOpen, setIsIpModalOpen] = useState(false);
  const [customIp, setCustomIp] = useState('');
  
  if (!user) return null;
  
  const displayName = user.globalName || user.username;
  const initials = displayName.slice(0, 2).toUpperCase();

  // Check user roles
  const roles = user.roles || ["user"];
  const isProvider = roles.includes("provider");
  const isAdmin = roles.includes("admin");

  const authorizedIp = localStorage.getItem('authorized_ip') || user.authorizedIp;
  const currentIp = user.currentIp;

  // Censor IP - supports both IPv4 and IPv6
  const censoredIp = (() => {
    if (!authorizedIp) return 'Unknown IP';
    
    // Check if it's IPv6 (contains colons)
    if (authorizedIp.includes(':')) {
      // IPv6: Show first 2 segments, censor the rest
      // e.g., 2001:0db8:85a3:0000:0000:8a2e:0370:7334 -> 2001:0db8:****:****:****:****:****:****
      const segments = authorizedIp.split(':');
      if (segments.length > 2) {
        return segments.slice(0, 2).join(':') + ':' + '*'.repeat(4) + ':'.repeat(segments.length - 3) + '*'.repeat(4);
      }
      return authorizedIp; // Fallback for malformed IPv6
    } else {
      // IPv4: Show first 2 octets, censor the rest
      // e.g., 192.168.1.1 -> 192.168.*.*
      const parts = authorizedIp.split('.');
      if (parts.length === 4) {
        return parts.slice(0, 2).join('.') + '.*.*';
      }
      return authorizedIp; // Fallback for malformed IPv4
    }
  })();

  const handleOpenIpModal = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCustomIp('');
    setIsIpModalOpen(true);
  };

  const handleInsertCurrentIp = () => {
    if (currentIp) {
      setCustomIp(currentIp);
    }
  };

  const handleUpdateIp = async () => {
    if (isUpdatingIp) return;
    
    if (!customIp.trim()) {
      toast({
        title: "Invalid Input",
        description: "Please enter an IP address.",
        variant: "destructive",
      });
      return;
    }
    
    setIsUpdatingIp(true);
    
    try {
      await updateIp(customIp.trim());
      toast({
        title: "IP Updated",
        description: "Your authorized IP has been updated successfully.",
        variant: "default",
      });
      setIsIpModalOpen(false);
      setCustomIp('');
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
    <>
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
            
            {/* IP Display Section */}
            <div className="flex items-center justify-between p-2 rounded-md border bg-muted/50 border-transparent">
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[10px] uppercase text-muted-foreground font-semibold">
                  Authorized IP
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono truncate text-foreground" title={censoredIp}>
                    {censoredIp}
                  </span>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={handleOpenIpModal}
                disabled={isUpdatingIp}
                title="Update Authorized IP"
              >
                <RefreshCw className={`h-3 w-3 ${isUpdatingIp ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Role-based dashboard links */}
        {isAdmin && (
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate('/admin')}
          >
            <Shield className="mr-2 h-4 w-4" />
            <span>Admin Dashboard</span>
          </DropdownMenuItem>
        )}
        {isProvider && (
          <DropdownMenuItem
            className="cursor-pointer"
            onClick={() => navigate('/provider')}
          >
            <Briefcase className="mr-2 h-4 w-4" />
            <span>Provider Dashboard</span>
          </DropdownMenuItem>
        )}
        
        {(isAdmin || isProvider) && <DropdownMenuSeparator />}
        
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

    {/* IP Update Modal */}
    <Dialog open={isIpModalOpen} onOpenChange={setIsIpModalOpen}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Authorized IP</DialogTitle>
          <DialogDescription>
            Enter the IP address you want to authorize for your account. The cooldown still applies.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="ip-address">IP Address</Label>
            <Input
              id="ip-address"
              placeholder="e.g., 192.168.1.1 or 2001:db8::1"
              value={customIp}
              onChange={(e) => setCustomIp(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isUpdatingIp) {
                  handleUpdateIp();
                }
              }}
            />
            <button
              type="button"
              onClick={handleInsertCurrentIp}
              className="text-xs text-muted-foreground hover:text-foreground underline text-left"
            >
              Insert my current IP ({currentIp || 'unknown'})
            </button>
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsIpModalOpen(false)}
            disabled={isUpdatingIp}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleUpdateIp}
            disabled={isUpdatingIp}
          >
            {isUpdatingIp ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              'Update IP'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>
  );
}