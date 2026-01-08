import React from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Users, FileText, LogOut, Menu, History, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import logoUrl from "@assets/generated_images/minimalist_logo_for_an_accounting_app.png";

// client/src/components/layout/Layout.tsx

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { user, logoutMutation, isLoading } = useAuth(); // Added isLoading
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  // 1. If we are still fetching the user, or if there is no user, 
  // just render the content (which, thanks to our App.tsx, will be the Loader or Login)
  if (isLoading || !user) {
    return <>{children}</>;
  }

  const navItems = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/clients", label: "Client Returns", icon: FileText },
    ...(user.role === "admin"
      ? [
          { href: "/staff", label: "Staff Management", icon: Users },
          { href: "/history", label: "Audit History", icon: History }
        ]
      : []),
  ];

  // SURGERY: Improved fallbacks to prevent "Unknown" flicker
  const displayName = user.name || user.email?.split('@')[0] || "User";
  const userInitial = (user.name || user.email || "?").charAt(0).toUpperCase();

  const Sidebar = () => (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* ... (Logo section remains the same) ... */}
      <div className="p-6 flex items-center gap-3">
         <img src={logoUrl} alt="FileDX" className="h-8 w-8 rounded-sm bg-white/10 p-1" />
         <span className="font-display font-bold text-xl tracking-tight">FileDX</span>
      </div>

      <div className="flex-1 px-4 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link key={item.href} href={item.href}>
              <div className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-all cursor-pointer
                  ${isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm" : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"}
                `}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </div>
            </Link>
          );
        })}
      </div>

      <div className="p-4 mt-auto border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-bold ring-2 ring-primary/10">
            {userInitial}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold truncate">
              {displayName}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40">
              {user.role}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-destructive hover:bg-destructive/10"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending} // Disable button while logging out
        >
          {logoutMutation.isPending ? (
             <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
             <LogOut className="mr-2 h-4 w-4" />
          )}
          Sign Out
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      {/* ... (Rest of the JSX remains the same) ... */}
      <aside className="hidden md:block w-64 fixed inset-y-0 z-50">
        <Sidebar />
      </aside>
      <main className="flex-1 md:ml-64 p-4 md:p-8 overflow-auto w-full">
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-500 slide-in-from-bottom-4">
          {children}
        </div>
      </main>
    </div>
  );
}
