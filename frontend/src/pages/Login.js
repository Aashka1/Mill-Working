import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wheat, Loader2 } from "lucide-react";

export default function Login() {
  const { login, error } = useAuth();
  const [email, setEmail] = useState("admin@agrimill.com");
  const [password, setPassword] = useState("admin123");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    await login(email, password);
    setLoading(false);
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:block">
        <img
          src="https://images.pexels.com/photos/723498/pexels-photo-723498.jpeg"
          alt="Wheat field at sunset"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 h-full flex flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center">
              <Wheat className="h-6 w-6 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-xl">Gangotri Flour &amp; Oil Mill</span>
          </div>
          <div>
            <h2 className="font-heading text-4xl font-bold leading-tight tracking-tight">
              Run your mill,<br />not the maths.
            </h2>
            <p className="mt-4 text-white/80 max-w-md">
              Inventory, sales, grinding &amp; oil extraction, billing and reports — all in one digital register.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-6 md:p-12 bg-background">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
              <Wheat className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-lg">Gangotri Flour &amp; Oil Mill</span>
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground mt-2 mb-8">Enter your credentials to continue.</p>

          <form onSubmit={submit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email" type="email" value={email}
                onChange={(e) => setEmail(e.target.value)} className="h-12" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" data-testid="login-password" type="password" value={password}
                onChange={(e) => setPassword(e.target.value)} className="h-12" required />
            </div>
            {error && <p data-testid="login-error" className="text-sm text-destructive">{error}</p>}
            <Button data-testid="login-submit" type="submit" disabled={loading} className="w-full h-12 text-base active:scale-95 transition-transform">
              {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Sign in
            </Button>
          </form>

          <div className="mt-6 text-xs text-muted-foreground border border-border/60 rounded-lg p-3 bg-muted/40">
            <p className="font-semibold mb-1">Demo accounts</p>
            <p>Admin: admin@agrimill.com / admin123</p>
            <p>Staff: staff@agrimill.com / staff123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
