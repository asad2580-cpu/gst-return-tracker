import { parseISO } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { 
  Card, CardContent, CardHeader, CardTitle, CardDescription 
} from "@/components/ui/card";
import { 
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger 
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History as HistoryIcon, User, ArrowRight, ShieldCheck, Search, Loader2 } from "lucide-react";
import { Client } from "@shared/schema";
import { format } from "date-fns";

export default function HistoryPage() {
  const [search, setSearch] = useState("");

  // 1. Fetch all clients
  const { data: clients, isLoading } = useQuery<Client[]>({
    queryKey: ["/api/clients"],
  });

  const filteredClients = clients?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) || 
    c.gstin.toLowerCase().includes(search.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Staff & Client History</h1>
        <p className="text-muted-foreground">Audit trails for client assignments and staff changes.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Search by client name or GSTIN..." 
          className="pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredClients?.map((client) => (
          <ClientHistoryCard key={client.id} client={client} />
        ))}
      </div>
    </div>
  );
}

// Sub-component for each Client Card
function ClientHistoryCard({ client }: { client: Client }) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <CardTitle className="text-lg">{client.name}</CardTitle>
          <Badge variant="outline" className="font-mono text-[10px]">{client.gstin}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full gap-2">
              <HistoryIcon className="h-4 w-4" /> View Assignment History
            </Button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Assignment Timeline</SheetTitle>
              <SheetDescription>History for {client.name}</SheetDescription>
            </SheetHeader>
            <Timeline clientId={client.id} />
          </SheetContent>
        </Sheet>
      </CardContent>
    </Card>
  );
}

// The Actual Timeline Engine
function Timeline({ clientId }: { clientId: string }) {
  const { data: history, isLoading } = useQuery<any[]>({
    queryKey: [`/api/clients/${clientId}/history`],
  });

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto mt-10" />;

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground">
        <p className="text-sm">No reassignment logs found for this client.</p>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-8 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
      {history.map((entry, index) => (
        <div key={entry.id} className="relative flex items-start gap-6">
          {/* Timeline Dot */}
          <div className="absolute left-0 mt-1.5 h-10 w-10 flex items-center justify-center rounded-full bg-white border-2 border-primary z-10">
            <User className="h-5 w-5 text-primary" />
          </div>

          <div className="ml-12">
            <time className="text-xs font-medium text-muted-foreground uppercase">
                {format(parseISO(entry.timestamp + "Z"), "PPP p")}
            </time>
            <div className="mt-1 bg-muted/50 p-3 rounded-lg border border-border">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span className={entry.fromStaffName ? "text-foreground" : "text-muted-foreground italic"}>
                  {entry.fromStaffName || "Unassigned"}
                </span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-primary">{entry.toStaffName}</span>
              </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3" />
                Authorized by {entry.adminName}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}