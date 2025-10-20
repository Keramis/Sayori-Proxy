import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2, Copy, Edit } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

interface AdminUserTokenListProps {
  authToken: string;
}

export function AdminUserTokenList({ authToken }: AdminUserTokenListProps) {
  const { toast } = useToast();
  const [editingToken, setEditingToken] = useState<any>(null);
  const [editMaxRPD, setEditMaxRPD] = useState("");
  const [editMaxRPM, setEditMaxRPM] = useState("");
  const [editAllowedProviders, setEditAllowedProviders] = useState<string[]>([]);
  const [editLoading, setEditLoading] = useState(false);

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["/api/admin/tokens"],
    queryFn: () => api.getUserTokens(authToken),
  });

  const { data: providers = [] } = useQuery({
    queryKey: ["/api/admin/providers"],
    queryFn: () => api.getProviders(authToken),
  });

  const openEditDialog = (token: any) => {
    setEditingToken(token);
    setEditMaxRPD(token.maxRPD.toString());
    setEditMaxRPM(token.maxRPM.toString());

    // Create a map of provider names to IDs for easy lookup
    const providerNameToIdMap = providers.reduce((acc: any, p: any) => {
      acc[p.name.toLowerCase()] = p.id;
      return acc;
    }, {});

    // Normalize the allowedProviders to ensure they are all IDs
    const providerIds = (token.allowedProviders || []).map((item: string) => {
      // If the item is a name, convert it to an ID. Otherwise, assume it's already an ID.
      return providerNameToIdMap[item.toLowerCase()] || item;
    });

    setEditAllowedProviders(providerIds);
  };

  const closeEditDialog = () => {
    setEditingToken(null);
    setEditMaxRPD("");
    setEditMaxRPM("");
    setEditAllowedProviders([]);
  };

  const handleUpdateToken = async () => {
    if (!editingToken) return;

    setEditLoading(true);
    try {
      await api.updateUserToken(authToken, editingToken.id, {
        maxRPD: parseInt(editMaxRPD),
        maxRPM: parseInt(editMaxRPM),
        allowedProviders: editAllowedProviders,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/tokens"] });
      toast({
        title: "Token Updated",
        description: "Token settings have been updated successfully",
      });
      closeEditDialog();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update token",
        variant: "destructive",
      });
    } finally {
      setEditLoading(false);
    }
  };

  const copyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    toast({
      title: "Token Copied",
      description: "Token has been copied to clipboard",
    });
  };

  const deleteToken = async (id: string) => {
    if (!confirm("Are you sure you want to delete this token?")) {
      return;
    }

    try {
      await api.deleteUserToken(authToken, id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tokens"] });
      toast({
        title: "Token Deleted",
        description: "Token has been deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete token",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading tokens...</div>;
  }

  if (tokens.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No tokens yet. Create your first token above.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {tokens.map((token: any) => (
        <Card key={token.id} className="p-4">
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-lg mb-1" data-testid={`token-name-${token.id}`}>
                  {token.name}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono bg-muted px-2 py-1 rounded break-all" data-testid={`token-value-${token.id}`}>
                    {token.token}
                  </code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToken(token.token)}
                    data-testid={`button-copy-${token.id}`}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="flex gap-2 self-start sm:self-auto flex-shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEditDialog(token)}
                  data-testid={`button-edit-token-${token.id}`}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteToken(token.id)}
                  data-testid={`button-delete-token-${token.id}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="text-sm text-muted-foreground mb-1">
                  Requests Today: {token.usedRPD}/{token.maxRPD}
                </div>
                <Progress value={(token.usedRPD / token.maxRPD) * 100} className="h-2" />
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Max RPM: {token.maxRPM}</div>
              </div>
            </div>
          </div>
        </Card>
      ))}

      <Dialog open={!!editingToken} onOpenChange={(open) => !open && closeEditDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Token Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label>Token Name</Label>
              <div className="text-sm font-medium">{editingToken?.name}</div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-max-rpd">Max RPD (Requests/Day)</Label>
                <Input
                  id="edit-max-rpd"
                  type="number"
                  value={editMaxRPD}
                  onChange={(e) => setEditMaxRPD(e.target.value)}
                  required
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-max-rpm">Max RPM (Requests/Minute)</Label>
                <Input
                  id="edit-max-rpm"
                  type="number"
                  value={editMaxRPM}
                  onChange={(e) => setEditMaxRPM(e.target.value)}
                  required
                  min="1"
                />
              </div>
            </div>

            <div className="space-y-3">
              <Label>Allowed Providers</Label>
              <p className="text-sm text-muted-foreground">
                Leave empty to allow all providers. Select specific providers to restrict access.
              </p>
              {providers.length > 0 ? (
                <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
                  {providers.map((provider: any) => (
                    <div key={provider.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-provider-${provider.id}`}
                        checked={editAllowedProviders.includes(provider.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setEditAllowedProviders([...editAllowedProviders, provider.id]);
                          } else {
                            setEditAllowedProviders(editAllowedProviders.filter(id => id !== provider.id));
                          }
                        }}
                      />
                      <label
                        htmlFor={`edit-provider-${provider.id}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {provider.name}
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No providers available</p>
              )}
            </div>

            <div className="flex gap-3 justify-end">
              <Button variant="outline" onClick={closeEditDialog} disabled={editLoading}>
                Cancel
              </Button>
              <Button onClick={handleUpdateToken} disabled={editLoading}>
                {editLoading ? "Updating..." : "Update Token"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

