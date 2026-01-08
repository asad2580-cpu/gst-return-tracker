import { Loader2 } from "lucide-react";
import React, { Suspense, lazy } from "react"; 
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { ProtectedRoute } from "@/lib/protected-route";
import { Layout } from "@/components/layout/Layout";


// --- LAZY LOADED PAGES ---
// This splits your code into smaller files automatically
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ClientList = lazy(() => import("@/pages/ClientList"));
const StaffList = lazy(() => import("@/pages/StaffList"));
const StaffClientList = lazy(() => import("@/pages/StaffClientList"));
const HistoryPage = lazy(() => import("@/pages/History"));
const Login = lazy(() => import("@/pages/Login"));
const NotFound = lazy(() => import("@/pages/not-found"));

function Router() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <p className="text-sm font-medium text-muted-foreground animate-pulse">
          Verifying secure session...
        </p>
      </div>
    );
  }

  // --- LOGGED OUT BLOCK ---
  if (!user) {
    return (
      <Switch>
        <Route path="/auth" component={Login} />
        <Route>
          <Redirect to="/auth" />
        </Route>
      </Switch>
    );
  }

  // --- AUTHENTICATED BLOCK ---
  return (
    <Layout>
      <Suspense fallback={
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary opacity-50" />
        </div>
      }>
        <Switch>
          {/* SURGERY START: If a logged-in user hits /auth, send them to dashboard */}
          <Route path="/auth">
            <Redirect to="/dashboard" />
          </Route>
          {/* SURGERY END */}

          <ProtectedRoute path="/dashboard">
            <Dashboard />
          </ProtectedRoute>

          <ProtectedRoute path="/clients">
            <ClientList />
          </ProtectedRoute>

          <ProtectedRoute path="/staff">
             <StaffList />
          </ProtectedRoute>

          <ProtectedRoute path="/staff/:staffId/clients">
             <StaffClientList />
          </ProtectedRoute>

          <ProtectedRoute path="/history">
            {user.role === 'admin' ? <HistoryPage /> : <Redirect to="/" />}
          </ProtectedRoute>
          
          <Route path="/">
            <Redirect to="/dashboard" />
          </Route>
          
          <Route component={NotFound} />
        </Switch>
      </Suspense>
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