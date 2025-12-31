import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, CheckCircle, Edit2 } from "lucide-react";
import { api } from "@/lib/api";

interface ProviderProviderFormProps {
  editProvider?: any;
  onEditComplete?: () => void;
  onSearchChange?: (query: string) => void;
}

export function ProviderProviderForm({ editProvider, onEditComplete, onSearchChange }: ProviderProviderFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);

  const [name, setName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [disableCacheDiscount, setDisableCacheDiscount] = useState(false);
  const [customHeadersJson, setCustomHeadersJson] = useState("");
  const [apiKeys, setApiKeys] = useState<string[]>([""]);
  const [apiKeyIds, setApiKeyIds] = useState<string[]>([]);
  const [editingKeyIndex, setEditingKeyIndex] = useState<number | null>(null);
  const [modelCount, setModelCount] = useState<number | null>(null);
  const [modelSearch, setModelSearch] = useState("");

  const providerId = editProvider?.id;

  useEffect(() => {
    if (editProvider) {
      setName(editProvider.name);
      setBaseUrl(editProvider.baseUrl);
      setEnabled(editProvider.enabled);
      setDisableCacheDiscount(editProvider.disableCacheDiscount || false);
      setCustomHeadersJson(
        editProvider.customHeaders
          ? JSON.stringify(editProvider.customHeaders, null, 2)
          : ""
      );
      // Fetch keys
      api.providerGetProviderKeys(editProvider.id).then((keys: any[]) => {
        setApiKeys(keys.map((k) => k.key));
        setApiKeyIds(keys.map((k) => k.id));
      });
    } else {
      setName("");
      setBaseUrl("");
      setEnabled(true);
      setDisableCacheDiscount(false);
      setCustomHeadersJson("");
      setApiKeys([""]);
      setApiKeyIds([]);
      setModelCount(null);
    }
  }, [editProvider]);

  const addApiKey = () => {
    setApiKeys([...apiKeys, ""]);
  };

  const updateApiKey = (index: number, value: string) => {
    const newKeys = [...apiKeys];
    newKeys[index] = value;
    setApiKeys(newKeys);
  };

  const removeApiKey = async (index: number) => {
    if (editProvider && apiKeyIds[index]) {
      try {
        await api.providerDeleteKey(apiKeyIds[index]);
        const newKeys = [...apiKeys];
        newKeys.splice(index, 1);
        setApiKeys(newKeys);
        const newIds = [...apiKeyIds];
        newIds.splice(index, 1);
        setApiKeyIds(newIds);
        toast({ title: "Key deleted" });
      } catch (error) {
        toast({
          title: "Error deleting key",
          variant: "destructive",
        });
      }
    } else {
      const newKeys = [...apiKeys];
      newKeys.splice(index, 1);
      setApiKeys(newKeys);
    }
  };

  const saveKeyEdit = async (index: number) => {
    if (!editProvider || !apiKeyIds[index]) return;
    try {
      await api.providerUpdateApiKey(apiKeyIds[index], apiKeys[index]);
      setEditingKeyIndex(null);
      toast({ title: "Key updated" });
    } catch (error) {
      toast({
        title: "Error updating key",
        variant: "destructive",
      });
    }
  };

  const handleCheckModels = async () => {
    if (!providerId) return;
    setChecking(true);
    try {
      const result = await api.providerCheckProviderModels(providerId);
      setModelCount(result.count);
      toast({
        title: "Models Checked",
        description: `Found ${result.count} models`,
      });
      queryClient.invalidateQueries({ queryKey: ["models", providerId] });
    } catch (error: any) {
      toast({
        title: "Error checking models",
        description: error.message,
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
      let customHeaders;
      if (customHeadersJson.trim()) {
        try {
          customHeaders = JSON.parse(customHeadersJson);
        } catch (e) {
          throw new Error("Invalid JSON for custom headers");
        }
      }

      const providerData = {
        name,
        baseUrl,
        enabled,
        customHeaders,
        disableCacheDiscount,
      };

      if (editProvider) {
        await api.providerUpdateProvider(editProvider.id, providerData);
        // Handle new keys for existing provider
        const newKeys = apiKeys.filter((_, i) => !apiKeyIds[i] && apiKeys[i]);
        for (const key of newKeys) {
          await api.providerAddProviderKey(editProvider.id, key);
        }
      } else {
        const newProvider = await api.providerCreateProvider(providerData);
        // Add keys
        const validKeys = apiKeys.filter((k) => k.trim());
        for (const key of validKeys) {
          await api.providerAddProviderKey(newProvider.id, key);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/providers/public"] });

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
        setDisableCacheDiscount(false);
        setCustomHeadersJson("");
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

        <div className="flex items-center space-x-2">
          <Label htmlFor="disable-cache-discount">Disable Cache Discount</Label>
          <Switch
            id="disable-cache-discount"
            checked={disableCacheDiscount}
            onCheckedChange={setDisableCacheDiscount}
          />
        </div>
        {disableCacheDiscount && (
          <p className="text-sm text-muted-foreground -mt-4">
            Cached requests will NOT receive a 90% cost discount for this provider
          </p>
        )}

        <div className="space-y-2">
          <Label htmlFor="custom-headers">Custom Headers (JSON)</Label>
          <p className="text-sm text-muted-foreground">
            Add custom request headers as JSON. Example: {`{"X-Custom-Header": "value"}`}
          </p>
          <textarea
            id="custom-headers"
            placeholder={`{\n  "X-Custom-Header": "value",\n  "X-Another-Header": "value"\n}`}
            value={customHeadersJson}
            onChange={(e) => setCustomHeadersJson(e.target.value)}
            className="w-full min-h-[100px] font-mono text-sm p-2 border rounded-md bg-background"
            data-testid="input-custom-headers"
          />
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
          {editProvider && (
            <Button
              type="button"
              variant="outline"
              onClick={onEditComplete}
              className="w-full sm:w-auto"
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
          )}
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
