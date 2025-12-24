import { queryClient } from "@/lib/queryClient";
import { useState, useEffect } from "react";
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
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { FcGoogle } from "react-icons/fc";
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
    otp: "",
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

  const [timer, setTimer] = useState(0);
const [regOtpSent, setRegOtpSent] = useState(false);

// Timer effect for the 'Resend' button
useEffect(() => {
  let interval: any;
  if (timer > 0) {
    interval = setInterval(() => setTimer((t) => t - 1), 1000);
  }
  return () => clearInterval(interval);
}, [timer]);

const handleSendOtp = async () => {
  if (!registerForm.email) return alert("Please enter your email");
  try {
    const res = await fetch("/api/send-registration-otp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: registerForm.email }),
    });
    if (!res.ok) throw new Error(await res.text());
    setRegOtpSent(true);
    setTimer(120); // Start 2-minute countdown
    alert("OTP sent to your email!");
  } catch (err: any) {
    alert(err.message);
  }
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
            <TabsContent value="register" className="space-y-4 pt-4">
  <Button
    variant="outline"
    className="w-full flex items-center justify-center gap-2"
    onClick={() => handleGoogleAuth("register")}
    disabled={isGoogleLoading}
  >
    <FcGoogle className="h-5 w-5" />
    Quick-fill with Google
  </Button>

  <div className="space-y-2">
    <Label>Full Name</Label>
    <Input 
      placeholder="John Doe" 
      value={registerForm.name}
      onChange={(e) => setRegisterForm({...registerForm, name: e.target.value})}
    />
  </div>

  <div className="space-y-2">
    <Label>Email</Label>
    <Input 
      type="email" 
      placeholder="name@example.com" 
      value={registerForm.email}
      onChange={(e) => setRegisterForm({...registerForm, email: e.target.value})}
    />
  </div>

  <div className="space-y-2">
    <Label>Create Password</Label>
    <Input 
      type="password" 
      placeholder="Minimum 8 characters"
      value={registerForm.password}
      onChange={(e) => setRegisterForm({...registerForm, password: e.target.value})}
    />
  </div>

  <div className="space-y-2">
    <Label>Role</Label>
    <Select 
      value={registerForm.role} 
      onValueChange={(v: any) => setRegisterForm({...registerForm, role: v})}
    >
      <SelectTrigger>
        <SelectValue placeholder="Select role" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">Admin / Manager</SelectItem>
        <SelectItem value="staff">Staff Member</SelectItem>
      </SelectContent>
    </Select>
  </div>

  {/* --- NEW: ADMIN EMAIL VERIFICATION --- */}
  {registerForm.role === 'admin' && (
    <div className="space-y-2 border-2 border-blue-100 bg-blue-50 rounded-md p-3">
      <Label className="text-blue-700">Verify Your Admin Email</Label>
      <div className="flex gap-2">
        <Input 
          placeholder="6-digit OTP" 
          value={registerForm.otp} 
          onChange={(e) => setRegisterForm({...registerForm, otp: e.target.value})}
        />
        <Button 
          type="button" 
          variant="outline" 
          size="sm"
          onClick={handleSendOtp} // The function we created for Admin OTP
          disabled={timer > 0}
        >
          {timer > 0 ? `${Math.floor(timer/60)}:${(timer%60).toString().padStart(2,'0')}` : "Send OTP"}
        </Button>
      </div>
      {timer > 0 && <p className="text-xs text-blue-600">Resend available after timer ends.</p>}
    </div>
  )}

  {/* --- STAFF VERIFICATION --- */}
  {registerForm.role === 'staff' && (
    <div className="space-y-2 border-2 border-orange-100 bg-orange-50 rounded-md p-3">
      <Label className="text-orange-700">Manager's Email (for OTP)</Label>
      <div className="flex gap-2">
        <Input 
          placeholder="admin@example.com" 
          value={registerForm.adminEmail}
          onChange={(e) => setRegisterForm({...registerForm, adminEmail: e.target.value})}
        />
        <Button type="button" variant="outline" size="sm" onClick={handleVerifyAdmin}>
          Get OTP
        </Button>
      </div>
      {showOtpField && (
        <Input 
          className="mt-2"
          placeholder="Enter OTP from Admin" 
          value={registerForm.otp}
          onChange={(e) => setRegisterForm({...registerForm, otp: e.target.value})}
        />
      )}
    </div>
  )}

  <Button 
    className="w-full mt-4" 
    onClick={() => registerMutation.mutate(registerForm)}
    disabled={registerMutation.isPending}
  >
    {registerMutation.isPending ? "Creating Account..." : "Create Account"}
  </Button>
</TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}