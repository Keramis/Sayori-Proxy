import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RoleMultiSelect } from "./RoleMultiSelect";
import { Globe, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProviderVisibilitySelectorProps {
  visibility: "public" | "private";
  allowedRoles?: string[];
  onChange: (visibility: "public" | "private", allowedRoles?: string[]) => void;
}

export function ProviderVisibilitySelector({ visibility, allowedRoles, onChange }: ProviderVisibilitySelectorProps) {
  return (
    <div className="space-y-3">
      <Label>Endpoint Visibility</Label>
      <div className="flex gap-2">
        <Button
          type="button"
          variant={visibility === "public" ? "default" : "outline"}
          className={cn("flex-1 gap-2", visibility === "public" && "pointer-events-none")}
          onClick={() => onChange("public", undefined)}
        >
          <Globe className="h-4 w-4" /> Public
        </Button>
        <Button
          type="button"
          variant={visibility === "private" ? "default" : "outline"}
          className={cn("flex-1 gap-2", visibility === "private" && "pointer-events-none")}
          onClick={() => onChange("private", allowedRoles)}
        >
          <Lock className="h-4 w-4" /> Private
        </Button>
      </div>
      {visibility === "private" && (
        <RoleMultiSelect
          selectedRoles={allowedRoles || []}
          onChange={(roles) => onChange("private", roles)}
        />
      )}
    </div>
  );
}
