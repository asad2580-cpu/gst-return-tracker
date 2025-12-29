import React, { useState } from "react";
import { Users, ArrowRight, Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function StaffReassignmentModal({
  staff,
  reason,
  reassignments,
  open,
  onOpenChange,
}: any) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleExecute = async () => {
    setIsSubmitting(true);
    try {
      await apiRequest("POST", `/api/staff/${staff.id}/delete-workflow`, {
        reason,
        reassignments,
      });

      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });

      toast({
        title: "Success",
        description: "Staff deleted and clients reassigned",
      });

      onOpenChange(false);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Deletion failed",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Confirm Deletion
          </DialogTitle>
        </DialogHeader>

        <Button
          className="w-full bg-green-600 hover:bg-green-700"
          disabled={isSubmitting}
          onClick={handleExecute}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Delete Staff Permanently"
          )}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
