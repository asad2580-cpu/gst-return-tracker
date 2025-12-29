import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowRight, Trash2, Users, Briefcase, Loader2 } from "lucide-react";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

// Workflow Components
import { DeleteStaffWorkflow } from "../components/DeleteStaffWorkflow";
import { StaffReassignmentModal } from "../components/StaffReassignmentModal";

// Helpers & Types
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import type { User, Client, GstReturn } from "@shared/schema";

type ClientWithReturns = Client & { returns: GstReturn[] };

export default function StaffList() {
  const [, setLocation] = useLocation();
  const { user } = useAuth(); // To check if current user is admin
  const { toast } = useToast();

  // --- 1. Data Fetching ---
  const { data: staff, isLoading: staffLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const { data: clients, isLoading: clientsLoading } = useQuery<ClientWithReturns[]>({
    queryKey: ["/api/clients"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  // --- 2. State for Deletion Workflow ---
  const [staffToWarning, setStaffToWarning] = useState<User | null>(null);
  const [staffToReassign, setStaffToReassign] = useState<User | null>(null);
  const [deletionReason, setDeletionReason] = useState("");

  // --- 3. Mutations & Handlers ---
  const deleteWorkflowMutation = useMutation({
    mutationFn: async (data: { staffId: string; reason: string; reassignments: any }) => {
      return await apiRequest("POST", `/api/staff/${data.staffId}/delete-workflow`, {
        reason: data.reason,
        reassignments: data.reassignments
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Staff Removed", description: "Records updated successfully." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const handleProceedFromWarning = (reason: string) => {
    if (!staffToWarning) return;

    setDeletionReason(reason);
    const assignedClients = (clients || []).filter(c => c.assignedToId === staffToWarning.id);

    if (assignedClients.length > 0) {
      // Step 2: Open Reassignment Modal
      setStaffToReassign(staffToWarning);
    } else {
      // Direct Delete: No clients to move
      deleteWorkflowMutation.mutate({
        staffId: staffToWarning.id,
        reason: reason,
        reassignments: {}
      });
    }
    setStaffToWarning(null);
  };

  const getClientCount = (staffId: string) => {
    return (clients || []).filter((c) => c.assignedToId === staffId).length;
  };

  if (staffLoading || clientsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const staffMembers = staff || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Staff Management</h1>
        <p className="text-muted-foreground">Manage your team and their client assignments.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {staffMembers.map((staffMember) => {
          const displayName = staffMember.name || staffMember.username || "Unknown";
          const initial = (displayName[0] || "?").toUpperCase();

          return (
            <Card
              key={staffMember.id}
              className="hover:border-primary/50 transition-all group relative overflow-hidden"
            >
              {/* Delete Icon - Admin Only */}
              <div className="absolute top-2 right-2 z-10">
                {user?.role === "admin" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setStaffToWarning(staffMember)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <CardHeader className="flex flex-row items-center gap-4 pb-2">
                <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                  <AvatarFallback className="bg-primary/10 text-primary font-bold">{initial}</AvatarFallback>
                </Avatar>
                <div className="flex-1 truncate">
                  <CardTitle className="text-lg truncate">{displayName}</CardTitle>
                  <CardDescription className="truncate">{staffMember.username}</CardDescription>
                </div>
              </CardHeader>

              <CardContent>
                <div className="mt-4 flex items-center justify-between p-3 bg-muted/50 rounded-lg group-hover:bg-primary/5 transition-colors">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-primary">
                    <Briefcase className="h-4 w-4" />
                    Assigned Clients
                  </div>
                  <Badge variant="secondary" className="text-lg px-3 py-1 font-mono">
                    {getClientCount(staffMember.id)}
                  </Badge>
                </div>

                <Button
                  variant="outline"
                  className="w-full mt-3 group-hover:bg-primary group-hover:text-primary-foreground transition-all"
                  onClick={() => setLocation(`/staff/${staffMember.id}/clients`)}
                >
                  View Clients
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          );
        })}

        {staffMembers.length === 0 && (
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-12 bg-muted/20">
            <Users className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No Staff Found</h3>
            <p className="text-sm text-muted-foreground text-center mt-2">Register staff to start assigning clients.</p>
          </Card>
        )}
      </div>

      {/* Step 1: Warning & Reason */}
      {staffToWarning && (
        <DeleteStaffWorkflow
          staff={staffToWarning}
          open={!!staffToWarning}
          // Change (open) to (open: boolean)
          onOpenChange={(open: boolean) => !open && setStaffToWarning(null)}
          onProceed={handleProceedFromWarning}
        />
      )}

      {/* Step 2: Reassignment */}
      {staffToReassign && (
        <StaffReassignmentModal
          staff={staffToReassign}
          reason={deletionReason}
          open={!!staffToReassign}
          // Change (open) to (open: boolean)
          onOpenChange={(open: boolean) => !open && setStaffToReassign(null)}
          clients={(clients || []).filter(c => c.assignedToId === staffToReassign.id)}
          otherStaff={staffMembers.filter(s => s.id !== staffToReassign.id)}
        />
      )}
    </div>
  );
}