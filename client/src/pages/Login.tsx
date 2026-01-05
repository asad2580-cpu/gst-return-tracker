import { queryClient } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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

// --- FIREBASE IMPORTS ---
import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "../firebase";

export default function Login() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();

  // --- PASSWORD RESET STATES ---
  const [isResetMode, setIsResetMode] = useState(false);
  const [resetStep, setResetStep] = useState(1); // 1: Email, 2: OTP + New Pass
  const [resetEmail, setResetEmail] = useState("");
  const [resetOtp, setResetOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState("");

  // --- STATE MANAGEMENT ---
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [isSelfVerified, setIsSelfVerified] = useState(false);
  const [isAdminVerified, setIsAdminVerified] = useState(false);

  // Forms for traditional email/password login
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });

  const [registerForm, setRegisterForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "admin" as "admin" | "staff",
    adminEmail: "",
    otp: "",      // Self Identity OTP
    adminOtp: "", // Admin Authorization OTP
  });

  // Separate Timer States
  const [selfTimer, setSelfTimer] = useState(0);
  const [adminTimer, setAdminTimer] = useState(0);

  // The Timer Engine (Ticks every second)
  useEffect(() => {
    const interval = setInterval(() => {
      setSelfTimer((prev) => (prev > 0 ? prev - 1 : 0));
      setAdminTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Helper to format 75s -> "1:15"
  const formatTime = (seconds: number) => {
    if (seconds <= 0) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  if (user) {
    return <Redirect to="/dashboard" />;
  }
  // --- PASSWORD RESET HANDLERS ---
  const handleRequestReset = async () => {
    if (!resetEmail) return toast({ title: "Email Required", variant: "destructive" });
    setResetLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot-password", { email: resetEmail });
      toast({ title: "Code Sent", description: "Check your email for the reset code." });
      setResetStep(2);
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  const handleFinalReset = async () => {
    if (newPassword.length < 8) return toast({ title: "Password too short", variant: "destructive" });
    setResetLoading(true);
    try {
      await apiRequest("POST", "/api/auth/reset-password", {
        email: resetEmail,
        otp: resetOtp,
        newPassword
      });
      toast({ title: "Success", description: "Password updated! You can now login." });
      setIsResetMode(false);
      setResetStep(1);
    } catch (error: any) {
      toast({ title: "Invalid Code", description: error.message, variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  // --- LOGIC FUNCTIONS ---

  const sendOtp = async (targetEmail: string, type: 'identity' | 'authorization') => {
    try {
      const res = await fetch("/api/otp/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail, type }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.retryAfter) {
          if (type === 'identity') setSelfTimer(data.retryAfter);
          else setAdminTimer(data.retryAfter);
        }
        throw new Error(data.error || "Failed to send OTP");
      }

      if (type === 'identity') setSelfTimer(data.nextRetryIn);
      else setAdminTimer(data.nextRetryIn);

      toast({ title: "OTP Sent", description: `Check ${targetEmail} for your code.` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const verifyOtp = async (email: string, otp: string, type: 'identity' | 'authorization') => {
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, type }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");

      toast({ title: "Success", description: "Code verified!" });
      if (type === 'identity') setIsSelfVerified(true);
      else setIsAdminVerified(true);
    } catch (error: any) {
      toast({ title: "Invalid Code", description: error.message, variant: "destructive" });
    }
  };

  const handleGoogleAuth = async (mode: "login" | "register") => {
  setIsGoogleLoading(true);
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const fbUser = result.user;

    const response = await fetch("/api/auth/google-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fbUser.email,
        name: fbUser.displayName,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // Logic for new users
      if (data.error === "USER_NOT_FOUND") {
        toast({ 
          title: "Account Not Found", 
          description: "We've filled in your details. Please complete the registration (OTP verification) to continue." 
        });
        
        // Populate the registration form with Google data
        setRegisterForm(prev => ({
          ...prev,
          name: fbUser.displayName || "",
          email: fbUser.email || ""
        }));
        
        // Switch to register tab automatically
        // Assuming you have a state for the active tab, e.g., setTab("register")
        return; 
      }
      throw new Error(data.error || "Login failed");
    }

    // Existing user -> Success
    localStorage.setItem("accessToken", data.accessToken);
    queryClient.setQueryData(["/api/auth/me"], data.user);
    toast({ title: "Welcome back!", description: `Logged in as ${data.user.name}` });
    setLocation("/dashboard");

  } catch (error: any) {
    toast({ title: "Google Auth Failed", description: error.message, variant: "destructive" });
  } finally {
    setIsGoogleLoading(false);
  }
};

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

    // 1. Validation: Ensure we don't even try if the UI hasn't been verified
    if (!isSelfVerified) {
      return toast({ title: "Verify Email", description: "Please verify your own OTP first.", variant: "destructive" });
    }
    if (registerForm.role === 'staff' && !isAdminVerified) {
      return toast({ title: "Admin Auth Required", description: "Please get authorization from your manager.", variant: "destructive" });
    }

    // 2. Explicitly pass all fields to the mutation
    registerMutation.mutate({
      name: registerForm.name,
      email: registerForm.email,
      password: registerForm.password,
      role: registerForm.role,
      otp: registerForm.otp,           // Ensure this is in your state
      adminEmail: registerForm.adminEmail,
      adminOtp: registerForm.adminOtp  // Ensure this is in your state
    }, {
      onSuccess: () => {
        // This invalidates the staff list so they show up immediately
        queryClient.invalidateQueries({ queryKey: ["/api/users"] });
        toast({ title: "Account Created", description: "Welcome to FileDX!" });
        setLocation("/dashboard");
      },
      onError: (error: any) => {
        toast({ title: "Registration Failed", description: error.message, variant: "destructive" });
      }
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-50 pointer-events-none" />

      <Card className="w-full max-w-md shadow-xl relative z-10">
        <CardHeader className="text-center">
          <img src={logoUrl} alt="Logo" className="h-12 w-12 mx-auto mb-4" />
          <CardTitle className="text-2xl">FileDX</CardTitle>
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
              {!isResetMode ? (
                <>
                  {/* 1. STANDARD LOGIN FORM */}
                  <form onSubmit={handleLogin} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input
                        type="email"
                        required
                        value={loginForm.email}
                        onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                        placeholder="h94952977@gmail.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <Label>Password</Label>
                        <Button
                          variant="link"
                          className="p-0 h-auto text-xs"
                          type="button"
                          onClick={() => setIsResetMode(true)}
                        >
                          Forgot Password?
                        </Button>
                      </div>
                      <Input
                        type="password"
                        required
                        value={loginForm.password}
                        onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                      {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Sign In
                    </Button>
                  </form>

                  {/* 2. GOOGLE LOGIN SECTION (Only shows on the main login screen) */}
                  <div className="relative my-4 text-center text-xs uppercase text-muted-foreground">
                    <span className="bg-background px-2 relative z-10">Or login with</span>
                    <hr className="absolute top-1/2 w-full border-t" />
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => handleGoogleAuth("login")}
                    disabled={isGoogleLoading}
                  >
                    {isGoogleLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FcGoogle className="mr-2 h-5 w-5" />
                    )}
                    Continue with Google
                  </Button>
                </>
              ) : (
                /* 3. FORGOT PASSWORD FLOW */
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2">
                  <div className="space-y-1">
                    <CardTitle className="text-lg">Reset Password</CardTitle>
                    <CardDescription>
                      {resetStep === 1
                        ? "Enter your email to receive a reset code."
                        : "Enter the code and choose a new password."}
                    </CardDescription>
                  </div>

                  {resetStep === 1 ? (
                    /* STEP 1: Email Request */
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Registered Email</Label>
                        <Input
                          type="email"
                          placeholder="name@example.com"
                          value={resetEmail}
                          onChange={(e) => setResetEmail(e.target.value)}
                        />
                      </div>
                      <Button className="w-full" onClick={handleRequestReset} disabled={resetLoading}>
                        {resetLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Send Reset Code
                      </Button>
                    </div>
                  ) : (
                    /* STEP 2: OTP + New Password + History Check */
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>6-Digit Code</Label>
                        <Input
                          placeholder="000000"
                          maxLength={6}
                          value={resetOtp}
                          onChange={(e) => setResetOtp(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>New Password</Label>
                        <Input
                          type="password"
                          placeholder="Must not be in your last 5"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Confirm New Password</Label>
                        <Input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className={confirmPassword && newPassword !== confirmPassword ? "border-red-500" : ""}
                        />
                        {confirmPassword && newPassword !== confirmPassword && (
                          <p className="text-xs text-red-500 font-medium">Passwords do not match</p>
                        )}
                      </div>

                      <Button
                        className="w-full"
                        onClick={handleFinalReset}
                        disabled={resetLoading || !newPassword || newPassword !== confirmPassword || resetOtp.length !== 6}
                      >
                        {resetLoading ? <Loader2 className="animate-spin mr-2 h-4 w-4" /> : null}
                        Update Password
                      </Button>
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    className="w-full text-xs"
                    onClick={() => { setIsResetMode(false); setResetStep(1); }}
                  >
                    Back to Login
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* --- REGISTER TAB --- */}
            <TabsContent value="register" className="space-y-4 pt-2">
              {/* <Button
                variant="outline"
                className="w-full flex items-center justify-center gap-2 mb-2"
                onClick={() => handleGoogleAuth("register")}
                disabled={isGoogleLoading}
              >
                <FcGoogle className="h-5 w-5" />
                Quick Fill with Google
              </Button> */}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Full Name</Label>
                  <Input
                    placeholder="Dheeraj Yadav"
                    value={registerForm.name}
                    onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select
                    value={registerForm.role}
                    onValueChange={(v: any) => setRegisterForm({ ...registerForm, role: v })}
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
              </div>

              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  placeholder="name@example.com"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label>Create Password</Label>
                <Input
                  type="password"
                  placeholder="Minimum 8 characters"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                />
              </div>

              <Separator className="my-4" />

              {/* STEP 1: IDENTITY VERIFICATION */}
              <div className="space-y-3 p-4 bg-slate-50 border rounded-lg">
                <div className="flex justify-between items-center">
                  <Label className="text-sm font-bold text-slate-700">STEP 1: YOUR IDENTITY</Label>
                  {isSelfVerified && <span className="text-xs font-bold text-green-600 flex items-center gap-1">✅ VERIFIED</span>}
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="6-digit code"
                    className="bg-white"
                    value={registerForm.otp}
                    disabled={isSelfVerified}
                    onChange={(e) => setRegisterForm({ ...registerForm, otp: e.target.value })}
                  />
                  {!isSelfVerified ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={selfTimer > 0 || !registerForm.email}
                        onClick={() => sendOtp(registerForm.email, 'identity')}
                      >
                        {selfTimer > 0 ? formatTime(selfTimer) : "Send"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={registerForm.otp.length !== 6}
                        onClick={() => verifyOtp(registerForm.email, registerForm.otp, 'identity')}
                      >
                        Verify
                      </Button>
                    </>
                  ) : (
                    <Button variant="ghost" size="sm" className="w-full text-green-600 bg-green-50" disabled>
                      Ready for Next Step
                    </Button>
                  )}
                </div>
              </div>

              {/* STEP 2: ADMIN AUTHORIZATION (STAFF ONLY) */}
              {registerForm.role === 'staff' && (
                <div className="space-y-3 p-4 bg-blue-50 border border-blue-100 rounded-lg animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center">
                    <Label className="text-sm font-bold text-blue-800">STEP 2: MANAGER AUTH</Label>
                    {isAdminVerified && <span className="text-xs font-bold text-blue-600 flex items-center gap-1">✅ AUTHORIZED</span>}
                  </div>
                  <Input
                    placeholder="Manager's Email"
                    className="bg-white h-8 text-sm"
                    value={registerForm.adminEmail}
                    disabled={isAdminVerified}
                    onChange={(e) => setRegisterForm({ ...registerForm, adminEmail: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Input
                      placeholder="Manager's Code"
                      className="bg-white"
                      value={registerForm.adminOtp}
                      disabled={isAdminVerified}
                      onChange={(e) => setRegisterForm({ ...registerForm, adminOtp: e.target.value })}
                    />
                    {!isAdminVerified ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={adminTimer > 0 || !registerForm.adminEmail}
                          onClick={() => sendOtp(registerForm.adminEmail, 'authorization')}
                        >
                          {adminTimer > 0 ? formatTime(adminTimer) : "Get"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={registerForm.adminOtp.length !== 6}
                          onClick={() => verifyOtp(registerForm.adminEmail, registerForm.adminOtp, 'authorization')}
                        >
                          Verify
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" className="w-full text-blue-600 bg-blue-100" disabled>
                        Manager Approved
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <Button
                className="w-full mt-4 h-12 text-lg font-semibold"
                onClick={handleRegister}
                disabled={
                  registerMutation.isPending ||
                  !isSelfVerified ||
                  (registerForm.role === 'staff' && !isAdminVerified)
                }
              >
                {registerMutation.isPending ? (
                  <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Finalizing...</>
                ) : (
                  "Complete Registration"
                )}
              </Button>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}