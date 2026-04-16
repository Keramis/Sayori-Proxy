import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function Banned() {
  const { user } = useAuth();
  const banReason = user?.banReason || "Dictatorship";

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-destructive">
        <CardHeader className="text-center">
          <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit mb-4">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <CardTitle className="text-2xl font-bold text-destructive">Account Banned</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground">
            Your account has been permanently banned from Sayori.
          </p>
          <div className="bg-muted p-4 rounded-lg text-sm">
            <p className="font-semibold mb-1">Reason:</p>
            <p>{banReason}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            If you believe this is a mistake, please contact the staff on Discord.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}