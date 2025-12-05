import { useState } from 'react';
import { useStore, GSTStatus, Client } from '@/lib/mockData';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Filter, UserCog } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const StatusBadge = ({ status, onClick, canEdit }: { status: GSTStatus, onClick?: () => void, canEdit: boolean }) => {
  const styles = {
    Filed: 'bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400',
    Pending: 'bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400',
    Late: 'bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <Badge 
      className={`${styles[status]} cursor-${canEdit ? 'pointer' : 'default'} transition-colors border-transparent`}
      onClick={canEdit ? onClick : undefined}
    >
      {status}
    </Badge>
  );
};

export default function ClientList() {
  const { currentUser, clients, users, updateClientStatus, assignClient } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<GSTStatus | 'All'>('All');

  const isAdmin = currentUser?.role === 'admin';

  // Filter logic
  const filteredClients = clients.filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          client.gstin.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAssignment = isAdmin ? true : client.assignedToId === currentUser?.id;
    
    // Basic status filter implementation (checks if ANY return matches for simplicity in this mock)
    const matchesStatus = statusFilter === 'All' ? true : client.returns.some(r => r.gstr1 === statusFilter || r.gstr3b === statusFilter);

    return matchesSearch && matchesAssignment && matchesStatus;
  });

  const months = ['2025-01', '2025-02', '2025-03'];

  const handleStatusChange = (client: Client, month: string, type: 'gstr1' | 'gstr3b') => {
    // Cycle status: Pending -> Filed -> Late -> Pending
    const currentReturn = client.returns.find(r => r.month === month);
    const currentStatus = currentReturn ? currentReturn[type] : 'Pending';
    
    let nextStatus: GSTStatus = 'Pending';
    if (currentStatus === 'Pending') nextStatus = 'Filed';
    else if (currentStatus === 'Filed') nextStatus = 'Late';
    else if (currentStatus === 'Late') nextStatus = 'Pending';

    updateClientStatus(client.id, month, type, nextStatus);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Client Returns</h1>
          <p className="text-muted-foreground">Manage GSTR-1 and GSTR-3B compliance</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Search clients or GSTIN..." 
              className="pl-8" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[140px]">
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
        </div>
      </div>

      <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[250px]">Client Details</TableHead>
                {isAdmin && <TableHead className="w-[150px]">Assigned To</TableHead>}
                {months.map(month => (
                  <TableHead key={month} className="text-center border-l border-border/50">
                    {new Date(month).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredClients.map(client => (
                <TableRow key={client.id} className="group hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span className="text-sm text-foreground">{client.name}</span>
                      <span className="text-xs text-muted-foreground font-mono">{client.gstin}</span>
                    </div>
                  </TableCell>
                  
                  {isAdmin && (
                    <TableCell>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-normal">
                            <UserCog className="mr-2 h-3 w-3" />
                            {users.find(u => u.id === client.assignedToId)?.name || 'Unassigned'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0" align="start">
                          <div className="p-2">
                            <p className="text-xs font-medium text-muted-foreground mb-2 px-2">Assign to Staff</p>
                            {users.filter(u => u.role === 'staff').map(staff => (
                              <div 
                                key={staff.id}
                                className="flex items-center px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer"
                                onClick={() => assignClient(client.id, staff.id)}
                              >
                                {staff.name}
                              </div>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                  )}

                  {months.map(month => {
                    const returnData = client.returns.find(r => r.month === month);
                    return (
                      <TableCell key={month} className="text-center border-l border-border/50">
                        <div className="flex flex-col gap-2 items-center py-1">
                          <div className="flex items-center gap-2 w-full justify-between px-2">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8 text-left">R1</span>
                            <StatusBadge 
                              status={returnData?.gstr1 || 'Pending'} 
                              canEdit={true}
                              onClick={() => handleStatusChange(client, month, 'gstr1')}
                            />
                          </div>
                          <div className="flex items-center gap-2 w-full justify-between px-2">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8 text-left">3B</span>
                            <StatusBadge 
                              status={returnData?.gstr3b || 'Pending'} 
                              canEdit={true}
                              onClick={() => handleStatusChange(client, month, 'gstr3b')}
                            />
                          </div>
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
  );
}
