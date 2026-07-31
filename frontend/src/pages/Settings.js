import { useCallback, useEffect, useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Save, ShieldCheck, Trash2, UserPlus, Users, Wrench } from "lucide-react";
import { toast } from "sonner";

const BLANK_USER = { name: "", email: "", password: "", role: "staff" };

export default function Settings() {
  const { user: currentUser, createUser } = useAuth();
  const [s, setS] = useState({ washed_loss: 2.5, unwashed_loss: 5, starting_cash: 0, grinding_rate: 2, flour_deduction_percent: 5, flour_rate: 0 });
  const [audit, setAudit] = useState([]);
  const [users, setUsers] = useState([]);
  const [draft, setDraft] = useState(BLANK_USER);
  const [savingUser, setSavingUser] = useState(false);
  const [costPreview, setCostPreview] = useState(null);
  const [costBusy, setCostBusy] = useState(false);

  const previewCosts = async () => {
    setCostBusy(true);
    try {
      const { data } = await api.get("/products/cost-repair/preview");
      setCostPreview(data);
      if (data.count === 0) toast.success("Every product already has a cost — nothing to repair");
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setCostBusy(false);
    }
  };

  const applyCosts = async () => {
    setCostBusy(true);
    try {
      const { data } = await api.post("/products/cost-repair");
      toast.success(`Rebuilt ${data.count} product cost${data.count === 1 ? "" : "s"}`);
      setCostPreview({ ...data, applied: true });
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setCostBusy(false);
    }
  };

  const isAdmin = currentUser?.role === "admin";

  const loadUsers = useCallback(() => {
    if (!isAdmin) return;
    api.get("/users").then((r) => setUsers(r.data)).catch(() => {});
  }, [isAdmin]);

  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data)).catch(() => {});
    api.get("/audit").then((r) => setAudit(r.data)).catch(() => {});
    loadUsers();
  }, [loadUsers]);

  const save = async () => {
    await api.put("/settings", { washed_loss: +s.washed_loss, unwashed_loss: +s.unwashed_loss, starting_cash: +s.starting_cash,
      grinding_rate: +s.grinding_rate || 0, flour_deduction_percent: +s.flour_deduction_percent || 0, flour_rate: +s.flour_rate || 0 });
    toast.success("Settings saved");
  };

  const addUser = async (e) => {
    e.preventDefault();
    setSavingUser(true);
    try {
      await createUser(draft.name, draft.email, draft.password, draft.role);
      toast.success(`${draft.name} can now sign in`);
      setDraft(BLANK_USER);
      loadUsers();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    } finally {
      setSavingUser(false);
    }
  };

  const removeUser = async (u) => {
    try {
      await api.delete(`/users/${u.id}`);
      toast.success(`Removed ${u.name}`);
      loadUsers();
    } catch (err) {
      toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Business defaults &amp; audit trail</p>
      </div>

      <Card className="p-6 border-border/60 mb-6 max-w-2xl">
        <h3 className="font-heading font-bold text-lg mb-4">Grinding Loss &amp; Cash Defaults</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><Label>Washed Loss %</Label><Input type="number" value={s.washed_loss} onChange={(e) => setS({ ...s, washed_loss: e.target.value })} className="h-11 mt-1" data-testid="set-washed" /></div>
          <div><Label>Unwashed Loss %</Label><Input type="number" value={s.unwashed_loss} onChange={(e) => setS({ ...s, unwashed_loss: e.target.value })} className="h-11 mt-1" data-testid="set-unwashed" /></div>
          <div><Label>Starting Cash ₹</Label><Input type="number" value={s.starting_cash} onChange={(e) => setS({ ...s, starting_cash: e.target.value })} className="h-11 mt-1" data-testid="set-cash" /></div>
        </div>
        <h3 className="font-heading font-bold text-lg mt-6 mb-4">Grinding Charges</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><Label>Grinding Rate ₹/kg</Label>
            <Input type="number" value={s.grinding_rate ?? 2} onChange={(e) => setS({ ...s, grinding_rate: e.target.value })} className="h-11 mt-1" data-testid="set-grinding-rate" />
            <p className="text-xs text-muted-foreground mt-1">What a new grinding job or exchange starts from.</p>
          </div>
          <div><Label>Flour Deduction %</Label>
            <Input type="number" value={s.flour_deduction_percent ?? 5} onChange={(e) => setS({ ...s, flour_deduction_percent: e.target.value })} className="h-11 mt-1" data-testid="set-flour-percent" />
            <p className="text-xs text-muted-foreground mt-1">Share of the flour kept when a customer pays in kind.</p>
          </div>
          <div><Label>Flour Rate ₹/kg</Label>
            <Input type="number" value={s.flour_rate ?? 0} onChange={(e) => setS({ ...s, flour_rate: e.target.value })} className="h-11 mt-1" data-testid="set-flour-rate" />
            <p className="text-xs text-muted-foreground mt-1">Value of deducted flour. Leave at 0 to use each product&apos;s own rate.</p>
          </div>
        </div>
        <Button className="mt-4 h-11" onClick={save} data-testid="save-settings-btn"><Save className="h-4 w-4 mr-1" /> Save Settings</Button>
      </Card>

      {isAdmin && (
        <Card className="p-6 border-border/60 mb-6">
          <div className="flex items-center gap-2 mb-4"><Wrench className="h-5 w-5 text-primary" /><h3 className="font-heading font-bold text-lg">Rebuild Cost Basis</h3></div>
          <p className="text-sm text-muted-foreground mb-4">
            An earlier bug set a product&apos;s cost to zero whenever the product was edited, which makes every
            sale of it report its full price as profit. This rebuilds each cost from what the shop actually
            paid — purchases, production, and stock taken as grinding fees — and corrects the profit already
            recorded on those sales. Preview first; nothing is written until you apply.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={previewCosts} disabled={costBusy} data-testid="cost-preview-btn">
              Preview changes
            </Button>
            {costPreview?.count > 0 && !costPreview.applied && (
              <Button className="h-11" onClick={applyCosts} disabled={costBusy} data-testid="cost-apply-btn">
                Apply to {costPreview.count} product{costPreview.count === 1 ? "" : "s"}
              </Button>
            )}
          </div>

          {costPreview && costPreview.count === 0 && (
            <p className="text-sm text-secondary mt-4" data-testid="cost-clean">Nothing to repair — every product has a cost.</p>
          )}

          {costPreview?.count > 0 && (
            <div className="mt-4">
              {costPreview.applied && <p className="text-sm text-secondary mb-2">Applied.</p>}
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Product</TableHead><TableHead className="text-right">Cost now</TableHead>
                  <TableHead className="text-right">Rebuilt</TableHead><TableHead>Rebuilt from</TableHead>
                  <TableHead className="text-right">Sales corrected</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {costPreview.changes.map((c) => (
                    <TableRow key={c.id} data-testid={`cost-row-${c.id}`}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell className="text-right text-destructive">₹{c.current_cost}</TableCell>
                      <TableCell className="text-right font-semibold">₹{c.rebuilt_cost}/{c.unit}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.acquired_qty} {c.unit} for ₹{c.acquired_value} · {c.sources.join(", ")}
                      </TableCell>
                      <TableCell className="text-right">{c.sales_restamped || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <p className="text-xs text-muted-foreground mt-2">
                Stock value moves by ₹{costPreview.stock_value_change} and previously overstated profit
                falls by ₹{costPreview.profit_correction} across {costPreview.sales_restamped} sale(s).
              </p>
            </div>
          )}
        </Card>
      )}

      {isAdmin && (
        <Card className="p-6 border-border/60 mb-6">
          <div className="flex items-center gap-2 mb-4"><Users className="h-5 w-5 text-primary" /><h3 className="font-heading font-bold text-lg">Users</h3></div>

          <form onSubmit={addUser} className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end mb-6">
            <div className="sm:col-span-1">
              <Label>Full name</Label>
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="h-11 mt-1" required data-testid="user-name" />
            </div>
            <div className="sm:col-span-1">
              <Label>Email</Label>
              <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="h-11 mt-1" required data-testid="user-email" />
            </div>
            <div className="sm:col-span-1">
              <Label>Password</Label>
              <Input type="password" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} className="h-11 mt-1" minLength={8} required data-testid="user-password" />
            </div>
            <div className="sm:col-span-1">
              <Label>Role</Label>
              <Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}>
                <SelectTrigger className="h-11 mt-1" data-testid="user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin (Owner)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={savingUser} className="h-11" data-testid="add-user-btn">
              <UserPlus className="h-4 w-4 mr-1" /> Add User
            </Button>
          </form>
          <p className="text-xs text-muted-foreground -mt-4 mb-6">
            Passwords must be at least 8 characters. Share them with staff directly — the app cannot resend them later.
          </p>

          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">{u.email}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize text-[10px]">{u.role}</Badge></TableCell>
                  <TableCell className="text-right">
                    {u.id === currentUser?.id ? (
                      <span className="text-xs text-muted-foreground">You</span>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => removeUser(u)} data-testid={`delete-user-${u.id}`}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No users yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="p-6 border-border/60">
        <div className="flex items-center gap-2 mb-4"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="font-heading font-bold text-lg">Audit Log</h3></div>
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
          <TableBody>
            {audit.map((r) => (
              <TableRow key={r.id} data-testid={`audit-row-${r.id}`}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.at).toLocaleString()}</TableCell>
                <TableCell><span className="font-medium">{r.user}</span> <Badge variant="outline" className="ml-1 capitalize text-[10px]">{r.role}</Badge></TableCell>
                <TableCell>{r.action}</TableCell><TableCell className="text-muted-foreground">{r.detail}</TableCell>
              </TableRow>
            ))}
            {audit.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No activity logged yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
