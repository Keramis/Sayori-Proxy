import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface AdminUserTokenFormProps { }

export function AdminUserTokenForm({ }: AdminUserTokenFormProps) {
  const [tokenName, setTokenName] = useState("");
  const [maxRPD, setMaxRPD] = useState("");
  const [maxRPM, setMaxRPM] = useState("");
  const [allowedProviders, setAllowedProviders] = useState<string[]>([]);
  const [sigmaBoy, setSigmaBoy] = useState(false);
  const [maxSubKeys, setMaxSubKeys] = useState("20");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: providers = [] } = useQuery({
    queryKey: ["/api/admin/providers"],
    queryFn: () => api.getProviders(),
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await api.createUserToken({
        name: tokenName,
        maxRPD: parseInt(maxRPD),
        maxRPM: parseInt(maxRPM),
        allowedProviders: allowedProviders.length > 0 ? allowedProviders : undefined,
        sigmaBoy,
        maxSubKeys: parseInt(maxSubKeys),
      });

      toast({
        title: "Token Created",
        description: (
          <div className="space-y-2">
            <p>Token created successfully!</p>
            <code className="block bg-muted p-2 rounded text-xs break-all">
              {result.token}
            </code>
            <p className="text-xs text-muted-foreground">
              Save this token securely. It won't be shown again.
            </p>
          </div>
        ),
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/tokens"] });

      setTokenName("");
      setMaxRPD("");
      setMaxRPM("");
      setAllowedProviders([]);
      setSigmaBoy(false);
      setMaxSubKeys("20");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create token",
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
          <Label htmlFor="token-name">Token Name</Label>
          <Input
            id="token-name"
            placeholder="e.g., Development Token"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            data-testid="input-token-name"
            required
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="max-rpd">Max RPD (Requests/Day)</Label>
            <Input
              id="max-rpd"
              type="number"
              placeholder="100"
              value={maxRPD}
              onChange={(e) => setMaxRPD(e.target.value)}
              data-testid="input-max-rpd"
              required
              min="1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-rpm">Max RPM (Requests/Minute)</Label>
            <Input
              id="max-rpm"
              type="number"
              placeholder="10"
              value={maxRPM}
              onChange={(e) => setMaxRPM(e.target.value)}
              data-testid="input-max-rpm"
              required
              min="1"
            />
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="sigma-boy">Sigma Boy Tier</Label>
              <p className="text-sm text-muted-foreground">
                Enable to allow this token to create sub-keys
              </p>
            </div>
            <Switch
              id="sigma-boy"
              checked={sigmaBoy}
              onCheckedChange={setSigmaBoy}
              data-testid="switch-sigma-boy"
            />
          </div>

          {sigmaBoy && (
            <div className="space-y-2">
              <Label htmlFor="max-sub-keys">Max Sub-key Creation</Label>
              <Input
                id="max-sub-keys"
                type="number"
                placeholder="20"
                value={maxSubKeys}
                onChange={(e) => setMaxSubKeys(e.target.value)}
                data-testid="input-max-sub-keys"
                required
                min="2"
                step="1"
              />
              <p className="text-sm text-muted-foreground">
                Maximum number of sub-keys this token can create (min: 2)
              </p>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <Label>Allowed Providers (optional)</Label>
          <p className="text-sm text-muted-foreground">
            Leave empty to allow all providers. Select specific providers to restrict access.
          </p>
          {providers.length > 0 ? (
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-md p-3">
              {providers.map((provider: any) => (
                <div key={provider.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`provider-${provider.id}`}
                    checked={allowedProviders.includes(provider.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setAllowedProviders([...allowedProviders, provider.id]);
                      } else {
                        setAllowedProviders(allowedProviders.filter(id => id !== provider.id));
                      }
                    }}
                  />
                  <label
                    htmlFor={`provider-${provider.id}`}
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

        <Button
          type="submit"
          className="w-full"
          disabled={loading}
          data-testid="button-create-token"
        >
          {loading ? "Creating..." : "Create Token"}
        </Button>
      </form>
    </Card>
  );
}
