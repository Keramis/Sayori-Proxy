import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Ban, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  globalName?: string;
  email?: string;
  avatar?: string;
  avatarUrl: string;
  createdAt: number;
  lastLoginAt: number;
  ip?: string;
  lastIpUpdate?: number;
  banned?: boolean;
  banReason?: string;
}

export function AdminUserList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DiscordUser | null>(null);
  const [banReason, setBanReason] = useState("");

  const { data: users = [], isLoading } = useQuery<DiscordUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => api.getDiscordUsers(),
  });

  const banMutation = useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason?: string }) => api.banUser(userId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setBanDialogOpen(false);
      setSelectedUser(null);
      setBanReason("");
      toast({
        title: "User Banned",
        description: "The user has been successfully banned.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to ban user",
        variant: "destructive",
      });
    },
  });

  const handleBanClick = (user: DiscordUser) => {
    setSelectedUser(user);
    setBanDialogOpen(true);
  };

  const handleBanConfirm = () => {
    if (selectedUser) {
      banMutation.mutate({ userId: selectedUser.id, reason: banReason || undefined });
    }
  };

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => api.unbanUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "User Unbanned",
        description: "The user has been successfully unbanned.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to unban user",
        variant: "destructive",
      });
    },
  });

  const revokeIpMutation = useMutation({
    mutationFn: (userId: string) => api.revokeUserIp(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast({
        title: "IP Revoked",
        description: "The user's authorized IP has been revoked.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke IP",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground">Loading users...</div>;
  }

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Discord ID</TableHead>
            <TableHead>Authorized IP</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                No users found.
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow 
                key={user.id} 
                className={cn(user.banned && "opacity-50 bg-muted/50")}
              >
                <TableCell className="flex items-center gap-3">
                  <Avatar>
                    <AvatarImage src={user.avatarUrl} alt={user.username} />
                    <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className={cn("font-medium", user.banned && "line-through")}>
                      {user.globalName || user.username}
                    </span>
                    <span className="text-xs text-muted-foreground">@{user.username}</span>
                  </div>
                </TableCell>
                <TableCell className="font-mono text-xs">{user.id}</TableCell>
                <TableCell>
                  {user.ip ? (
                    <div className="flex items-center gap-2">
                      <Wifi className="h-4 w-4 text-green-500" />
                      <span className="font-mono text-xs">{user.ip}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <WifiOff className="h-4 w-4" />
                      <span className="text-xs">Not set</span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  {user.banned ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="destructive" className="flex w-fit items-center gap-1 cursor-help">
                            <Ban className="h-3 w-3" /> Banned
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="font-semibold">Ban Reason:</p>
                          <p>{user.banReason || "No reason provided"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : (
                    <Badge variant="default" className="flex w-fit items-center gap-1 bg-green-600 hover:bg-green-700">
                      <ShieldCheck className="h-3 w-3" /> Active
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right space-x-2">
                  {user.ip && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeIpMutation.mutate(user.id)}
                      disabled={revokeIpMutation.isPending}
                      title="Revoke IP"
                    >
                      Revoke IP
                    </Button>
                  )}
                  {user.banned ? (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => unbanMutation.mutate(user.id)}
                      disabled={unbanMutation.isPending}
                    >
                      Unban
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleBanClick(user)}
                      disabled={banMutation.isPending}
                    >
                      Ban
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        </Table>
      </Card>

      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ban User</DialogTitle>
            <DialogDescription>
              You are about to ban {selectedUser?.globalName || selectedUser?.username}.
              Please provide a reason for the ban.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="banReason">Ban Reason</Label>
              <Input
                id="banReason"
                placeholder="Enter ban reason (optional)"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                If no reason is provided, the default reason "Dictatorship" will be used.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBanDialogOpen(false);
                setSelectedUser(null);
                setBanReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleBanConfirm}
              disabled={banMutation.isPending}
            >
              {banMutation.isPending ? "Banning..." : "Ban User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}