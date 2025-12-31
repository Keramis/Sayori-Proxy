import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

interface AdminProviderAccountFormProps { }

export function AdminProviderAccountForm({ }: AdminProviderAccountFormProps) {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.createProviderAccount({
        username: username.trim(),
        password,
      });

      toast({
        title: "Provider Account Created",
        description: "Provider account created successfully",
      });

      queryClient.invalidateQueries({ queryKey: ["/api/admin/provider-accounts"] });

      setUsername("");
      setPassword("");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create provider account",
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
          <Label htmlFor="provider-account-username">Username</Label>
          <Input
            id="provider-account-username"
            placeholder="e.g., provider_team"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            data-testid="input-provider-account-username"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="provider-account-password">Password</Label>
          <Input
            id="provider-account-password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            data-testid="input-provider-account-password"
            required
          />
        </div>

        <Button
          type="submit"
          className="w-full"
          disabled={loading}
          data-testid="button-create-provider-account"
        >
          {loading ? "Creating..." : "Create Provider Account"}
        </Button>
      </form>
    </Card>
  );
}
