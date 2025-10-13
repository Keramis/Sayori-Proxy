import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface AdminUserTokenFormProps {
  authToken: string;
}

export function AdminUserTokenForm({ authToken }: AdminUserTokenFormProps) {
  const [tokenName, setTokenName] = useState("");
  const [maxRPD, setMaxRPD] = useState("");
  const [maxRPM, setMaxRPM] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const result = await api.createUserToken(authToken, {
        name: tokenName,
        maxRPD: parseInt(maxRPD),
        maxRPM: parseInt(maxRPM),
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
