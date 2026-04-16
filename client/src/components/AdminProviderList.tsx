import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ArrowRightLeft, Edit, Trash2, ChevronDown, ChevronRight, Key, Check, X, Search, Globe, Lock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { AdminModelList } from "./AdminModelList";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Edit2 } from "lucide-react";
import { AdminProviderForm } from "./AdminProviderForm";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AdminProviderListProps { }

export function AdminProviderList({ }: AdminProviderListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [showKeys, setShowKeys] = useState<string | null>(null);
  const [modelSearchMap, setModelSearchMap] = useState<Map<string, string>>(new Map());
  const [searchQuery, setSearchQuery] = useState("");
  const [assigningProvider, setAssigningProvider] = useState<any>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [assignLoading, setAssignLoading] = useState(false);

  // Fetch Discord users for assignment
  const { data: discordUsers = [] } = useQuery({
    queryKey: ["/api/admin/users"],
    queryFn: () => api.getDiscordUsers(),
    enabled: !!assigningProvider, // Only fetch when dialog is open
  });

  // Filter users based on search query (fuzzy search on username and ID)
  const filteredUsers = useMemo(() => {
    if (!userSearchQuery.trim()) return discordUsers;
    
    const query = userSearchQuery.toLowerCase();
    return discordUsers.filter((user: any) => {
      const username = (user.username || "").toLowerCase();
      const globalName = (user.globalName || "").toLowerCase();
      const id = (user.id || "").toLowerCase();
      
      return username.includes(query) || globalName.includes(query) || id.includes(query);
    });
  }, [discordUsers, userSearchQuery]);

  const { data: providersData, isLoading } = useQuery({
    queryKey: ["/api/admin/providers"],
    queryFn: () => api.getProviders(),
  });

  // Ensure providers is always an array
  const providers = Array.isArray(providersData) ? providersData : [];

  // Filter providers based on search query
  const filteredProviders = providers.filter((provider: any) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = provider.name.toLowerCase().includes(query);
      const matchesUrl = provider.baseUrl.toLowerCase().includes(query);
      if (!matchesName && !matchesUrl) return false;
    }
    return true;
  });

  const toggleProvider = async (id: string, currentState: boolean) => {
    try {
      await api.updateProvider(id, { enabled: !currentState });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/public"] });
      toast({
        title: "Provider Updated",
        description: `Provider ${!currentState ? "enabled" : "disabled"}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update provider",
        variant: "destructive",
      });
    }
  };

  const deleteProvider = async (id: string) => {
    if (!confirm("Are you sure you want to delete this provider?")) {
      return;
    }

    try {
      await api.deleteProvider(id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/tokens"] });
      toast({
        title: "Provider Deleted",
        description: "Provider has been deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete provider",
        variant: "destructive",
      });
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedProviders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const openAssignDialog = (provider: any) => {
    setAssigningProvider(provider);
    setUserSearchQuery("");
    setSelectedUser(null);
  };

  const closeAssignDialog = () => {
    setAssigningProvider(null);
    setUserSearchQuery("");
    setSelectedUser(null);
  };

  const handleAssignOwner = async () => {
    if (!assigningProvider || !selectedUser) {
      toast({
        title: "User Required",
        description: "Please select a Discord user to assign.",
        variant: "destructive",
      });
      return;
    }

    setAssignLoading(true);
    try {
      const result = await api.assignProviderOwner(assigningProvider.id, selectedUser.id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
      toast({
        title: "Provider Assigned",
        description: `Assigned to ${selectedUser.globalName || selectedUser.username}${result?.deletedTokens ? ` · ${result.deletedTokens} token${result.deletedTokens === 1 ? "" : "s"} cleared` : ""}`,
      });
      closeAssignDialog();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to assign provider owner",
        variant: "destructive",
      });
    } finally {
      setAssignLoading(false);
    }
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading providers...</div>;
  }

  if (providers.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No providers yet. Add your first provider above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Section */}
      <Card className="p-4">
        <div>
          <Label htmlFor="provider-search">Search by Name or URL</Label>
          <Input
            id="provider-search"
            placeholder="Search providers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="mt-1"
          />
        </div>
      </Card>

      {/* Results Count */}
      {searchQuery && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredProviders.length} of {providers.length} providers
        </div>
      )}

      {/* Provider List */}
      {filteredProviders.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No providers match the current filters.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredProviders.map((provider: any) => (
        <Card key={provider.id} className="p-4" data-testid={`provider-${provider.id}`}>
          {editingProvider?.id === provider.id ? (
            <div className="space-y-3">
              <h3 className="font-semibold text-lg mb-4">Edit Provider</h3>
              <AdminProviderForm
                editProvider={editingProvider}
                onEditComplete={() => setEditingProvider(null)}
                onSearchChange={(search) => {
                  // Store search state for this provider
                  const newSearchMap = new Map(modelSearchMap);
                  newSearchMap.set(editingProvider.id, search);
                  setModelSearchMap(newSearchMap);
                }}
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-lg" data-testid={`provider-name-${provider.id}`}>
                      {provider.name}
                    </h3>
                    <Badge variant="secondary">
                      {provider.modelsCount} models
                    </Badge>
                    <Badge variant="outline">
                      {provider.keysCount} keys
                    </Badge>
                    {provider.visibility === "private" ? (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge variant="secondary" className="gap-1">
                              <Lock className="h-3 w-3" />
                              Private
                              {provider.allowed_roles && provider.allowed_roles.length > 0 && (
                                <span className="text-[10px] opacity-70">({provider.allowed_roles.length} roles)</span>
                              )}
                            </Badge>
                          </TooltipTrigger>
                          {provider.allowed_roles && provider.allowed_roles.length > 0 && (
                            <TooltipContent side="bottom" className="max-w-xs">
                              <p className="font-semibold mb-1">Allowed Roles</p>
                              <div className="flex flex-wrap gap-1">
                                {provider.allowed_roles.map((role: string) => (
                                  <span key={role} className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-xs">{role}</span>
                                ))}
                              </div>
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Globe className="h-3 w-3" />
                        Public
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground font-mono break-all">{provider.baseUrl}</p>
                  <div className="flex items-center gap-2 mt-1">
                    {provider.ownerInfo ? (
                      <>
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={provider.ownerInfo.avatarUrl} alt={provider.ownerInfo.username} />
                          <AvatarFallback className="text-[10px]">
                            {provider.ownerInfo.username.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-xs text-muted-foreground">
                          Owner: {provider.ownerInfo.globalName || provider.ownerInfo.username}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Owner: Unassigned
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={provider.enabled}
                      onCheckedChange={() => toggleProvider(provider.id, provider.enabled)}
                      data-testid={`switch-provider-${provider.id}`}
                    />
                    <span className="text-sm text-muted-foreground whitespace-nowrap">
                      {provider.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openAssignDialog(provider)}
                      data-testid={`button-assign-${provider.id}`}
                    >
                      <ArrowRightLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingProvider(provider)}
                      data-testid={`button-edit-${provider.id}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteProvider(provider.id)}
                      data-testid={`button-delete-${provider.id}`}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>

              <Collapsible
                open={expandedProviders.has(provider.id)}
                onOpenChange={() => toggleExpanded(provider.id)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start mt-3"
                    data-testid={`button-toggle-models-${provider.id}`}
                  >
                    {expandedProviders.has(provider.id) ? (
                      <ChevronDown className="h-4 w-4 mr-2" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-2" />
                    )}
                    {expandedProviders.has(provider.id) ? "Hide" : "Show"} Models
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  {expandedProviders.has(provider.id) && (
                    <div className="mb-3">
                      <Input
                        type="text"
                        placeholder="Search models..."
                        value={modelSearchMap.get(provider.id) || ""}
                        onChange={(e) => {
                          const newMap = new Map(modelSearchMap);
                          newMap.set(provider.id, e.target.value);
                          setModelSearchMap(newMap);
                        }}
                        className="h-9"
                      />
                    </div>
                  )}
                  <AdminModelList
                    providerId={provider.id}
                    providerName={provider.name}
                    searchQuery={modelSearchMap.get(provider.id) || ""}
                  />
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </Card>
          ))}
        </div>
      )}

      <Dialog open={!!assigningProvider} onOpenChange={(open) => !open && closeAssignDialog()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assign Provider Owner</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user-search">Search Discord Users</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="user-search"
                  placeholder="Search by username or Discord ID..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Select User</Label>
              <ScrollArea className="h-[300px] border rounded-md">
                <div className="p-2 space-y-1">
                  {filteredUsers.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      {userSearchQuery ? "No users found matching your search" : "No users available"}
                    </div>
                  ) : (
                    filteredUsers.map((user: any) => (
                      <button
                        key={user.id}
                        onClick={() => setSelectedUser(user)}
                        className={`w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors ${
                          selectedUser?.id === user.id ? "bg-accent border-2 border-primary" : "border border-transparent"
                        }`}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={user.avatarUrl} alt={user.username} />
                          <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-left">
                          <div className="font-medium">{user.globalName || user.username}</div>
                          <div className="text-xs text-muted-foreground">@{user.username} • {user.id}</div>
                        </div>
                        {selectedUser?.id === user.id && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </button>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
            
            <Button
              className="w-full"
              onClick={handleAssignOwner}
              disabled={assignLoading || !selectedUser}
            >
              {assignLoading ? "Assigning..." : "Assign Provider"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
