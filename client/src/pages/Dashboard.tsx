import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { CheckCircle2, Clock, AlertTriangle, Loader2, TrendingUp, Users, FileText, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Client, GstReturn, User } from '@shared/schema';

type ClientWithReturns = Client & { returns: GstReturn[] };

function getFinancialYear(): string {
  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();
  if (month < 3) {
    return `FY ${year - 1}-${String(year).slice(2)}`;
  }
  return `FY ${year}-${String(year + 1).slice(2)}`;
}

function getDaysUntilDeadline(returnType: 'gstr1' | 'gstr3b'): number {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();
  const dueDay = returnType === 'gstr1' ? 11 : 20;

  let dueDate = new Date(currentYear, currentMonth, dueDay);
  if (today > dueDate) {
    dueDate = new Date(currentYear, currentMonth + 1, dueDay);
  }

  const diffTime = dueDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  const { user } = useAuth();

  const { data: clients, isLoading } = useQuery<ClientWithReturns[]>({
    queryKey: ['/api/clients'],
  });

  const { data: staffList } = useQuery<User[]>({
  queryKey: ['/api/users', user?.id], // This ensures a fresh fetch for every user
  enabled: !!user && user.role === 'admin',
});

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const myClients = clients || [];
  const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const targetReturnMonth = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  const stats = myClients.reduce((acc, client) => {
    const returns = client.returns.find(r => r.month === targetReturnMonth);

    // Check GSTR-1
    const g1 = returns?.gstr1 || 'Pending';
    if (g1 === 'Filed') acc.filed++;
    else if (g1 === 'Late') acc.late++;
    else acc.pending++;

    // Check GSTR-3B
    const g3b = returns?.gstr3b || 'Pending';
    if (g3b === 'Filed') acc.filed++;
    else if (g3b === 'Late') acc.late++;
    else acc.pending++;

    return acc;
  }, { filed: 0, pending: 0, late: 0 });

  const totalReturns = stats.filed + stats.pending + stats.late;
  const complianceRate = totalReturns > 0 ? Math.round((stats.filed / totalReturns) * 100) : 0;

  const pieData = [
    { name: 'Filed', value: stats.filed, color: '#22c55e' },
    { name: 'Pending', value: stats.pending, color: '#f59e0b' },
    { name: 'Late', value: stats.late, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const staffWorkload = user?.role === 'admin' && staffList ? staffList.map(staff => {
    const staffClients = myClients.filter(c => c.assignedToId === staff.id);
    const pendingCount = staffClients.reduce((acc, client) => {
      const ret = client.returns.find(r => r.month === targetReturnMonth);
      if (!ret) return acc + 2;
      if (ret.gstr1 !== 'Filed') acc++;
      if (ret.gstr3b !== 'Filed') acc++;
      return acc;
    }, 0);
    return {
      name: staff.name.split(' ')[0],
      clients: staffClients.length,
      pending: pendingCount,
    };
  }) : [];

  const daysToGSTR1 = getDaysUntilDeadline('gstr1');
  const daysToGSTR3B = getDaysUntilDeadline('gstr3b');

  const urgentClients = myClients.filter(client => {
    const ret = client.returns.find(r => r.month === targetReturnMonth);
    // If it's not filed, it needs attention
    return ret?.gstr1 !== 'Filed' || ret?.gstr3b !== 'Filed';
  }).slice(0, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            {getFinancialYear()} • Returns for {new Date(targetReturnMonth + "-01").toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Badge variant="outline" className="text-sm px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse mr-2" />
          {myClients.length} Active Clients
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Filed Returns</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-filed">{stats.filed}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {complianceRate}% compliance rate
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-pending">{stats.pending}</div>
            <p className="text-xs text-muted-foreground mt-1">Action required</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-red-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Late/Overdue</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-late">{stats.late}</div>
            <p className="text-xs text-muted-foreground mt-1">Late fees applicable</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myClients.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {user?.role === 'admin' ? 'Firm-wide' : 'Assigned to you'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Upcoming Deadlines</CardTitle>
                <CardDescription>Days remaining until filing due</CardDescription>
              </div>
              <CalendarClock className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-semibold">GSTR-1</p>
                  <p className="text-sm text-muted-foreground">Sales return for {new Date().toLocaleDateString('en-IN', { month: 'short' })}</p>
                </div>
                <div className={`text-right ${daysToGSTR1 <= 3 ? 'text-red-500' : daysToGSTR1 <= 7 ? 'text-amber-500' : 'text-green-500'}`}>
                  <p className="text-2xl font-bold">{daysToGSTR1}</p>
                  <p className="text-xs">days left</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-semibold">GSTR-3B</p>
                  <p className="text-sm text-muted-foreground">Summary return for {new Date().toLocaleDateString('en-IN', { month: 'short' })}</p>
                </div>
                <div className={`text-right ${daysToGSTR3B <= 3 ? 'text-red-500' : daysToGSTR3B <= 7 ? 'text-amber-500' : 'text-green-500'}`}>
                  <p className="text-2xl font-bold">{daysToGSTR3B}</p>
                  <p className="text-xs">days left</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Compliance Status</CardTitle>
            <CardDescription>Current month filing overview</CardDescription>
          </CardHeader>
          <CardContent className="h-[200px]">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={5}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                No return data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {user?.role === 'admin' && staffWorkload.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Staff Workload</CardTitle>
              <CardDescription>Clients and pending returns per staff</CardDescription>
            </CardHeader>
            <CardContent className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={staffWorkload} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={80} />
                  <Tooltip />
                  <Bar dataKey="clients" name="Clients" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="hsl(43, 74%, 66%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <Card className={user?.role !== 'admin' ? 'md:col-span-2' : ''}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Needs Attention</CardTitle>
                <CardDescription>Clients with pending or overdue returns</CardDescription>
              </div>
              <FileText className="h-5 w-5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {urgentClients.map(client => {
                const ret = client.returns.find(r => r.month === currentMonth);
                const gstr1Status = ret?.gstr1 || 'Pending';
                const gstr3bStatus = ret?.gstr3b || 'Pending';
                return (
                  <div key={client.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors" data-testid={`urgent-${client.id}`}>
                    <div className="space-y-1 flex-1">
                      <p className="text-sm font-medium leading-none">{client.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{client.gstin}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={gstr1Status === 'Filed' ? 'default' : gstr1Status === 'Late' ? 'destructive' : 'secondary'} className="text-[10px]">
                        R1: {gstr1Status}
                      </Badge>
                      <Badge variant={gstr3bStatus === 'Filed' ? 'default' : gstr3bStatus === 'Late' ? 'destructive' : 'secondary'} className="text-[10px]">
                        3B: {gstr3bStatus}
                      </Badge>
                    </div>
                  </div>
                );
              })}
              {urgentClients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
                  <p className="text-sm font-medium text-green-600">All caught up!</p>
                  <p className="text-xs text-muted-foreground">No pending returns this month</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
