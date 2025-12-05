import { useState } from 'react';
import { useLocation } from 'wouter';
import { useStore, mockUsers } from '@/lib/mockData';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import logoUrl from '@assets/generated_images/minimalist_logo_for_an_accounting_app.png';

export default function Login() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [, setLocation] = useLocation();
  const { login } = useStore();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email)) {
      setLocation('/dashboard');
    } else {
      setError('Invalid email. Try: ' + mockUsers.map(u => u.email).join(', '));
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50 pointer-events-none" />
      
      <Card className="w-full max-w-md shadow-xl border-border/50 relative z-10">
        <CardHeader className="space-y-4 flex flex-col items-center text-center pt-10">
          <div className="h-16 w-16 rounded-xl bg-primary/5 flex items-center justify-center mb-2">
            <img src={logoUrl} alt="Logo" className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl font-display">Welcome back</CardTitle>
            <CardDescription>
              Enter your email to access the practice portal
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="pb-10">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="name@cafirm.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="bg-background"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full font-medium">
              Sign In
            </Button>
            
            <div className="pt-4 text-center">
              <p className="text-xs text-muted-foreground">
                Demo Logins:<br/>
                <span className="font-mono text-primary/80 bg-primary/5 px-1 rounded">aditi@cafirm.com</span> (Admin)<br/>
                <span className="font-mono text-primary/80 bg-primary/5 px-1 rounded">rahul@cafirm.com</span> (Staff)
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
