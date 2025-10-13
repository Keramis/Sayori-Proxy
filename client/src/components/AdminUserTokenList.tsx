import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Trash2, Copy } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";

interface AdminUserTokenListProps {
  authToken: string;
}

export function AdminUserTokenList({ authToken }: AdminUserTokenListProps) {
  const { toast } = useToast();

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["/api/admin/tokens"],
    queryFn: () => api.getUserTokens(authToken),
  });

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
                    data-testid={`button-copy-${token.id}`}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => deleteToken(token.id)}
                data-testid={`button-delete-token-${token.id}`}
                className="self-start sm:self-auto flex-shrink-0"
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
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
    </div>
  );
}
