import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Search, Filter, UserCog, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { Client, GstReturn, User, UpdateGstReturn } from '@shared/schema';

type ClientWithReturns = Client & { returns: GstReturn[] };
type GSTStatus = 'Pending' | 'Filed' | 'Late';

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
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<GSTStatus | 'All'>('All');

  const { data: clients, isLoading } = useQuery<ClientWithReturns[]>({
    queryKey: ['/api/clients'],
  });

  const { data: staff } = useQuery<User[]>({
    queryKey: ['/api/users/staff'],
    enabled: user?.role === 'admin',
  });

  const updateReturnMutation = useMutation({
    mutationFn: async ({ returnId, update }: { returnId: string, update: UpdateGstReturn }) => {
      const res = await apiRequest('PATCH', `/api/returns/${returnId}`, update);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
    },
  });

  const assignClientMutation = useMutation({
    mutationFn: async ({ clientId, staffId }: { clientId: string, staffId: string }) => {
      const res = await apiRequest('PATCH', `/api/clients/${clientId}/assign`, { staffId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
    },
  });

  const isAdmin = user?.role === 'admin';

  const filteredClients = (clients || []).filter(client => {
    const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          client.gstin.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'All' ? true : client.returns.some(r => r.gstr1 === statusFilter || r.gstr3b === statusFilter);

    return matchesSearch && matchesStatus;
  });

  const months = ['2025-01', '2025-02', '2025-03'];

  const handleStatusChange = (client: ClientWithReturns, month: string, type: 'gstr1' | 'gstr3b') => {
    const currentReturn = client.returns.find(r => r.month === month);
    if (!currentReturn) return;

    const currentStatus = currentReturn[type];
    
    let nextStatus: GSTStatus = 'Pending';
    if (currentStatus === 'Pending') nextStatus = 'Filed';
    else if (currentStatus === 'Filed') nextStatus = 'Late';
    else if (currentStatus === 'Late') nextStatus = 'Pending';

    updateReturnMutation.mutate({
      returnId: currentReturn.id,
      update: { [type]: nextStatus }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
              data-testid="input-search-clients"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
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
                <TableRow key={client.id} className="group hover:bg-muted/30 transition-colors" data-testid={`row-client-${client.id}`}>
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
                          <Button variant="ghost" size="sm" className="h-8 px-2 text-xs font-normal" data-testid={`button-assign-${client.id}`}>
                            <UserCog className="mr-2 h-3 w-3" />
                            {staff?.find(u => u.id === client.assignedToId)?.name || 'Unassigned'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-0" align="start">
                          <div className="p-2">
                            <p className="text-xs font-medium text-muted-foreground mb-2 px-2">Assign to Staff</p>
                            {staff?.map(staffMember => (
                              <div 
                                key={staffMember.id}
                                className="flex items-center px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground rounded-sm cursor-pointer"
                                onClick={() => assignClientMutation.mutate({ clientId: client.id, staffId: staffMember.id })}
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
                              onClick={() => returnData && handleStatusChange(client, month, 'gstr1')}
                            />
                          </div>
                          <div className="flex items-center gap-2 w-full justify-between px-2">
                            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider w-8 text-left">3B</span>
                            <StatusBadge 
                              status={returnData?.gstr3b || 'Pending'} 
                              canEdit={true}
                              onClick={() => returnData && handleStatusChange(client, month, 'gstr3b')}
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
                  <TableCell colSpan={isAdmin ? months.length + 2 : months.length + 1} className="text-center py-8">
                    <p className="text-sm text-muted-foreground">No clients found</p>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
