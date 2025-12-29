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

export function StaffReassignmentModal({ staff, clients, otherStaff, reason, open, onOpenChange }: any) {
  const [reassignments, setReassignments] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const handleFinalExecute = async () => {
    setIsSubmitting(true);
    try {
      await apiRequest("POST", `/api/staff/${staff.id}/delete-workflow`, {
        reason,
        reassignments
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Success", description: "Staff deleted and clients reassigned." });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const allAssigned = clients.length === Object.keys(reassignments).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Reassign {clients.length} Clients
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[350px] pr-4 mt-4">
          <div className="space-y-4">
            {clients.map((client: any) => (
              <div key={client.id} className="flex flex-col gap-2 p-3 border rounded-lg bg-slate-50">
                <div className="flex justify-between items-center text-sm font-bold">
                  {client.name}
                  <ArrowRight className="h-3 w-3 text-slate-400" />
                </div>
                
                {/* Searchable Dropdown (Popover + Command) */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="justify-between h-9 text-xs">
                      {reassignments[client.id] 
                        ? otherStaff.find((s: any) => s.id === reassignments[client.id])?.name 
                        : "Select new staff..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput placeholder="Search staff..." />
                      <CommandEmpty>No staff found.</CommandEmpty>
                      <CommandGroup>
                        {otherStaff.map((s: any) => (
                          <CommandItem
                            key={s.id}
                            onSelect={() => setReassignments(prev => ({...prev, [client.id]: s.id}))}
                          >
                            <Check className={cn("mr-2 h-4 w-4", reassignments[client.id] === s.id ? "opacity-100" : "opacity-0")} />
                            {s.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="flex gap-2 mt-4">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            className="flex-1 bg-green-600 hover:bg-green-700" 
            disabled={!allAssigned || isSubmitting}
            onClick={handleFinalExecute}
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Delete Staff"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}