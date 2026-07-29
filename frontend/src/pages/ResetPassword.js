import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wheat, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Both passwords must match.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password updated. Sign in with your new password.");
      navigate("/login", { replace: true });
    } catch (err) {
      setError(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center">
            <Wheat className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-heading font-bold text-lg">Gangotri Flour &amp; Oil Mill</span>
        </div>

        {!token ? (
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">Link incomplete</h1>
            <p className="text-muted-foreground mt-2">
              This page needs a reset link from your email. Copy the whole link across, or request a new one.
            </p>
            <Link to="/forgot-password">
              <Button className="w-full h-12 mt-8">Request a new link</Button>
            </Link>
          </div>
        ) : (
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">Set a new password</h1>
            <p className="text-muted-foreground mt-2 mb-8">Choose something at least 8 characters long.</p>
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input id="password" data-testid="reset-password-input" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)} className="h-12" required autoFocus />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input id="confirm" data-testid="reset-password-confirm-input" type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} className="h-12" required />
              </div>
              {error && <p data-testid="reset-password-error" className="text-sm text-destructive">{error}</p>}
              <Button data-testid="reset-password-submit-button" type="submit" disabled={loading}
                className="w-full h-12 text-base active:scale-95 transition-transform">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Update password
              </Button>
            </form>
            <p className="mt-6 text-sm text-muted-foreground text-center">
              <Link to="/login" className="text-primary font-semibold hover:underline"
                data-testid="reset-password-login-link">
                Back to sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
