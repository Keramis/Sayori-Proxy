import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckSquare, XSquare, Edit2, Save } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface ProviderModelListProps {
  providerId: string;
  providerName: string;
  searchQuery?: string;
}

export function ProviderModelList({ providerId, providerName, searchQuery = "" }: ProviderModelListProps) {
  const { toast } = useToast();
  const [isEnabling, setIsEnabling] = useState(false);
  const [isDisabling, setIsDisabling] = useState(false);
  const [isUpdatingCost, setIsUpdatingCost] = useState(false);
  const [isUpdatingTokenLimit, setIsUpdatingTokenLimit] = useState(false);
  const [bulkCost, setBulkCost] = useState("1");
  const [bulkTokenLimit, setBulkTokenLimit] = useState("");
  const [editingCost, setEditingCost] = useState<string | null>(null);
  const [tempCost, setTempCost] = useState<string>("");
  const [editingTokenLimit, setEditingTokenLimit] = useState<string | null>(null);
  const [tempTokenLimit, setTempTokenLimit] = useState<string>("");

  const { data: allModels = [], isLoading } = useQuery({
    queryKey: ["/api/providers", providerId, "models"],
    queryFn: () => api.providerGetProviderModels(providerId),
  });

  const models = allModels.filter((model: any) =>
    model.modelId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleModel = async (id: string, currentState: boolean) => {
    try {
      await api.providerUpdateModel(id, { enabled: !currentState });
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId, "models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/public"] });
      toast({
        title: "Model Updated",
        description: `Model ${!currentState ? "enabled" : "disabled"}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update model",
        variant: "destructive",
      });
    }
  };

  const handleEnableAll = async () => {
    setIsEnabling(true);
    try {
      const updates = models.map((model: any) => ({
        id: model.id,
        enabled: true,
      }));
      await api.providerBulkUpdateModels(providerId, updates);
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId, "models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/public"] });
      toast({
        title: "Models Enabled",
        description: `${models.length} model${models.length !== 1 ? 's have' : ' has'} been enabled`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to enable all models",
        variant: "destructive",
      });
    } finally {
      setIsEnabling(false);
    }
  };

  const handleDisableAll = async () => {
    setIsDisabling(true);
    try {
      const updates = models.map((model: any) => ({
        id: model.id,
        enabled: false,
      }));
      await api.providerBulkUpdateModels(providerId, updates);
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId, "models"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/public"] });
      toast({
        title: "Models Disabled",
        description: `${models.length} model${models.length !== 1 ? 's have' : ' has'} been disabled`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to disable all models",
        variant: "destructive",
      });
    } finally {
      setIsDisabling(false);
    }
  };

  const handleUpdateAllCosts = async () => {
    const cost = parseInt(bulkCost);
    if (isNaN(cost) || cost < 1) {
      toast({
        title: "Invalid Input",
        description: "Request cost must be at least 1",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingCost(true);
    try {
      const updates = models.map((model: any) => ({
        id: model.id,
        requestCost: cost,
      }));
      await api.providerBulkUpdateModels(providerId, updates);
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId, "models"] });
      toast({
        title: "Costs Updated",
        description: `${models.length} model${models.length !== 1 ? "s" : ""} now cost ${cost} request(s)`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update model costs",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingCost(false);
    }
  };

  const handleUpdateAllTokenLimits = async () => {
    const trimmedLimit = bulkTokenLimit.trim();
    const limit = trimmedLimit === "" ? null : parseInt(trimmedLimit);

    if (limit !== null && (isNaN(limit) || limit < 1)) {
      toast({
        title: "Invalid Input",
        description: "Token limit must be at least 1",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingTokenLimit(true);
    try {
      const updates = models.map((model: any) => ({
        id: model.id,
        tokenLimit: limit,
      }));
      await api.providerBulkUpdateModels(providerId, updates);
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId, "models"] });
      toast({
        title: "Token Limits Updated",
        description: limit === null
          ? `Token limits cleared for ${models.length} model${models.length !== 1 ? "s" : ""}`
          : `Token limit set to ${limit} token(s) for ${models.length} model${models.length !== 1 ? "s" : ""}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update token limits",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingTokenLimit(false);
    }
  };

  const handleUpdateModelCost = async (id: string, newCost: string) => {
    const cost = parseInt(newCost);
    if (isNaN(cost) || cost < 1) {
      toast({
        title: "Invalid Input",
        description: "Request cost must be at least 1",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.providerUpdateModel(id, { requestCost: cost });
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId, "models"] });
      setEditingCost(null);
      toast({
        title: "Cost Updated",
        description: "Model request cost updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update model cost",
        variant: "destructive",
      });
    }
  };

  const handleUpdateModelTokenLimit = async (id: string, newLimit: string) => {
    const trimmedLimit = newLimit.trim();
    const limit = trimmedLimit === "" ? null : parseInt(trimmedLimit);
    if (limit !== null && (isNaN(limit) || limit < 1)) {
      toast({
        title: "Invalid Input",
        description: "Token limit must be at least 1",
        variant: "destructive",
      });
      return;
    }

    try {
      await api.providerUpdateModel(id, { tokenLimit: limit });
      queryClient.invalidateQueries({ queryKey: ["/api/providers", providerId, "models"] });
      setEditingTokenLimit(null);
      toast({
        title: "Token Limit Updated",
        description: "Model token limit updated successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update model token limit",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading models...</div>;
  }

  if (models.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No models found. Use "Check Models" to fetch available models.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h4 className="font-semibold text-sm">
          Models for {providerName} ({models.length}{searchQuery ? ` of ${allModels.length}` : ""})
        </h4>
        <div className="flex gap-1 flex-wrap">
          <Button
            size="sm"
            variant="outline"
            onClick={handleEnableAll}
            disabled={isEnabling || isDisabling}
            data-testid={`button-enable-all-${providerId}`}
          >
            <CheckSquare className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{isEnabling ? "Enabling..." : "Enable All"}</span>
            <span className="sm:hidden">All On</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDisableAll}
            disabled={isEnabling || isDisabling}
            data-testid={`button-disable-all-${providerId}`}
          >
            <XSquare className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{isDisabling ? "Disabling..." : "Disable All"}</span>
            <span className="sm:hidden">All Off</span>
          </Button>
        </div>
      </div>

      <div className="p-3 rounded-md border bg-muted/30 mb-3 space-y-4">
        <div>
          <Label className="text-sm font-medium mb-2 block">Bulk Update Request Cost</Label>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[100px]">
              <Input
                type="number"
                min="1"
                value={bulkCost}
                onChange={(e) => setBulkCost(e.target.value)}
                placeholder="Request cost"
                className="h-8"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUpdateAllCosts}
              disabled={isUpdatingCost}
            >
              {isUpdatingCost ? "Updating..." : "Update All"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Set how many requests each model uses from the daily quota (default: 1)
          </p>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Bulk Update Token Limit</Label>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[100px]">
              <Input
                type="number"
                min="1"
                value={bulkTokenLimit}
                onChange={(e) => setBulkTokenLimit(e.target.value)}
                placeholder="No limit"
                className="h-8"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUpdateAllTokenLimits}
              disabled={isUpdatingTokenLimit}
            >
              {isUpdatingTokenLimit ? "Updating..." : "Update All"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Leave blank to remove limits for the selected models
          </p>
        </div>
      </div>
      {models.map((model: any) => (
        <div
          key={model.id}
          className="flex items-center justify-between p-3 rounded-md border bg-card flex-wrap gap-2"
          data-testid={`model-${model.id}`}
        >
          <div className="flex-1 min-w-[200px]">
            <span className="font-mono text-sm">{model.modelId}</span>
            {model.enabled && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Active
              </Badge>
            )}
            <div className="flex items-center gap-2 mt-2">
              {editingCost === model.id ? (
                <>
                  <Input
                    type="number"
                    min="1"
                    value={tempCost}
                    onChange={(e) => setTempCost(e.target.value)}
                    className="h-7 w-20 text-xs"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdateModelCost(model.id, tempCost)}
                    className="h-7 px-2"
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingCost(null)}
                    className="h-7 px-2"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">
                    Cost: {model.requestCost ?? 1} req/use
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingCost(model.id);
                      setTempCost(String(model.requestCost ?? 1));
                    }}
                    className="h-6 px-2"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              {editingTokenLimit === model.id ? (
                <>
                  <Input
                    type="number"
                    min="1"
                    value={tempTokenLimit}
                    onChange={(e) => setTempTokenLimit(e.target.value)}
                    className="h-7 w-28 text-xs"
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleUpdateModelTokenLimit(model.id, tempTokenLimit)}
                    className="h-7 px-2"
                  >
                    <Save className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingTokenLimit(null)}
                    className="h-7 px-2"
                  >
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground">
                    Token limit: {model.tokenLimit ?? "No limit"}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingTokenLimit(model.id);
                      setTempTokenLimit(model.tokenLimit === null || model.tokenLimit === undefined ? "" : String(model.tokenLimit));
                    }}
                    className="h-6 px-2"
                  >
                    <Edit2 className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={model.enabled}
              onCheckedChange={() => toggleModel(model.id, model.enabled)}
              data-testid={`switch-model-${model.id}`}
            />
            <span className="text-xs text-muted-foreground min-w-16">
              {model.enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
