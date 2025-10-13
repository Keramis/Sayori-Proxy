import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { CheckCircle, Plus, Trash2, Edit2 } from "lucide-react";

interface AdminProviderFormProps {
  authToken: string;
  editProvider?: any;
  onEditComplete?: () => void;
  onSearchChange?: (search: string) => void;
}

export function AdminProviderForm({ authToken, editProvider, onEditComplete, onSearchChange }: AdminProviderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [providerId, setProviderId] = useState<string | null>(null);
  const [apiKeys, setApiKeys] = useState<string[]>([""]);
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([]);
  const [modelCount, setModelCount] = useState<number | null>(null);
  const [editingKeyIndex, setEditingKeyIndex] = useState<number | null>(null);
  const [modelSearch, setModelSearch] = useState("");

  useEffect(() => {
    if (editProvider) {
      setName(editProvider.name);
      setBaseUrl(editProvider.baseUrl);
      setEnabled(editProvider.enabled);
      setProviderId(editProvider.id);
      loadProviderKeys(editProvider.id);
    }
  }, [editProvider]);

  const loadProviderKeys = async (provId: string) => {
    const keys = await api.getProviderKeys(authToken, provId);
    setApiKeys(keys.map((k: any) => k.key));
    setApiKeyIds(keys.map((k: any) => k.id));
  };

  const addApiKey = () => {
    setApiKeys([...apiKeys, ""]);
    setApiKeyIds([...apiKeyIds, ""]); // Also add a placeholder for the new key's ID
  };

  const removeApiKey = (index: number) => {
    const newKeys = apiKeys.filter((_, i) => i !== index);
    const newApiKeyIds = apiKeyIds.filter((_, i) => i !== index);
    setApiKeys(newKeys);
    setApiKeyIds(newApiKeyIds);
  };

  const updateApiKey = (index: number, value: string) => {
    const newKeys = [...apiKeys];
    newKeys[index] = value;
    setApiKeys(newKeys);
  };

  const saveKeyEdit = async (index: number) => {
    const keyId = apiKeyIds[index];
    const newKey = apiKeys[index];

    if (!keyId) {
      // This is a new key, just update the state
      setEditingKeyIndex(null);
      return;
    }

    try {
      await api.updateProviderKey(authToken, keyId, newKey);
      toast({
        title: "API Key Updated",
        description: "API key has been updated successfully.",
      });
      setEditingKeyIndex(null);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update API key",
        variant: "destructive",
      });
    }
  };

  const handleCheckModels = async () => {
    if (!providerId) {
      toast({
        title: "Error",
        description: "Please save the provider first",
        variant: "destructive",
      });
      return;
    }

    setChecking(true);
    try {
      const result = await api.checkProviderModels(authToken, providerId);
      setModelCount(result.count);
      toast({
        title: "Models Checked",
        description: `Found ${result.count} models from this provider (sorted alphabetically)`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/public"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers", providerId, "models"] });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to check models",
        variant: "destructive",
      });
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let provider;
      if (editProvider) {
        provider = await api.updateProvider(authToken, editProvider.id, {
          name,
          baseUrl,
          enabled,
        });
      } else {
        provider = await api.createProvider(authToken, {
          name,
          baseUrl,
          enabled,
        });
      }

      setProviderId(provider.id);

      if (!editProvider) {
        for (const key of apiKeys.filter((k) => k.trim())) {
          await api.addProviderKey(authToken, provider.id, key);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/admin/providers"] });

      toast({
        title: editProvider ? "Provider Updated" : "Provider Created",
        description: editProvider ? "Provider has been updated" : "Provider and API keys have been added",
      });

      if (editProvider && onEditComplete) {
        onEditComplete();
      } else {
        setName("");
        setBaseUrl("");
        setEnabled(true);
        setApiKeys([""]);
        setApiKeyIds([]);
        setModelCount(null);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to ${editProvider ? 'update' : 'create'} provider`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="provider-name">Provider Name</Label>
          <Input
            id="provider-name"
            placeholder="e.g., OpenAI, Claude"
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-testid="input-provider-name"
            required
            disabled={!!editProvider} // Disable name editing if in edit mode
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="base-url">Base URL</Label>
          <Input
            id="base-url"
            placeholder="https://api.example.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="font-mono"
            data-testid="input-base-url"
            required
          />
        </div>

        <div className="flex items-center space-x-2">
          <Label htmlFor="enabled">Enabled</Label>
          <Switch id="enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>API Keys</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addApiKey}
              className="gap-2"
              data-testid="button-add-api-key"
            >
              <Plus className="h-4 w-4" />
              Add Key
            </Button>
          </div>
          {apiKeys.map((key, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={key}
                onChange={(e) => updateApiKey(index, e.target.value)}
                placeholder="Enter API key"
                disabled={editProvider && editingKeyIndex !== index}
                data-testid={`input-api-key-${index}`}
              />
              {editProvider && editingKeyIndex === index && (
                <Button
                  type="button"
                  variant="default"
                  size="icon"
                  onClick={() => saveKeyEdit(index)}
                  data-testid={`button-save-key-${index}`}
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
              )}
              {editProvider && editingKeyIndex !== index && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setEditingKeyIndex(index)}
                  data-testid={`button-edit-key-${index}`}
                >
                  <Edit2 className="h-4 w-4" />
                </Button>
              )}
              {(apiKeys.length > 1 || editProvider) && (
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  onClick={() => removeApiKey(index)}
                  data-testid={`button-remove-key-${index}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {editProvider && (
          <div className="space-y-2">
            <Label htmlFor="model-search">Search Models</Label>
            <Input
              id="model-search"
              placeholder="Search models..."
              value={modelSearch}
              onChange={(e) => {
                setModelSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              data-testid="input-model-search"
            />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleCheckModels}
            className="gap-2 w-full sm:w-auto"
            disabled={!providerId || checking}
            data-testid="button-check-models"
          >
            <CheckCircle className="h-4 w-4" />
            {checking ? "Checking..." : "Check Models"}
          </Button>
          {modelCount !== null && (
            <span className="text-sm text-muted-foreground self-center">
              {modelCount} models found
            </span>
          )}
          <Button
            type="submit"
            className="flex-1"
            disabled={loading}
            data-testid="button-save-provider"
          >
            {loading ? "Saving..." : (editProvider ? "Update Provider" : "Save Provider")}
          </Button>
        </div>
      </form>
    </Card>
  );
}