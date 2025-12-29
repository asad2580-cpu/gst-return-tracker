import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar } from "lucide-react";
import type { Client, GstReturn } from "@shared/schema";

interface HistoryModalProps {
  client: Client | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    Filed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    Pending: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    Late: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return (
    <Badge variant="outline" className={`${styles[status] || ""} border-transparent`}>
      {status}
    </Badge>
  );
};

export function HistoryModal({ client, open, onOpenChange }: HistoryModalProps) {
  // Fetch only the returns for this specific client
  const { data: returns, isLoading } = useQuery<GstReturn[]>({
    queryKey: [`/api/clients/${client?.id}/returns`],
    enabled: !!client && open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-600" />
            Return History: {client?.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : returns && returns.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-center">GSTR-1</TableHead>
                  <TableHead className="text-center">GSTR-3B</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns
                  .sort((a, b) => b.month.localeCompare(a.month)) // Show newest first
                  .map((ret) => (
                    <TableRow key={ret.id}>
                      <TableCell className="font-medium">
                        {new Date(ret.month + "-01").toLocaleDateString("en-IN", {
                          month: "long",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={ret.gstr1} />
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge status={ret.gstr3b} />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground italic">
              No history found for this client.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}