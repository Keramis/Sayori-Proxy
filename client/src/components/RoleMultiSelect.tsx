import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, X } from "lucide-react";
import { api } from "@/lib/api";

interface RoleMultiSelectProps {
  selectedRoles: string[];
  onChange: (roles: string[]) => void;
}

export function RoleMultiSelect({ selectedRoles, onChange }: RoleMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [availableRoles, setAvailableRoles] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    api.getGuildRoles()
      .then(setAvailableRoles)
      .catch(() => setAvailableRoles([]));
  }, []);

  const toggleRole = (roleId: string) => {
    if (selectedRoles.includes(roleId)) {
      onChange(selectedRoles.filter((id) => id !== roleId));
    } else {
      onChange([...selectedRoles, roleId]);
    }
  };

  const getRoleName = (roleId: string) => availableRoles.find((r) => r.id === roleId)?.name || roleId;

  return (
    <div className="space-y-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-full justify-between" type="button">
            {selectedRoles.length === 0 ? "Select roles..." : `${selectedRoles.length} role(s) selected`}
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full min-w-[200px] p-2" align="start">
          <div className="max-h-60 overflow-y-auto space-y-1">
            {availableRoles.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2 text-center">No roles available</p>
            ) : (
              availableRoles.map((role) => (
                <label
                  key={role.id}
                  className="flex items-center space-x-2 rounded-sm px-2 py-1.5 cursor-pointer hover:bg-accent"
                >
                  <Checkbox
                    checked={selectedRoles.includes(role.id)}
                    onCheckedChange={() => toggleRole(role.id)}
                  />
                  <span className="text-sm">{role.name}</span>
                </label>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
      {selectedRoles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedRoles.map((roleId) => (
            <Badge key={roleId} variant="secondary" className="gap-1">
              {getRoleName(roleId)}
              <button onClick={() => toggleRole(roleId)} className="ml-1 hover:text-destructive" type="button">
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
