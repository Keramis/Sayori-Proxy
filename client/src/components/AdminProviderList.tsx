import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Edit, Trash2, ChevronDown, ChevronRight, Key, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { AdminModelList } from "./AdminModelList";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Edit2 } from "lucide-react";
import { AdminProviderForm } from "./AdminProviderForm";

interface AdminProviderListProps { }

export function AdminProviderList({ }: AdminProviderListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [editingProvider, setEditingProvider] = useState<any>(null);
  const [showKeys, setShowKeys] = useState<string | null>(null);
  const [modelSearchMap, setModelSearchMap] = useState<Map<string, string>>(new Map());

  const { data: providersData, isLoading } = useQuery({
    queryKey: ["/api/admin/providers"],
    queryFn: () => api.getProviders(),
  });

  // Ensure providers is always an array
  const providers = Array.isArray(providersData) ? providersData : [];

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
    <div className="space-y-3">
      {providers.map((provider: any) => (
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
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-lg" data-testid={`provider-name-${provider.id}`}>
                      {provider.name}
                    </h3>
                    <Badge variant="secondary">
                      {provider.modelsCount} models
                    </Badge>
                    <Badge variant="outline">
                      {provider.keysCount} keys
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground font-mono break-all">{provider.baseUrl}</p>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
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
  );
}
