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
import { Ban, ShieldCheck, Wifi, WifiOff, Shield, Briefcase, UserCog, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  globalName?: string;
  avatar?: string;
  avatarUrl: string;
  createdAt: number;
  lastLoginAt: number;
  ip?: string;
  lastIpUpdate?: number;
  banned?: boolean;
  banReason?: string;
  roles?: string[];
}

export function AdminUserList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [rolesDialogOpen, setRolesDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DiscordUser | null>(null);
  const [banReason, setBanReason] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: users = [], isLoading } = useQuery<DiscordUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => api.getDiscordUsers(),
  });

  // Filter users based on search query (ID, IP, or Username)
  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;

    const query = searchQuery.toLowerCase();
    return users.filter((user) => {
      const matchesId = user.id.toLowerCase().includes(query);
      const matchesUsername = user.username.toLowerCase().includes(query);
      const matchesGlobalName = (user.globalName || "").toLowerCase().includes(query);
      const matchesIp = (user.ip || "").toLowerCase().includes(query);

      return matchesId || matchesUsername || matchesGlobalName || matchesIp;
    });
  }, [users, searchQuery]);

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

  const handleDeleteClick = (user: DiscordUser) => {
    setSelectedUser(user);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (selectedUser) {
      deleteMutation.mutate(selectedUser.id);
    }
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

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => api.deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setDeleteDialogOpen(false);
      setSelectedUser(null);
      toast({
        title: "User Deleted",
        description: "User data has been anonymized per LGPD/GDPR right to erasure.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete user",
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

  const updateRolesMutation = useMutation({
    mutationFn: ({ userId, roles }: { userId: string; roles: string[] }) => api.updateUserRoles(userId, roles),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setRolesDialogOpen(false);
      setSelectedUser(null);
      setSelectedRoles([]);
      toast({
        title: "Roles Updated",
        description: "User roles have been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user roles",
        variant: "destructive",
      });
    },
  });

  const handleRolesClick = (user: DiscordUser) => {
    setSelectedUser(user);
    setSelectedRoles(user.roles || ["user"]);
    setRolesDialogOpen(true);
  };

  const handleRolesConfirm = () => {
    if (selectedUser) {
      updateRolesMutation.mutate({ userId: selectedUser.id, roles: selectedRoles });
    }
  };

  const toggleRole = (role: string) => {
    setSelectedRoles(prev => {
      if (prev.includes(role)) {
        // Always keep at least "user" role
        if (role === "user" && prev.length === 1) return prev;
        return prev.filter(r => r !== role);
      } else {
        return [...prev, role];
      }
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading users...</div>;
  }

  return (
    <>
      {/* Search Section */}
      <Card className="p-4 mb-4">
        <div className="space-y-2">
          <Label htmlFor="user-search">Search Users</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="user-search"
              placeholder="Search by username, Discord ID, or IP..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {searchQuery && (
            <p className="text-sm text-muted-foreground">
              Showing {filteredUsers.length} of {users.length} users
            </p>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <Table>
        <TableHeader>
          <TableRow>
            <TableHead>User</TableHead>
            <TableHead>Discord ID</TableHead>
            <TableHead>Roles</TableHead>
            <TableHead>Authorized IP</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredUsers.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                {searchQuery ? "No users match your search." : "No users found."}
              </TableCell>
            </TableRow>
          ) : (
            filteredUsers.map((user) => (
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
                  <div className="flex flex-wrap gap-1">
                    {(user.roles || ["user"]).map(role => (
                      <Badge
                        key={role}
                        variant={role === "admin" ? "destructive" : role === "provider" ? "default" : "secondary"}
                        className="text-xs"
                      >
                        {role === "admin" && <Shield className="h-3 w-3 mr-1" />}
                        {role === "provider" && <Briefcase className="h-3 w-3 mr-1" />}
                        {role}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRolesClick(user)}
                    disabled={updateRolesMutation.isPending}
                    title="Manage Roles"
                    className="align-middle"
                  >
                    <UserCog className="h-4 w-4" />
                    Roles
                  </Button>
                  {user.ip && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => revokeIpMutation.mutate(user.id)}
                      disabled={revokeIpMutation.isPending}
                      title="Revoke IP"
                      className="align-middle"
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
                      className="align-middle"
                    >
                      Unban
                    </Button>
                  ) : (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleBanClick(user)}
                      disabled={banMutation.isPending}
                      className="align-middle"
                    >
                      Ban
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteClick(user)}
                    disabled={deleteMutation.isPending || (user.roles || ["user"]).includes("admin")}
                    title={user.roles?.includes("admin") ? "Cannot delete admin accounts" : "Delete user and anonymize logs (LGPD/GDPR)"}
                    className="align-middle"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
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

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              You are about to permanently delete {selectedUser?.globalName || selectedUser?.username}.
              This action cannot be undone. The user's request log entries will have their IP addresses
              irreversibly hashed (LGPD/GDPR right to erasure), and the user link will be severed.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground">
              All of the following will be anonymized or removed:
            </p>
            <ul className="list-disc list-inside text-sm text-muted-foreground mt-2 space-y-1">
              <li>User account deleted from discord_users</li>
              <li>User API keys revoked</li>
              <li>IP addresses replaced with one-way irreversible hashes in request logs</li>
              <li>User reference removed from all logs</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setSelectedUser(null);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rolesDialogOpen} onOpenChange={setRolesDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage User Roles</DialogTitle>
            <DialogDescription>
              Update roles for {selectedUser?.globalName || selectedUser?.username}.
              Note: Only Super Admin (password login) can assign the admin role.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="role-user"
                  checked={selectedRoles.includes("user")}
                  onCheckedChange={() => toggleRole("user")}
                  disabled={selectedRoles.length === 1 && selectedRoles.includes("user")}
                />
                <label
                  htmlFor="role-user"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  User (Default)
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="role-provider"
                  checked={selectedRoles.includes("provider")}
                  onCheckedChange={() => toggleRole("provider")}
                />
                <label
                  htmlFor="role-provider"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                >
                  <Briefcase className="h-4 w-4" />
                  Provider
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="role-admin"
                  checked={selectedRoles.includes("admin")}
                  onCheckedChange={() => toggleRole("admin")}
                />
                <label
                  htmlFor="role-admin"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-1"
                >
                  <Shield className="h-4 w-4" />
                  Admin (Super Admin only)
                </label>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Users must have at least the "user" role. Providers can manage their own providers and tokens. Admins have full access except promoting users to admin.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRolesDialogOpen(false);
                setSelectedUser(null);
                setSelectedRoles([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRolesConfirm}
              disabled={updateRolesMutation.isPending || selectedRoles.length === 0}
            >
              {updateRolesMutation.isPending ? "Updating..." : "Update Roles"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}