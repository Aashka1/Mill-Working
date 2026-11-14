import { useCallback, useEffect, useState } from "react";
import api, { money, today, formatApiErrorDetail } from "@/lib/api";
import { PartySelect } from "@/components/PartySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const FLOUR = "Flour Deduction";
const MODES = [
  { value: "Cash", label: "Cash" },
  { value: "UPI", label: "UPI" },
  { value: "Bank", label: "Bank" },
  { value: "Credit", label: "Credit (pay later)" },
  { value: FLOUR, label: "Atta kaṭautī — taken from their account" },
];

const blank = (name = "") => ({
  date: today(), customer_name: name, flour_kg: "", flour_quintal: "",
  charge_per_kg: "", payment_mode: "Cash", deduction_percent: "", bank_id: "", note: "",
});

/**
 * Advance Atta (अग्रिम आटा): flour handed over before the customer's wheat is
 * in, or beyond what their account holds. Whatever the account covers comes
 * off it; the rest is owed back and the next wheat deposit settles it.
 */
export function AdvanceAttaDialog({ open, onOpenChange, customerName = "", onDone }) {
  const [f, setF] = useState(blank(customerName));
  const [customers, setCustomers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [balances, setBalances] = useState({});
  const [settings, setSettings] = useState({});
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(() => api.get("/customers").then((r) => setCustomers(r.data)).catch(() => {}), []);

  useEffect(() => {
    if (!open) return;
    setF(blank(customerName));
    loadCustomers();
    api.get("/banks").then((r) => setBanks(r.data)).catch(() => {});
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
    api.get("/deposits/summary").then((r) => {
      const map = {};
      (r.data.rows || []).forEach((row) => { map[row.customer_name] = row.remaining_kg; });
      setBalances(map);
    }).catch(() => {});
  }, [open, customerName, loadCustomers]);

  // Mirrors the backend so the split is visible before saving.
  const qty = (+f.flour_kg || 0) + (+f.flour_quintal || 0) * 100;
  const inFlour = f.payment_mode === FLOUR;
  const pct = f.deduction_percent === "" ? (settings.deposit_flour_deduction_percent ?? 15) : +f.deduction_percent;
  const fee = inFlour ? +(qty * pct / 100).toFixed(3) : 0;
  const drawn = +(qty + fee).toFixed(3);
  const balance = balances[f.customer_name] ?? 0;
  const available = Math.max(balance, 0);
  const fromBalance = Math.min(drawn, available);
  const advance = +(drawn - fromBalance).toFixed(3);
  const after = +(balance - drawn).toFixed(3);
  const charge = inFlour ? 0 : +(qty * (+f.charge_per_kg || 0)).toFixed(2);

  const save = async () => {
    if (!f.customer_name) return toast.error("Choose the customer");
    if (qty <= 0) return toast.error("Enter how much atta is being given");
    setSaving(true);
    try {
      const { data } = await api.post("/advance-atta", {
        ...f,
        flour_kg: +f.flour_kg || 0,
        flour_quintal: +f.flour_quintal || 0,
        charge_per_kg: +f.charge_per_kg || 0,
        deduction_percent: f.deduction_percent === "" ? null : +f.deduction_percent,
        bank_id: f.bank_id || null,
      });
      const left = data.balance.remaining_kg;
      toast.success(left >= 0
        ? `${data.flour_delivered} kg atta given · ${left} kg left on account`
        : `${data.flour_delivered} kg atta given · ${-left} kg advance to be adjusted from next wheat deposit`);
      onOpenChange(false);
      onDone && onDone(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  const bankModes = f.payment_mode === "UPI" || f.payment_mode === "Bank";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Advance Atta (अग्रिम आटा)</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Customer</Label>
              <div className="mt-1">
                <PartySelect kind="customer" value={f.customer_name} items={customers}
                  onChange={(v) => setF({ ...f, customer_name: v })} onCreated={loadCustomers}
                  testid="advance-customer" />
              </div>
            </div>
            <div><Label>Date</Label>
              <Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
          </div>
          {f.customer_name && (
            <p className="text-sm text-muted-foreground" data-testid="advance-current-balance">
              Atta on account now: <span className={`font-semibold ${balance < 0 ? "text-destructive" : "text-foreground"}`}>
                {balance < 0 ? `${-balance} kg already taken in advance` : `${balance} kg`}</span>
            </p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Atta given (kg)</Label>
              <Input type="number" value={f.flour_kg} onChange={(e) => setF({ ...f, flour_kg: e.target.value })} className="h-11 mt-1" data-testid="advance-kg" /></div>
            <div><Label>or quintal</Label>
              <Input type="number" value={f.flour_quintal} onChange={(e) => setF({ ...f, flour_quintal: e.target.value })} className="h-11 mt-1" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Payment</Label>
              <Select value={f.payment_mode} onValueChange={(v) => setF({ ...f, payment_mode: v })}>
                <SelectTrigger className="h-11 mt-1" data-testid="advance-mode"><SelectValue /></SelectTrigger>
                <SelectContent>{MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {inFlour ? (
              <div><Label>Atta kaṭautī %</Label>
                <Input type="number" placeholder={String(settings.deposit_flour_deduction_percent ?? 15)} value={f.deduction_percent}
                  onChange={(e) => setF({ ...f, deduction_percent: e.target.value })} className="h-11 mt-1" /></div>
            ) : (
              <div><Label>Grinding charge ₹/kg <span className="text-muted-foreground font-normal">(if any)</span></Label>
                <Input type="number" placeholder="0" value={f.charge_per_kg}
                  onChange={(e) => setF({ ...f, charge_per_kg: e.target.value })} className="h-11 mt-1" data-testid="advance-rate" /></div>
            )}
          </div>
          {bankModes && banks.length > 0 && (
            <div><Label>Bank account</Label>
              <Select value={f.bank_id} onValueChange={(v) => setF({ ...f, bank_id: v })}>
                <SelectTrigger className="h-11 mt-1"><SelectValue placeholder="Default account" /></SelectTrigger>
                <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.bank_name} {b.account_number ? `· ${String(b.account_number).slice(-4)}` : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div><Label>Note</Label>
            <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" className="h-11 mt-1" /></div>

          {qty > 0 && f.customer_name && (
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1" data-testid="advance-preview">
              <div className="flex justify-between"><span>From atta already on account</span><span className="font-medium">{fromBalance} kg</span></div>
              <div className="flex justify-between"><span>Given in advance</span><span className="font-medium text-destructive">{advance} kg</span></div>
              {fee > 0 && <div className="flex justify-between"><span>Atta kaṭautī (fee)</span><span>{fee} kg</span></div>}
              {charge > 0 && <div className="flex justify-between"><span>Grinding charge</span><span>{money(charge)}{f.payment_mode === "Credit" ? " · on credit" : ""}</span></div>}
              <div className="flex justify-between border-t border-border/60 pt-1 font-semibold">
                <span>{after >= 0 ? "Atta left on account" : "Advance to adjust from next deposit"}</span>
                <span>{Math.abs(after)} kg</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving} data-testid="save-advance-btn">Give Advance Atta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
