import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AdminProviderAccountListProps { }

export function AdminProviderAccountList({ }: AdminProviderAccountListProps) {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingAccount, setEditingAccount] = useState<any>(null);
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  const { data: accountsData = [], isLoading } = useQuery({
    queryKey: ["/api/admin/provider-accounts"],
    queryFn: () => api.getProviderAccounts(),
  });

  const accounts = Array.isArray(accountsData) ? accountsData : [];

  const filteredAccounts = accounts.filter((account: any) => {
    if (!searchQuery) return true;
    return account.username.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const openEditDialog = (account: any) => {
    setEditingAccount(account);
    setEditUsername(account.username || "");
    setEditPassword("");
  };

  const closeEditDialog = () => {
    setEditingAccount(null);
    setEditUsername("");
    setEditPassword("");
  };

  const handleUpdateAccount = async () => {
    if (!editingAccount) return;

    const payload: { username?: string; password?: string } = {};
    const trimmedUsername = editUsername.trim();
    if (trimmedUsername && trimmedUsername !== editingAccount.username) {
      payload.username = trimmedUsername;
    }
    if (editPassword.trim()) {
      payload.password = editPassword;
    }

    if (Object.keys(payload).length === 0) {
      toast({
        title: "No Changes",
        description: "Update the username or set a new password to save changes.",
      });
      return;
    }

    setEditLoading(true);
    try {
      await api.updateProviderAccount(editingAccount.id, payload);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-accounts"] });
      toast({
        title: "Provider Account Updated",
        description: "Account details updated successfully",
      });
      closeEditDialog();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update provider account",
        variant: "destructive",
      });
    } finally {
      setEditLoading(false);
    }
  };

  const handleClearSession = async (accountId: string) => {
    try {
      await api.updateProviderAccount(accountId, { clearSession: true });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-accounts"] });
      toast({
        title: "Session Cleared",
        description: "Provider session has been cleared",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to clear session",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async (accountId: string, username: string) => {
    if (!confirm(`Delete provider account "${username}"?`)) {
      return;
    }

    try {
      await api.deleteProviderAccount(accountId);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-accounts"] });
      toast({
        title: "Provider Account Deleted",
        description: "Provider account has been deleted",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete provider account",
        variant: "destructive",
      });
    }
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return "Unknown";
    return new Date(timestamp).toLocaleString();
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading provider accounts...</div>;
  }

  if (accounts.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No provider accounts yet. Create one above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div>
          <Label htmlFor="provider-account-search">Search by Username</Label>
          <Input
            id="provider-account-search"
            placeholder="Search provider accounts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mt-1"
          />
        </div>
      </Card>

      {searchQuery && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredAccounts.length} of {accounts.length} provider accounts
        </div>
      )}

      {filteredAccounts.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No provider accounts match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAccounts.map((account: any) => (
            <Card key={account.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg">{account.username}</h3>
                    {account.hasSession ? (
                      <Badge variant="default" className="text-xs bg-green-600">Active Session</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">No Session</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Created: {formatDate(account.createdAt)}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {account.hasSession && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearSession(account.id)}
                    >
                      Clear Session
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(account)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteAccount(account.id, account.username)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingAccount} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Provider Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-provider-username">Username</Label>
              <Input
                id="edit-provider-username"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-provider-password">New Password (optional)</Label>
              <Input
                id="edit-provider-password"
                type="password"
                value={editPassword}
                onChange={(e) => setEditPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
              />
            </div>

            {editingAccount?.hasSession && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Active session currently assigned
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleClearSession(editingAccount.id)}
                >
                  Clear Session
                </Button>
              </div>
            )}

            <Button
              onClick={handleUpdateAccount}
              disabled={editLoading}
              className="w-full"
            >
              {editLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
