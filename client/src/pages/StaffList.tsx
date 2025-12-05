import { useStore } from '@/lib/mockData';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Users, Briefcase } from 'lucide-react';

export default function StaffList() {
  const { users, clients } = useStore();

  // Get only staff members
  const staffMembers = users.filter(u => u.role === 'staff');

  const getClientCount = (staffId: string) => {
    return clients.filter(c => c.assignedToId === staffId).length;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Staff Management</h1>
        <p className="text-muted-foreground">Overview of staff members and their workload</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {staffMembers.map(staff => (
          <Card key={staff.id} className="hover:border-primary/50 transition-colors group">
            <CardHeader className="flex flex-row items-center gap-4 pb-2">
              <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                <AvatarImage src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.name}`} />
                <AvatarFallback>{staff.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <CardTitle className="text-lg">{staff.name}</CardTitle>
                <CardDescription>{staff.email}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mt-4 flex items-center justify-between p-3 bg-muted/50 rounded-lg group-hover:bg-primary/5 transition-colors">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground group-hover:text-primary">
                  <Briefcase className="h-4 w-4" />
                  Assigned Clients
                </div>
                <Badge variant="secondary" className="text-lg px-3 py-1">
                  {getClientCount(staff.id)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
        
        <Card className="border-dashed border-2 flex flex-col items-center justify-center p-6 hover:bg-accent/50 hover:border-primary/50 transition-all cursor-not-allowed opacity-60">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
            <Users className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-muted-foreground">Add New Staff</h3>
          <p className="text-xs text-muted-foreground mt-1">Contact system admin</p>
        </Card>
      </div>
    </div>
  );
}
