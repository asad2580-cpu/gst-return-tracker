import { BulkImportDialog } from "../components/BulkImportDialog";
import React, { useMemo, useState } from "react";
import { Eye, EyeOff, Search, Filter, UserCog, Loader2, Plus, Calendar, AlertCircle, CheckCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import type { Client, GstReturn, User, UpdateGstReturn } from "@shared/schema";

// Local types
type ClientWithReturns = Client & { returns: GstReturn[] };
type GSTStatus = "Pending" | "Filed" | "Late";

type NewClient = {
  name: string;
  gstin: string;
  assignedToId: string;
  gstUsername?: string;
  gstPassword?: string;
  remarks?: string;
  previousReturns?: "none" | "mark_all_previous";
};

const StatusBadge = ({
  status,
  onClick,
  canEdit,
  dueDate,
}: {
  status: GSTStatus;
  onClick?: () => void;
  canEdit: boolean;
  dueDate?: string;
}) => {
  const styles: Record<GSTStatus, string> = {
    Filed:
      "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400",
    Pending:
      "bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400",
    Late: "bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400",
  };

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Badge
        className={`${styles[status]} cursor-${
          canEdit ? "pointer" : "default"
        } transition-colors border-transparent`}
        onClick={canEdit ? onClick : undefined}
        data-testid="badge-status"
      >
        {status}
      </Badge>
      {dueDate && status === "Pending" && (
        <span className="text-[9px] text-muted-foreground">Due: {dueDate}</span>
      )}
    </div>
  );
};

