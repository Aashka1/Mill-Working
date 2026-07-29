import { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wheat, Loader2, MailCheck } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
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

        {sent ? (
          <div>
            <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
              <MailCheck className="h-6 w-6 text-primary" />
            </div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">Check your email</h1>
            <p className="text-muted-foreground mt-2">
              If <span className="font-medium text-foreground">{email}</span> has an account, a reset link is on
              its way. It expires in 30 minutes.
            </p>
            <p className="text-muted-foreground mt-4 text-sm">
              Nothing arrived? Check spam, or ask the mill owner to reset it for you from Settings.
            </p>
            <Link to="/login">
              <Button variant="outline" className="w-full h-12 mt-8">Back to sign in</Button>
            </Link>
          </div>
        ) : (
          <div>
            <h1 className="font-heading text-3xl font-bold tracking-tight">Forgot password</h1>
            <p className="text-muted-foreground mt-2 mb-8">
              Enter your email and we&apos;ll send you a link to set a new one.
            </p>
            <form onSubmit={submit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" data-testid="forgot-password-email-input" type="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} className="h-12" required autoFocus />
              </div>
              {error && <p data-testid="forgot-password-error" className="text-sm text-destructive">{error}</p>}
              <Button data-testid="forgot-password-submit-button" type="submit" disabled={loading}
                className="w-full h-12 text-base active:scale-95 transition-transform">
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send reset link
              </Button>
            </form>
            <p className="mt-6 text-sm text-muted-foreground text-center">
              Remembered it?{" "}
              <Link to="/login" className="text-primary font-semibold hover:underline"
                data-testid="forgot-password-login-link">
                Sign in
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
