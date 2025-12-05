import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { CheckCircle2, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import type { Client, GstReturn } from '@shared/schema';

type ClientWithReturns = Client & { returns: GstReturn[] };

export default function Dashboard() {
  const { user } = useAuth();
  const { data: clients, isLoading } = useQuery<ClientWithReturns[]>({
    queryKey: ['/api/clients'],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const myClients = clients || [];
  const currentMonth = new Date().toISOString().slice(0, 7);
  
  const stats = myClients.reduce((acc, client) => {
    const returns = client.returns.find(r => r.month === currentMonth);
    if (!returns) return acc;

    if (returns.gstr1 === 'Filed') acc.filed++;
    else if (returns.gstr1 === 'Late') acc.late++;
    else acc.pending++;

    if (returns.gstr3b === 'Filed') acc.filed++;
    else if (returns.gstr3b === 'Late') acc.late++;
    else acc.pending++;

    return acc;
  }, { filed: 0, pending: 0, late: 0 });

  const data = [
    { name: 'Filed', value: stats.filed, color: 'hsl(142, 76%, 36%)' },
    { name: 'Pending', value: stats.pending, color: 'hsl(215, 16%, 47%)' },
    { name: 'Late', value: stats.late, color: 'hsl(0, 84%, 60%)' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2 bg-primary/5 px-3 py-1 rounded-full text-sm font-medium text-primary">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          Live Updates
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-l-4 border-l-green-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Filed Returns</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-filed">{stats.filed}</div>
            <p className="text-xs text-muted-foreground mt-1">Successfully submitted</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pending">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">Action required</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500 shadow-sm hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overdue/Late</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-late">{stats.late}</div>
            <p className="text-xs text-muted-foreground mt-1">Late fees applicable</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Compliance Status</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {myClients.slice(0, 4).map(client => (
                <div key={client.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg" data-testid={`activity-${client.id}`}>
                  <div className="space-y-1">
                    <p className="text-sm font-medium leading-none">{client.name}</p>
                    <p className="text-xs text-muted-foreground">GSTIN: {client.gstin}</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-background px-2 py-1 rounded border">
                    {client.returns.length} returns
                  </div>
                </div>
              ))}
              {myClients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">No clients assigned yet</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
