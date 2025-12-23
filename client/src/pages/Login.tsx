import { queryClient } from "@/lib/queryClient";
import { useState } from "react";
import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import logoUrl from "@assets/generated_images/minimalist_logo_for_an_accounting_app.png";
import { Loader2 } from "lucide-react";

// --- STEP 1: FIREBASE IMPORTS ---
// We import the 'auth' instance we created in our firebase.ts file
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase"; 

export default function Login() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();

  // --- STEP 2: STATE MANAGEMENT ---
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showOtpField, setShowOtpField] = useState(false);
  const [otp, setOtp] = useState("");
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);

  // Forms for traditional email/password login
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "staff" as "staff" | "admin",
    adminEmail: "",
  });

  // If user is already logged in, send them to the dashboard immediately
  if (user) {
    return <Redirect to="/dashboard" />;
  }

  // --- STEP 3: GOOGLE AUTH LOGIC ---
  const handleGoogleAuth = async (mode: "login" | "register") => {
  setIsGoogleLoading(true);
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const { email, displayName } = result.user;

    if (mode === "register") {
      setRegisterForm((prev) => ({
        ...prev,
        email: email || "",
        name: displayName || "",
        password: "", 
      }));
      alert("Google details verified! Please set a password and role below.");
    } else {
      // --- LOGIN MODE LOGIC ---
      // We send the email to your existing login backend.
      // Note: This requires a "dummy" password or a backend update to allow Google-only login.
      // For now, let's use the loginMutation with the verified email.
      loginMutation.mutate(
        { 
          email: email || "", 
          password: "GOOGLE_AUTH_USER" // We will need to adjust the backend to recognize this
        },
        {
          onSuccess: () => {
            setLocation("/dashboard");
          },
          onError: (error: any) => {
            alert("Login failed. Have you registered this account yet?");
          }
        }
      );
    }
  } catch (error: any) {
    console.error("Google Auth Error:", error.message);
  } finally {
    setIsGoogleLoading(false);
  }
};

  // --- STEP 4: ADMIN VERIFICATION & OTP LOGIC ---
  const handleVerifyAdmin = async () => {
  if (!registerForm.adminEmail) return alert("Please enter Admin Email");
  
  setIsVerifyingAdmin(true);
  try {
    // 1. We actually hit the endpoint we created in routes.ts
    const response = await fetch("/api/verify-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminEmail: registerForm.adminEmail }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData || "Admin not found");
    }

    // 2. If successful, show the OTP input
    setShowOtpField(true);
    alert("OTP generated! Check your Server Terminal (and soon your Email).");
  } catch (err: any) {
    alert(err.message || "Admin verification failed.");
  } finally {
    setIsVerifyingAdmin(false);
  }
};

  // --- STEP 5: FORM SUBMISSION HANDLERS ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginForm, {
      onSuccess: () => {
        queryClient.removeQueries({ queryKey: ["/api/clients"] });
        setLocation("/dashboard");
      },
    });
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    // If they are staff, they MUST have the OTP
    if (registerForm.role === "staff" && !otp) return alert("OTP Required");

    registerMutation.mutate({ ...registerForm, otp }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        setLocation("/dashboard");
      },
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      {/* Background Styling */}
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50 pointer-events-none" />

      <Card className="w-full max-w-md shadow-xl relative z-10">
        <CardHeader className="text-center">
          <img src={logoUrl} alt="Logo" className="h-12 w-12 mx-auto mb-4" />
          <CardTitle className="text-2xl">GST Pro</CardTitle>
          <CardDescription>Practice Management System</CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>

            {/* --- LOGIN TAB --- */}
            <TabsContent value="login" className="space-y-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    type="email" 
                    required 
                    value={loginForm.email}
                    onChange={(e) => setLoginForm({...loginForm, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input 
                    type="password" 
                    required 
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({...loginForm, password: e.target.value})}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
              
              <div className="relative my-4 text-center text-xs uppercase text-muted-foreground">
                <span className="bg-background px-2 relative z-10">Or login with</span>
                <hr className="absolute top-1/2 w-full border-t" />
              </div>

              <Button variant="outline" className="w-full" onClick={() => handleGoogleAuth("login")}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="mr-2 h-4 w-4" />
                Google
              </Button>
            </TabsContent>

            {/* --- REGISTER TAB --- */}
            <TabsContent value="register" className="space-y-4">
              <Button variant="outline" className="w-full" onClick={() => handleGoogleAuth("register")}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="mr-2 h-4 w-4" />
                Quick-fill with Google
              </Button>

              <form onSubmit={handleRegister} className="space-y-4 mt-4">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input 
                    required 
                    value={registerForm.name} 
                    onChange={(e) => setRegisterForm({...registerForm, name: e.target.value})}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    type="email" 
                    required 
                    value={registerForm.email}
                    onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
  <Label>Create Password</Label>
  <Input 
    type="password" 
    required 
    placeholder="Minimum 8 characters"
    value={registerForm.password}
    onChange={(e) => setRegisterForm({...registerForm, password: e.target.value})}
  />
</div>

                <div className="space-y-2">
                  <Label>Role</Label>
                  <select 
                    className="w-full p-2 border rounded-md bg-background text-sm"
                    value={registerForm.role}
                    onChange={(e) => setRegisterForm({...registerForm, role: e.target.value as any})}
                  >
                    <option value="staff">Staff Member</option>
                    <option value="admin">Admin / Manager</option>
                  </select>
                </div>

                {/* Staff-Specific Logic: Admin Email + OTP */}
                {registerForm.role === "staff" && (
                  <div className="p-3 border rounded-lg bg-muted/50 space-y-3">
                    <Label className="text-xs uppercase font-bold text-muted-foreground">Manager Verification</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="Admin Email" 
                        value={registerForm.adminEmail}
                        onChange={(e) => setRegisterForm({...registerForm, adminEmail: e.target.value})}
                      />
                      {!showOtpField && (
                        <Button type="button" size="sm" onClick={handleVerifyAdmin} disabled={isVerifyingAdmin}>
                          {isVerifyingAdmin ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                        </Button>
                      )}
                    </div>

                    {showOtpField && (
                      <Input 
                        placeholder="Enter 6-digit OTP" 
                        className="border-primary"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value)}
                      />
                    )}
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={registerMutation.isPending || (registerForm.role === "staff" && !showOtpField)}
                >
                  Create Account
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}