import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Briefcase, Loader2 } from 'lucide-react';
import type { User, Client, GstReturn } from '@shared/schema';

type ClientWithReturns = Client & { returns: GstReturn[] };

export default function StaffList() {
  const { data: staff, isLoading: staffLoading } = useQuery<User[]>({
    queryKey: ['/api/users/staff'],
  });

  const { data: clients } = useQuery<ClientWithReturns[]>({
    queryKey: ['/api/clients'],
  });

  const getClientCount = (staffId: string) => {
    return (clients || []).filter(c => c.assignedToId === staffId).length;
  };

  if (staffLoading) {
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
        <p className="text-muted-foreground">Overview of staff members and their workload</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {staffMembers.map(staffMember => (
          <Card key={staffMember.id} className="hover:border-primary/50 transition-colors group" data-testid={`card-staff-${staffMember.id}`}>
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                <AvatarFallback>{staffMember.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{staffMember.name}</CardTitle>
                <CardDescription>{staffMember.email}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mt-4 flex items-center justify-between p-3 bg-muted/50 rounded-lg group-hover:bg-primary/5 transition-colors">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-primary">
                  <Briefcase className="h-4 w-4" />
                  Assigned Clients
                </div>
                <Badge variant="secondary" className="text-lg px-3 py-1" data-testid={`badge-count-${staffMember.id}`}>
                  {getClientCount(staffMember.id)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        
        {staffMembers.length === 0 && (
          <Card className="border-dashed border-2 flex flex-col items-center justify-center p-6">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
              <Users className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-muted-foreground">No Staff Members</h3>
            <p className="text-xs text-muted-foreground mt-1">Register staff users to get started</p>
          </Card>
        )}
      </div>
    </div>
  );
}
