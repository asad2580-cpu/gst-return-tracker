import StaffClientList from "@/pages/StaffClientList";
import { Switch, Route, Redirect } from "wouter";
import HistoryPage from "@/pages/History";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ClientList from "@/pages/ClientList";
import StaffList from "@/pages/StaffList";
import { Layout } from "@/components/layout/Layout";


function Router() {
  const { user } = useAuth();
  return (
    <Layout>
      <Switch>
        <ProtectedRoute 
  path="/history" 
  component={() => {
    // Basic Admin Guard
    if (user?.role !== 'admin') return <Redirect to="/" />;
    return <HistoryPage />;
  }} 
/>
        <Route path="/login" component={Login} />
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/clients" component={ClientList} />
        <ProtectedRoute path="/staff" component={StaffList} adminOnly />
        <ProtectedRoute path="/staff/:staffId/clients" component={StaffClientList} adminOnly />
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
