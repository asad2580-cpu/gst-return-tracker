import React, { useState } from "react";
import { Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DeleteClientActionProps {
  clientId: string;
  clientName: string;
  onSuccess: () => void;
}

export function DeleteClientAction({ clientId, clientName, onSuccess }: DeleteClientActionProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/clients/${clientId}`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({ title: "Deleted", description: `${clientName} removed successfully.` });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  if (!showConfirm) {
    return (
      <Button 
        variant="ghost" 
        size="sm" 
        className="text-red-500 hover:text-red-700 hover:bg-red-50 gap-2"
        onClick={() => setShowConfirm(true)}
      >
        <Trash2 className="h-4 w-4" />
        Delete Client
      </Button>
    );
  }

  return (
    <div className="mt-4 p-4 border-2 border-red-200 bg-red-50 rounded-lg animate-in zoom-in-95 duration-200">
      <div className="flex items-center gap-2 text-red-700 font-bold mb-2">
        <AlertTriangle className="h-5 w-5" />
        Confirm Deletion
      </div>
      
      <p className="text-sm text-red-600 mb-3">
        Are you sure you want to delete <strong>{clientName}</strong>? This action is permanent.
      </p>

      <Input
        placeholder="Reason for deletion (Required)"
        value={reason}
        onChange={(e) => setReason(e.target.value.slice(0, 50))}
        className="border-red-300 focus-visible:ring-red-500 bg-white"
      />
      <div className="flex justify-between items-center mt-1">
        <span className="text-[10px] text-red-400">Required for audit trail</span>
        <span className={`text-[10px] ${reason.length >= 50 ? 'text-red-600 font-bold' : 'text-red-400'}`}>
          {reason.length}/50
        </span>
      </div>
      
      <div className="flex gap-2 mt-4">
        <Button 
          variant="destructive" 
          className="flex-1"
          disabled={!reason.trim() || deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete Forever"}
        </Button>
        <Button 
          variant="outline" 
          className="flex-1 bg-white"
          onClick={() => { setShowConfirm(false); setReason(""); }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}