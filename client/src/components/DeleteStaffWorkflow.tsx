import React, { useState } from "react";
import { Trash2, AlertTriangle, Users } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function DeleteStaffWorkflow({
  staff,
  clients,
  otherStaff,
  open,
  onOpenChange,
  onProceed, // 🔑 callback to StaffList
}: any) {
  const [step, setStep] = useState<1 | 2>(1);
  const [reason, setReason] = useState("");
  const [reassignments, setReassignments] = useState<Record<string, string>>({});

  const assignedClients =
    clients?.filter((c: any) => c.assignedToId === staff.id) || [];

  // ---- FINAL PROCEED (NO API HERE) ----
  const proceed = () => {
    onProceed(reason, reassignments);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-red-600 flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> Delete {staff.name}
          </DialogTitle>
        </DialogHeader>

        {/* STEP 1 — REASON */}
        {step === 1 && (
          <div className="space-y-4 py-4">
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 inline mr-2" />
              This staff will be logged out immediately.
            </div>

            <Input
              placeholder="Reason for deletion (required)"
              maxLength={50}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <Button
              className="w-full"
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() => {
                if (assignedClients.length > 0) {
                  setStep(2);
                } else {
                  proceed();
                }
              }}
            >
              {assignedClients.length > 0
                ? "Next: Reassign Clients"
                : "Confirm Delete"}
            </Button>
          </div>
        )}

        {/* STEP 2 — REASSIGN */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-blue-600" />
              Reassign {assignedClients.length} Clients
            </div>

            <ScrollArea className="h-[300px] border rounded-md p-2">
              {assignedClients.map((client: any) => (
                <div
                  key={client.id}
                  className="flex flex-col gap-2 py-2 border-b"
                >
                  <span className="text-xs font-semibold">{client.name}</span>
                  <Select
                    onValueChange={(val) =>
                      setReassignments((prev) => ({
                        ...prev,
                        [client.id]: val,
                      }))
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Select staff" />
                    </SelectTrigger>
                    <SelectContent>
                      {otherStaff
                        .filter((s: any) => s.id !== staff.id)
                        .map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </ScrollArea>

            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={
                Object.keys(reassignments).length !== assignedClients.length
              }
              onClick={proceed}
            >
              Save & Continue
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
