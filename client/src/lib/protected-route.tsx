import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

type Props = {
  path: string;
  component?: React.ComponentType<any>;
  children?: React.ReactNode; // Add this line to allow tags inside
  adminOnly?: boolean;
};

export function ProtectedRoute({ path, component: Component, children, adminOnly }: Props) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <Route path={path}>
        <div className="flex items-center justify-center min-h-screen">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Route>
    );
  }

  if (!user || (adminOnly && user.role !== 'admin')) {
    return (
      <Route path={path}>
        <Redirect to="/auth" />
      </Route>
    );
  }

  return (
    <Route path={path}>
      {/* This checks if we passed a component prop OR children */}
      {Component ? <Component /> : children}
    </Route>
  );
}