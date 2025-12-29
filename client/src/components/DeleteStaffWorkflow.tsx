import React, { useState } from "react";
import { Trash2, AlertTriangle, Users, ArrowRight, CheckCircle, Search } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function DeleteStaffWorkflow({ staff, clients, otherStaff, open, onOpenChange }: any) {
  const [step, setStep] = useState(1); // 1: Reason, 2: Reassign
  const [reason, setReason] = useState("");
  const [reassignments, setReassignments] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const assignedClients = clients?.filter((c: any) => c.assignedToId === staff.id) || [];

  const handleFinalDelete = async () => {
    try {
      await apiRequest("POST", `/api/staff/${staff.id}/delete-workflow`, {
        reason,
        reassignments // Map of clientId -> newStaffId
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Staff Removed", description: "All data updated successfully." });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> Delete {staff.name}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4 py-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 mb-1 inline mr-2" />
              <strong>Warning:</strong> This staff will be logged out immediately and blocked from future access to this admin's workspace.
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Reason for Deletion (Mandatory)</label>
              <Input 
                placeholder="e.g. Resigned, Performance issues..." 
                maxLength={50}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">{reason.length}/50 chars</p>
            </div>
            <Button 
              className="w-full" 
              variant="destructive" 
              disabled={!reason.trim()}
              onClick={() => assignedClients.length > 0 ? setStep(2) : handleFinalDelete()}
            >
              {assignedClients.length > 0 ? "Next: Reassign Clients" : "Confirm Delete"}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm font-medium flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              Reassign {assignedClients.length} Clients
            </div>
            
            <ScrollArea className="h-[300px] border rounded-md p-2">
              {assignedClients.map((client: any) => (
                <div key={client.id} className="flex flex-col py-2 border-b last:border-0 gap-2">
                  <span className="text-xs font-semibold">{client.name}</span>
                  <Select onValueChange={(val) => setReassignments(prev => ({...prev, [client.id]: val}))}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select New Staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherStaff.filter((s: any) => s.id !== staff.id).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </ScrollArea>

            <Button 
              className="w-full bg-green-600 hover:bg-green-700" 
              disabled={Object.keys(reassignments).length !== assignedClients.length}
              onClick={handleFinalDelete}
            >
              Save Changes & Delete Staff
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}