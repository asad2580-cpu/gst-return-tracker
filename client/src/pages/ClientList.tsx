import React, { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
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
  Search,
  Filter,
  UserCog,
  Loader2,
  Plus,
  Calendar,
  AlertCircle,
  CheckCircle,
} from "lucide-react";
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
  // new: how to treat previous returns when creating the client
  // values: "none" (default) or "mark_all_previous" (mark previous returns as Filed)
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
  const [newClient, setNewClient] = useState<NewClient>({
    name: "",
    gstin: "",
    assignedToId: "",
    gstUsername: "",
    gstPassword: "",
    remarks: "",
  });

  const { data: clients, isLoading } = useQuery<ClientWithReturns[]>({
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
      // stop any running refetches so we can apply optimistic update safely
      await queryClient.cancelQueries({ queryKey: ["/api/clients"] });

      // snapshot previous value so we can roll back if needed
      const previous = queryClient.getQueryData<ClientWithReturns[]>([
        "/api/clients",
      ]);

      // temp id for optimistic client
      const tempId = `temp-${Date.now()}`;

      // compute optimistic returns only for months that are BEFORE the current month
      const currentMonthStr = `${new Date().getFullYear()}-${String(
        new Date().getMonth() + 1
      ).padStart(2, "0")}`;

      // find index of currentMonthStr inside `months` array
      const currentIndex = months.indexOf(currentMonthStr);

      // DEBUG: show what option was chosen and the currentIndex
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
        // if currentIndex is -1 (not found), we treat everything as previous
        const markUntilIndex =
          currentIndex === -1 ? months.length : currentIndex;

        // months with index < markUntilIndex are considered previous
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

      // put optimistic client at top of clients list
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
                        <div className="flex flex-col">
                          <span className="text-sm text-foreground font-medium">
                            {client.name}
                          </span>
                          <span className="text-xs text-muted-foreground font-mono tracking-wide">
                            {client.gstin}
                          </span>
                        </div>
                      </TableCell>

                      {isAdmin && (
                        <TableCell>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs font-normal"
                                data-testid={`button-assign-${client.id}`}
                              >
                                <UserCog className="mr-2 h-3 w-3" />
                                {staff?.find(
                                  (u) => u.id === client.assignedToId
                                )?.name || "Unassigned"}
                              </Button>
                            </PopoverTrigger>

                            <PopoverContent
                              className="w-[200px] p-0"
                              align="start"
                            >
                              <div className="p-2">
                                <p className="text-xs font-medium text-muted-foreground mb-2 px-2">
                                  Assign to Staff
                                </p>
                                {staff?.map((staffMember) => (
                                  <div
                                    key={staffMember.id}
                                    className="flex items-center px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer"
                                    onClick={() =>
                                      assignClientMutation.mutate({
                                        clientId: client.id,
                                        staffId: staffMember.id,
                                      })
                                    }
                                    data-testid={`option-assign-${staffMember.id}`}
                                  >
                                    {staffMember.name}
                                  </div>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        </TableCell>
                      )}

                      {months.map((month) => {
                        const returnData = client.returns.find(
                          (r) => r.month === month
                        );
                        const isCurrentMonth =
                          month ===
                          `${new Date().getFullYear()}-${String(
                            new Date().getMonth() + 1
                          ).padStart(2, "0")}`;

                        const gstr1Status = returnData?.gstr1 || "Pending";
                        const gstr3bStatus = returnData?.gstr3b || "Pending";

                        const gstr1Overdue =
                          gstr1Status === "Pending" &&
                          isOverdue(month, "gstr1");
                        const gstr3bOverdue =
                          gstr3bStatus === "Pending" &&
                          isOverdue(month, "gstr3b");

                        return (
                          <TableCell
                            key={month}
                            className={`text-center border-l border-border/50 ${
                              isCurrentMonth ? "bg-primary/5" : ""
                            }`}
                          >
                            <div className="flex flex-col gap-2 items-center py-1">
                              <div className="flex items-center gap-2 w-full justify-between px-1">
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-wider w-6 text-left ${
                                    gstr1Overdue
                                      ? "text-red-500"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  R1
                                </span>
                                <StatusBadge
                                  status={
                                    gstr1Overdue
                                      ? "Late"
                                      : (gstr1Status as GSTStatus)
                                  }
                                  canEdit={true}
                                  onClick={() =>
                                    handleStatusChange(client, month, "gstr1")
                                  }
                                  dueDate={getDueDate(month, "gstr1")}
                                />
                              </div>

                              <div className="flex items-center gap-2 w-full justify-between px-1">
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-wider w-6 text-left ${
                                    gstr3bOverdue
                                      ? "text-red-500"
                                      : "text-muted-foreground"
                                  }`}
                                >
                                  3B
                                </span>
                                <StatusBadge
                                  status={
                                    gstr3bOverdue
                                      ? "Late"
                                      : (gstr3bStatus as GSTStatus)
                                  }
                                  canEdit={true}
                                  onClick={() =>
                                    handleStatusChange(client, month, "gstr3b")
                                  }
                                  dueDate={getDueDate(month, "gstr3b")}
                                />
                              </div>
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}

                  {filteredClients.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={
                          isAdmin ? months.length + 2 : months.length + 1
                        }
                        className="text-center py-12"
                      >
                        <div className="flex flex-col items-center gap-2">
                          <Calendar className="h-8 w-8 text-muted-foreground/50" />
                          <p className="text-sm text-muted-foreground">
                            No clients found
                          </p>
                          {isAdmin && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setIsAddClientOpen(true)}
                            >
                              <Plus className="mr-2 h-4 w-4" />
                              Add your first client
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded-lg p-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-green-500"></div>
                <span>Filed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-amber-500"></div>
                <span>Pending</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full bg-red-500"></div>
                <span>Late/Overdue</span>
              </div>
            </div>
            <div className="text-muted-foreground">
              <span className="font-medium">Due Dates:</span> GSTR-1 on 11th,
              GSTR-3B on 20th of next month
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