function getFinancialYearMonths() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  let fyStart = currentYear;
  if (currentMonth < 3) fyStart = currentYear - 1;

  const months: string[] = [];
  for (let i = 0; i < 12; i++) {
    const monthIndex = (3 + i) % 12;
    const year = monthIndex < 3 ? fyStart + 1 : fyStart;
    const month = String(monthIndex + 1).padStart(2, "0");
    months.push(`${year}-${month}`);
  }

  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(
    2,
    "0"
  )}`;
  const currentMonthIndex = months.indexOf(currentMonthStr);
  const startIndex = Math.max(0, currentMonthIndex - 2);
  return months.slice(startIndex, startIndex + 6);
}

function getDueDate(month: string, returnType: "gstr1" | "gstr3b") {
  const [year, mon] = month.split("-");
  const nextMonth = parseInt(mon) === 12 ? 1 : parseInt(mon) + 1;
  const nextYear = parseInt(mon) === 12 ? parseInt(year) + 1 : parseInt(year);
  const dueDay = returnType === "gstr1" ? 11 : 20;
  return `${dueDay}/${String(nextMonth).padStart(2, "0")}`;
}

function isOverdue(month: string, returnType: "gstr1" | "gstr3b") {
  const today = new Date();
  const [year, mon] = month.split("-");
  const nextMonth = parseInt(mon) === 12 ? 1 : parseInt(mon) + 1;
  const nextYear = parseInt(mon) === 12 ? parseInt(year) + 1 : parseInt(year);
  const dueDay = returnType === "gstr1" ? 11 : 20;
  const dueDate = new Date(nextYear, nextMonth - 1, dueDay);
  return today > dueDate;
}

export default function ClientList() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<GSTStatus | "All">("All");
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [staffSearchOpen, setStaffSearchOpen] = useState(false);
  const [staffSearchQuery, setStaffSearchQuery] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [newClient, setNewClient] = useState<NewClient>({
    name: "",
    gstin: "",
    assignedToId: "",
    gstUsername: "",
    gstPassword: "",
    remarks: "",
  });
  
  // Edit client states
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientWithReturns | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [editStaffSearchOpen, setEditStaffSearchOpen] = useState(false);
  const [editStaffSearchQuery, setEditStaffSearchQuery] = useState("");

  const togglePasswordVisibility = (clientId: string) => {
    setShowPasswords(prev => ({
      ...prev,
      [clientId]: !prev[clientId]
    }));
  };

  const { data: clients, isLoading, refetch } = useQuery<ClientWithReturns[]>({
    queryKey: ["/api/clients"],
  });

  const { data: staff } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "admin",
  });

  const updateReturnMutation = useMutation({
    mutationFn: async ({
      returnId,
      update,
    }: {
      returnId: string;
      update: UpdateGstReturn;
    }) => {
      return await apiRequest("PATCH", `/api/returns/${returnId}`, update);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Status updated",
        description: "Return status has been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cannot update status",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  const assignClientMutation = useMutation({
    mutationFn: async ({
      clientId,
      staffId,
    }: {
      clientId: string;
      staffId: string;
    }) => {
      const res = await apiRequest("PATCH", `/api/clients/${clientId}/assign`, {
        staffId,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      toast({
        title: "Client reassigned",
        description: "Client has been assigned to the selected staff member.",
      });
    },
  });

  const editClientMutation = useMutation({
    mutationFn: async (clientData: ClientWithReturns) => {
      const res = await apiRequest("PATCH", `/api/clients/${clientData.id}`, {
        name: clientData.name,
        gstin: clientData.gstin,
        assignedToId: clientData.assignedToId,
        gstUsername: clientData.gstUsername,
        gstPassword: clientData.gstPassword,
        remarks: clientData.remarks,
      });
      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
      setIsEditDialogOpen(false);
      setEditingClient(null);
      toast({
        title: "Client updated",
        description: "Client details have been updated successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update client",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  

  const addClientMutation = useMutation({
    mutationFn: async (clientData: NewClient) => {
      const res = await apiRequest("POST", "/api/clients", clientData);
      const data =
        typeof (res as any)?.json === "function"
          ? await (res as any).json()
          : res;
      return data;
    },

    onMutate: async (clientData: NewClient) => {
      await queryClient.cancelQueries({ queryKey: ["/api/clients"] });

      const previous = queryClient.getQueryData<ClientWithReturns[]>([
        "/api/clients",
      ]);

      const tempId = `temp-${Date.now()}`;

      const currentMonthStr = `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1
      ).padStart(2, "0")}`;

      const currentIndex = months.indexOf(currentMonthStr);

      console.log(
        "onMutate - previousReturns:",
        clientData.previousReturns,
        "currentIndex:",
        currentIndex,
        "months:",
        months
      );

      let optimisticReturns: GstReturn[] = [];

      if (clientData.previousReturns === "mark_all_previous") {
        const markUntilIndex =
          currentIndex === -1 ? months.length : currentIndex;

        optimisticReturns = months
          .map((m, idx) => ({ m, idx }))
          .filter(({ idx }) => idx < markUntilIndex)
          .map(
            ({ m }) =>
              ({
                id: `temp-ret-${tempId}-${m}`,
                month: m,
                gstr1: "Filed",
                gstr3b: "Filed",
              } as unknown as GstReturn)
          );
      }

      const optimisticClient: ClientWithReturns = {
        id: tempId,
        name: clientData.name,
        gstin: clientData.gstin,
        assignedToId: clientData.assignedToId || "",
        returns: optimisticReturns,
        gstUsername: clientData.gstUsername,
        gstPassword: clientData.gstPassword,
        remarks: clientData.remarks,
      } as unknown as ClientWithReturns;

      queryClient.setQueryData<ClientWithReturns[] | undefined>(
        ["/api/clients"],
        (old) => (old ? [optimisticClient, ...old] : [optimisticClient])
      );

      return { previous, tempId };
    },

    onError: (error: any, newClientArg, context: any) => {
      queryClient.setQueryData(["/api/clients"], context?.previous);
      toast({
        title: "Failed to add client",
        description:
          error?.message || "Something went wrong while adding client.",
        variant: "destructive",
      });
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] });
    },

    onSuccess: () => {
      setIsAddClientOpen(false);
      setNewClient({
        name: "",
        gstin: "",
        assignedToId: "",
        gstUsername: "",
        gstPassword: "",
        remarks: "",
        previousReturns: "none",
      });
      setStaffSearchQuery("");
      toast({
        title: "Client added",
        description: "New client has been added successfully.",
      });
    },
  });

  const initializeReturnsMutation = useMutation({
    mutationFn: async ({
      clientId,
      month,
    }: {
      clientId: string;
      month: string;
    }) => {
      const res = await apiRequest("POST", `/api/clients/${clientId}/returns`, {
        month,
      });
      return res.json();
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["/api/clients"] }),
  });

  const isAdmin = user?.role === "admin";

  const months = useMemo(() => getFinancialYearMonths(), []);

  const validateGSTIN = (gstin: string): boolean => {
    const gstinRegex =
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    return gstinRegex.test(gstin.toUpperCase());
  };

  const filteredClients = (clients || []).filter((client) => {
    const matchesSearch =
      client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.gstin.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "All"
        ? true
        : client.returns.some(
            (r) => r.gstr1 === statusFilter || r.gstr3b === statusFilter
          );

    return matchesSearch && matchesStatus;
  });

  const handleStatusChange = (
    client: ClientWithReturns,
    month: string,
    type: "gstr1" | "gstr3b"
  ) => {
    const currentReturn = client.returns.find((r) => r.month === month);
    if (!currentReturn) {
      initializeReturnsMutation.mutate({ clientId: client.id, month });
      return;
    }

    const currentStatus = currentReturn[type];
    let nextStatus: GSTStatus = "Pending";
    if (currentStatus === "Pending") nextStatus = "Filed";
    else if (currentStatus === "Filed") nextStatus = "Late";
    else if (currentStatus === "Late") nextStatus = "Pending";

    updateReturnMutation.mutate({
      returnId: currentReturn.id,
      update: { [type]: nextStatus } as UpdateGstReturn,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount = (clients || []).reduce((acc, client) => {
    const currentMonth = months[2];
    const ret = client.returns.find((r) => r.month === currentMonth);
    if (ret) {
      if (ret.gstr1 === "Pending") acc++;
      if (ret.gstr3b === "Pending") acc++;
    }
    return acc;
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            GST Returns Tracker
          </h1>
          <p className="text-muted-foreground">
            FY 2024-25 • {pendingCount} returns pending this month
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
    <BulkImportDialog onSuccess={() => refetch()} />
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients or GSTIN..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              data-testid="input-search-clients"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(v: any) => setStatusFilter(v)}
          >
            <SelectTrigger
              className="w-[130px]"
              data-testid="select-filter-status"
            >
              <Filter className="mr-2 h-4 w-4" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Filed">Filed</SelectItem>
              <SelectItem value="Late">Late</SelectItem>
            </SelectContent>
          </Select>

          {isAdmin && (
            <Dialog open={isAddClientOpen} onOpenChange={setIsAddClientOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-client">
                  <Plus className="mr-2 h-4 w-4" />
                  Add Client
                </Button>
              </DialogTrigger>

              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Client</DialogTitle>
                  <DialogDescription>
                    Enter the client details including GST portal credentials.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="client-name">Business Name *</Label>
                    <Input
                      id="client-name"
                      placeholder="e.g., Sharma Enterprises Pvt Ltd"
                      value={newClient.name}
                      onChange={(e) =>
                        setNewClient({ ...newClient, name: e.target.value })
                      }
                      data-testid="input-client-name"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="client-gstin">GSTIN *</Label>
                    <Input
                      id="client-gstin"
                      placeholder="e.g., 27AABCS1429B1ZK"
                      value={newClient.gstin}
                      onChange={(e) =>
                        setNewClient({
                          ...newClient,
                          gstin: e.target.value.toUpperCase(),
                        })
                      }
                      maxLength={15}
                      className="font-mono"
                      data-testid="input-client-gstin"
                    />
                    {newClient.gstin.length > 0 && (
                      <div
                        className={`flex items-center gap-1 text-xs ${
                          validateGSTIN(newClient.gstin)
                            ? "text-green-600"
                            : "text-red-500"
                        }`}
                      >
                        {validateGSTIN(newClient.gstin) ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {validateGSTIN(newClient.gstin)
                          ? "Valid GSTIN format"
                          : "Invalid GSTIN format"}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="gst-username">GST Portal Username</Label>
                    <Input
                      id="gst-username"
                      placeholder="e.g., username@gst.gov.in"
                      value={newClient.gstUsername || ""}
                      onChange={(e) =>
                        setNewClient({
                          ...newClient,
                          gstUsername: e.target.value,
                        })
                      }
                      data-testid="input-gst-username"
                    />
                    <p className="text-xs text-muted-foreground">
                      Usually in format: username@domain or mobile number
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="gst-password">GST Portal Password</Label>
                    <div className="relative">
                      <Input
                        id="gst-password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter GST portal password"
                        value={newClient.gstPassword || ""}
                        onChange={(e) =>
                          setNewClient({
                            ...newClient,
                            gstPassword: e.target.value,
                          })
                        }
                        className="pr-10"
                        data-testid="input-gst-password"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Store client's GST portal password securely
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="client-remarks">Remarks</Label>
                    <Textarea
                      id="client-remarks"
                      placeholder="Any special notes about this client..."
                      value={newClient.remarks || ""}
                      onChange={(e) =>
                        setNewClient({ ...newClient, remarks: e.target.value })
                      }
                      rows={3}
                      data-testid="input-client-remarks"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="previous-returns">
                      All previous returns are filed
                    </Label>
                    <Select
                      value={newClient.previousReturns || "none"}
                      onValueChange={(v: any) =>
                        setNewClient({ ...newClient, previousReturns: v })
                      }
                    >
                      <SelectTrigger id="previous-returns" className="w-full">
                        <SelectValue placeholder="Choose an option" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          No — keep previous returns as Pending
                        </SelectItem>
                        <SelectItem value="mark_all_previous">
                          Yes — mark all previous returns as Filed
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      If you choose Yes, all earlier months in the table will be
                      marked as Filed for this client.
                    </p>
                  </div>

                  <div className="grid gap-2">
                    <Label>Assign to Staff *</Label>
                    <Popover
                      open={staffSearchOpen}
                      onOpenChange={setStaffSearchOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="justify-between w-full"
                          data-testid="select-assign-staff"
                        >
                          {newClient.assignedToId
                            ? staff?.find(
                                (s) => s.id === newClient.assignedToId
                              )?.name
                            : "Select staff member..."}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent className="w-full p-0" align="start">
                        <div className="flex items-center border-b px-3">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <Input
                            placeholder="Search staff..."
                            value={staffSearchQuery}
                            onChange={(e) =>
                              setStaffSearchQuery(e.target.value)
                            }
                            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>

                        <div className="max-h-60 overflow-y-auto p-1">
                          {staff
                            ?.filter(
                              (s) =>
                                s.name
                                  ?.toLowerCase()
                                  .includes(staffSearchQuery.toLowerCase()) ||
                                s.email
                                  ?.toLowerCase()
                                  .includes(staffSearchQuery.toLowerCase())
                            )
                            .map((staffMember) => (
                              <div
                                key={staffMember.id}
                                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                onClick={() => {
                                  setNewClient({
                                    ...newClient,
                                    assignedToId: staffMember.id,
                                  });
                                  setStaffSearchOpen(false);
                                  setStaffSearchQuery("");
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {staffMember.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {staffMember.email}
                                  </span>
                                </div>
                                {newClient.assignedToId === staffMember.id && (
                                  <CheckCircle className="ml-auto h-4 w-4 text-primary" />
                                )}
                              </div>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsAddClientOpen(false);
                      setNewClient({
                        name: "",
                        gstin: "",
                        assignedToId: "",
                        gstUsername: "",
                        gstPassword: "",
                        remarks: "",
                      });
                      setShowPassword(false);
                      setStaffSearchQuery("");
                    }}
                  >
                    Cancel
                  </Button>

                  <Button
                    onClick={() => addClientMutation.mutate(newClient)}
                    disabled={
                      !newClient.name ||
                      !validateGSTIN(newClient.gstin) ||
                      !newClient.assignedToId ||
                      addClientMutation.isPending
                    }
                    data-testid="button-submit-client"
                  >
                    {addClientMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Add Client
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {/* Edit Client Dialog */}
          {isAdmin && editingClient && (
            <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Client</DialogTitle>
                  <DialogDescription>
                    Update client details and GST portal credentials.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="edit-client-name">Business Name *</Label>
                    <Input
                      id="edit-client-name"
                      value={editingClient.name}
                      onChange={(e) =>
                        setEditingClient({ ...editingClient, name: e.target.value })
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-client-gstin">GSTIN *</Label>
                    <Input
                      id="edit-client-gstin"
                      value={editingClient.gstin}
                      onChange={(e) =>
                        setEditingClient({
                          ...editingClient,
                          gstin: e.target.value.toUpperCase(),
                        })
                      }
                      maxLength={15}
                      className="font-mono"
                    />
                    {editingClient.gstin.length > 0 && (
                      <div
                        className={`flex items-center gap-1 text-xs ${
                          validateGSTIN(editingClient.gstin)
                            ? "text-green-600"
                            : "text-red-500"
                        }`}
                      >
                        {validateGSTIN(editingClient.gstin) ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                        {validateGSTIN(editingClient.gstin)
                          ? "Valid GSTIN format"
                          : "Invalid GSTIN format"}
                      </div>
                    )}
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-gst-username">GST Portal Username</Label>
                    <Input
                      id="edit-gst-username"
                      value={editingClient.gstUsername || ""}
                      onChange={(e) =>
                        setEditingClient({
                          ...editingClient,
                          gstUsername: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-gst-password">GST Portal Password</Label>
                    <div className="relative">
                      <Input
                        id="edit-gst-password"
                        type={showEditPassword ? "text" : "password"}
                        value={editingClient.gstPassword || ""}
                        onChange={(e) =>
                          setEditingClient({
                            ...editingClient,
                            gstPassword: e.target.value,
                          })
                        }
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                        onClick={() => setShowEditPassword(!showEditPassword)}
                      >
                        {showEditPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="edit-client-remarks">Remarks</Label>
                    <Textarea
                      id="edit-client-remarks"
                      value={editingClient.remarks || ""}
                      onChange={(e) =>
                        setEditingClient({ ...editingClient, remarks: e.target.value })
                      }
                      rows={3}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label>Assign to Staff *</Label>
                    <Popover
                      open={editStaffSearchOpen}
                      onOpenChange={setEditStaffSearchOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="justify-between w-full"
                        >
                          {editingClient.assignedToId
                            ? staff?.find(
                                (s) => s.id === editingClient.assignedToId
                              )?.name
                            : "Select staff member..."}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>

                      <PopoverContent className="w-full p-0" align="start">
                        <div className="flex items-center border-b px-3">
                          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                          <Input
                            placeholder="Search staff..."
                            value={editStaffSearchQuery}
                            onChange={(e) =>
                              setEditStaffSearchQuery(e.target.value)
                            }
                            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                          />
                        </div>

                        <div className="max-h-60 overflow-y-auto p-1">
                          {staff
                            ?.filter(
                              (s) =>
                                s.name
                                  ?.toLowerCase()
                                  .includes(editStaffSearchQuery.toLowerCase()) ||
                                s.email
                                  ?.toLowerCase()
                                  .includes(editStaffSearchQuery.toLowerCase())
                            )
                            .map((staffMember) => (
                              <div
                                key={staffMember.id}
                                className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                onClick={() => {
                                  setEditingClient({
                                    ...editingClient,
                                    assignedToId: staffMember.id,
                                  });
                                  setEditStaffSearchOpen(false);
                                  setEditStaffSearchQuery("");
                                }}
                              >
                                <div className="flex flex-col">
                                  <span className="font-medium">
                                    {staffMember.name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    {staffMember.email}
                                  </span>
                                </div>
                                {editingClient.assignedToId === staffMember.id && (
                                  <CheckCircle className="ml-auto h-4 w-4 text-primary" />
                                )}
                              </div>
                            ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingClient(null);
                      setShowEditPassword(false);
                      setEditStaffSearchQuery("");
                    }}
                  >
                    Cancel
                  </Button>

                  <Button
                    onClick={() => editClientMutation.mutate(editingClient)}
                    disabled={
                      !editingClient.name ||
                      !validateGSTIN(editingClient.gstin) ||
                      !editingClient.assignedToId ||
                      editClientMutation.isPending
                    }
                  >
                    {editClientMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Save Changes
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          <Card className="border shadow-sm">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/30">
                    <TableHead className="w-[220px] sticky left-0 bg-muted/30">
                      Client Details
                    </TableHead>
                    {isAdmin && (
                      <TableHead className="w-[140px]">Assigned To</TableHead>
                    )}
                    {months.map((month) => {
                      const [year, mon] = month.split("-");
                      const monthName = new Date(
                        parseInt(year),
                        parseInt(mon) - 1
                      ).toLocaleDateString("en-IN", { month: "short" });
                      const isCurrentMonth =
                        month ===
                        `${new Date().getFullYear()}-${String(
                          new Date().getMonth() + 1
                        ).padStart(2, "0")}`;
                      return (
                        <TableHead
                          key={month}
                          className={`text-center border-l border-border/50 min-w-[100px] ${
                            isCurrentMonth ? "bg-primary/5" : ""
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <span className="font-semibold">{monthName}</span>
                            <span className="text-[10px] text-muted-foreground font-normal">
                              {year}
                            </span>
                          </div>
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredClients.map((client) => (
                    <TableRow
                      key={client.id}
                      className="group hover:bg-muted/30 transition-colors"
                      data-testid={`row-client-${client.id}`}
                    >
                      <TableCell className="font-medium sticky left-0 bg-card group-hover:bg-muted/30">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-2 flex-1">
                            <div className="flex flex-col">
                              <span className="text-sm text-foreground font-medium">
                                {client.name}
                              </span>
                              <span className="text-xs text-muted-foreground font-mono tracking-wide">
                                {client.gstin}
                              </span>
                            </div>
                            
                            {(client.gstUsername || client.gstPassword) && (
                              <div className="flex flex-col gap-1 pt-1 border-t border-border/50">
                                {client.gstUsername && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground uppercase font-semibold w-12">User:</span>
                                    <span className="text-xs text-foreground font-mono">{client.gstUsername}</span>
                                  </div>
                                )}
                                {client.gstPassword && (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground uppercase font-semibold w-12">Pass:</span>
                                    <div className="flex items-center gap-1">
                                      <span className="text-xs text-foreground font-mono">
                                        {showPasswords[client.id] ? client.gstPassword : '••••••••'}
                                      </span>
                                      <button
                                        onClick={() => togglePasswordVisibility(client.id)}
                                        className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                                      >
                                        {showPasswords[client.id] ? (
                                          <EyeOff className="h-3 w-3" />
                                        ) : (
                                          <Eye className="h-3 w-3" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {isAdmin && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => {
                                setEditingClient(client);
                                setIsEditDialogOpen(true);
                              }}
                            >
                              <UserCog className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                                            {isAdmin && (
                        <TableCell>
                          {staff?.find(
                            (s) => s.id === client.assignedToId
                          )?.name || "—"}
                        </TableCell>
                      )}

                      {months.map((month) => {
                        const ret = client.returns.find(
                          (r) => r.month === month
                        );

                        return (
                          <TableCell
                            key={month}
                            className="text-center border-l border-border/50"
                          >
                            <div className="flex flex-col gap-1 items-center">
                              <StatusBadge
                                status={
                                  ret?.gstr1 ??
                                  (isOverdue(month, "gstr1")
                                    ? "Late"
                                    : "Pending")
                                }
                                canEdit={isAdmin}
                                onClick={() =>
                                  handleStatusChange(
                                    client,
                                    month,
                                    "gstr1"
                                  )
                                }
                                dueDate={getDueDate(month, "gstr1")}
                              />

                              <StatusBadge
                                status={
                                  ret?.gstr3b ??
                                  (isOverdue(month, "gstr3b")
                                    ? "Late"
                                    : "Pending")
                                }
                                canEdit={isAdmin}
                                onClick={() =>
                                  handleStatusChange(
                                    client,
                                    month,
                                    "gstr3b"
                                  )
                                }
                                dueDate={getDueDate(month, "gstr3b")}
                              />
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
