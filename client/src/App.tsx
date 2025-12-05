import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ClientList from "@/pages/ClientList";
import StaffList from "@/pages/StaffList";
import { Layout } from "@/components/layout/Layout";
import { useStore } from "@/lib/mockData";
import { useEffect } from "react";

function ProtectedRoute({ component: Component, adminOnly = false }: { component: any, adminOnly?: boolean }) {
  const { currentUser } = useStore();
  
  if (!currentUser) {
    return <Redirect to="/login" />;
  }

  if (adminOnly && currentUser.role !== 'admin') {
    return <Redirect to="/dashboard" />;
  }

  return <Component />;
}

function Router() {
  const { currentUser } = useStore();

  return (
    <Layout>
      <Switch>
        <Route path="/login">
          {currentUser ? <Redirect to="/dashboard" /> : <Login />}
        </Route>
        
        <Route path="/dashboard">
          <ProtectedRoute component={Dashboard} />
        </Route>
        
        <Route path="/clients">
          <ProtectedRoute component={ClientList} />
        </Route>
        
        <Route path="/staff">
          <ProtectedRoute component={StaffList} adminOnly />
        </Route>

        <Route path="/">
          {currentUser ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}
        </Route>

        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
