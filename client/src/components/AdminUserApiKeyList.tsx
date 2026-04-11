import { useState, useMemo } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, Settings2, Search, Key } from "lucide-react";

interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  globalName?: string;
  avatar?: string;
  avatarUrl: string;
  banned?: boolean;
  roles?: string[];
}

interface UserApiKey {
  id: string;
  userId: string;
  apiKey: string;
  createdAt: number;
  lastRotatedAt?: number;
  maxRPD: number;
  maxRPM: number;
}

export function AdminUserApiKeyList() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [rateLimitDialogOpen, setRateLimitDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<DiscordUser | null>(null);
  const [selectedApiKey, setSelectedApiKey] = useState<UserApiKey | null>(null);
  const [editMaxRPD, setEditMaxRPD] = useState("");
  const [editMaxRPM, setEditMaxRPM] = useState("");

  const { data: users = [], isLoading: usersLoading } = useQuery<DiscordUser[]>({
    queryKey: ["admin", "users"],
    queryFn: () => api.getDiscordUsers(),
  });

  const filteredUsers = useMemo(() => {
    if (!searchQuery.trim()) return users;
    const query = searchQuery.toLowerCase();
    return users.filter((user) => {
      return (
        user.id.toLowerCase().includes(query) ||
        user.username.toLowerCase().includes(query) ||
        (user.globalName || "").toLowerCase().includes(query)
      );
    });
  }, [users, searchQuery]);

  const rotateMutation = useMutation({
    mutationFn: (userId: string) => api.adminRotateUserApiKey(userId),
    onSuccess: (_data, userId) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-api-key", userId] });
      toast({
        title: "Key Rotated",
        description: "The API key has been rotated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to rotate API key",
        variant: "destructive",
      });
    },
  });

  const updateLimitsMutation = useMutation({
    mutationFn: ({ userId, maxRPD, maxRPM }: { userId: string; maxRPD: number; maxRPM: number }) =>
      api.adminUpdateUserApiKeyLimits(userId, maxRPD, maxRPM),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-api-key", variables.userId] });
      setRateLimitDialogOpen(false);
      setSelectedUser(null);
      setSelectedApiKey(null);
      toast({
        title: "Rate Limits Updated",
        description: "The rate limits have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update rate limits",
        variant: "destructive",
      });
    },
  });

  const handleOpenRateLimits = (user: DiscordUser, apiKey: UserApiKey) => {
    setSelectedUser(user);
    setSelectedApiKey(apiKey);
    setEditMaxRPD(String(apiKey.maxRPD));
    setEditMaxRPM(String(apiKey.maxRPM));
    setRateLimitDialogOpen(true);
  };

  const handleRateLimitConfirm = () => {
    if (!selectedUser) return;
    const maxRPD = parseInt(editMaxRPD, 10);
    const maxRPM = parseInt(editMaxRPM, 10);
    if (isNaN(maxRPD) || isNaN(maxRPM) || maxRPD < 1 || maxRPM < 1) {
      toast({
        title: "Invalid Input",
        description: "Rate limits must be positive integers.",
        variant: "destructive",
      });
      return;
    }
    updateLimitsMutation.mutate({ userId: selectedUser.id, maxRPD, maxRPM });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const maskKey = (key: string) => {
    if (key.length <= 8) return "••••••••";
    return key.substring(0, 4) + "••••••••" + key.substring(key.length - 4);
  };

  if (usersLoading) {
    return <div className="text-muted-foreground">Loading user API keys...</div>;
  }

  return (
    <>
      <Card className="p-4 mb-4">
        <div className="space-y-2">
          <Label htmlFor="apikey-search">Search Users</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="apikey-search"
              placeholder="Search by username or Discord ID..."
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
              <TableHead>API Key</TableHead>
              <TableHead className="text-center">Max RPD</TableHead>
              <TableHead className="text-center">Max RPM</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Last Rotated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "No users match your search." : "No users found."}
                </TableCell>
              </TableRow>
            ) : (
              filteredUsers.map((user) => (
                <UserApiKeyRow
                  key={user.id}
                  user={user}
                  onRotate={rotateMutation.mutate}
                  onOpenRateLimits={handleOpenRateLimits}
                  isRotating={rotateMutation.isPending}
                />
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={rateLimitDialogOpen} onOpenChange={setRateLimitDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Rate Limits</DialogTitle>
            <DialogDescription>
              Update rate limits for {selectedUser?.globalName || selectedUser?.username}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-maxrpd">Max Requests Per Day (RPD)</Label>
              <Input
                id="edit-maxrpd"
                type="number"
                min={1}
                placeholder="e.g. 1000"
                value={editMaxRPD}
                onChange={(e) => setEditMaxRPD(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-maxrpm">Max Requests Per Minute (RPM)</Label>
              <Input
                id="edit-maxrpm"
                type="number"
                min={1}
                placeholder="e.g. 60"
                value={editMaxRPM}
                onChange={(e) => setEditMaxRPM(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRateLimitDialogOpen(false);
                setSelectedUser(null);
                setSelectedApiKey(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleRateLimitConfirm}
              disabled={updateLimitsMutation.isPending}
            >
              {updateLimitsMutation.isPending ? "Updating..." : "Update Limits"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function UserApiKeyRow({
  user,
  onRotate,
  onOpenRateLimits,
  isRotating,
}: {
  user: DiscordUser;
  onRotate: (userId: string) => void;
  onOpenRateLimits: (user: DiscordUser, apiKey: UserApiKey) => void;
  isRotating: boolean;
}) {
  const { data: apiKey, isLoading, error } = useQuery<UserApiKey>({
    queryKey: ["admin", "user-api-key", user.id],
    queryFn: () => api.adminGetUserApiKey(user.id),
    retry: false,
  });

  const maskKey = (key: string) => {
    if (!key) return "—";
    if (key.length <= 8) return "••••••••";
    return key.substring(0, 4) + "••••••••" + key.substring(key.length - 4);
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <TableRow>
        <TableCell colSpan={7} className="text-center text-muted-foreground py-4">
          Loading...
        </TableCell>
      </TableRow>
    );
  }

  if (error || !apiKey) {
    return (
      <TableRow>
        <TableCell className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={user.avatarUrl} alt={user.username} />
            <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{user.globalName || user.username}</span>
            <span className="text-xs text-muted-foreground">@{user.username}</span>
          </div>
        </TableCell>
        <TableCell colSpan={5} className="text-muted-foreground text-sm">
          No API key available
        </TableCell>
        <TableCell className="text-right">—</TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className={user.banned ? "opacity-50 bg-muted/50" : ""}>
      <TableCell className="flex items-center gap-3">
        <Avatar>
          <AvatarImage src={user.avatarUrl} alt={user.username} />
          <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-medium">{user.globalName || user.username}</span>
          <span className="text-xs text-muted-foreground font-mono">{user.id}</span>
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Key className="h-3.5 w-3.5 text-muted-foreground" />
          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
            {maskKey(apiKey.apiKey)}
          </code>
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary">{apiKey.maxRPD.toLocaleString()}</Badge>
      </TableCell>
      <TableCell className="text-center">
        <Badge variant="secondary">{apiKey.maxRPM.toLocaleString()}</Badge>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">{formatDate(apiKey.createdAt)}</span>
      </TableCell>
      <TableCell>
        <span className="text-xs text-muted-foreground">
          {apiKey.lastRotatedAt ? formatDate(apiKey.lastRotatedAt) : "Never"}
        </span>
      </TableCell>
      <TableCell className="text-right space-x-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onOpenRateLimits(user, apiKey)}
          title="Update Rate Limits"
          className="align-middle"
        >
          <Settings2 className="h-4 w-4" />
          Limits
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRotate(user.id)}
          disabled={isRotating}
          title="Rotate API Key"
          className="align-middle"
        >
          <RefreshCw className={`h-4 w-4 ${isRotating ? "animate-spin" : ""}`} />
          Rotate
        </Button>
      </TableCell>
    </TableRow>
  );
}
