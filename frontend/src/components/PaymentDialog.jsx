import { useEffect, useState } from "react";
import api, { money, today, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

/**
 * Takes a payment against one bill — the whole balance or part of it.
 *
 * `path` is the collection segment ("sales", "grinding", "oil", "purchases").
 * The record only needs a total and, optionally, what has already been paid.
 */
export function PaymentDialog({ open, onOpenChange, record, path, totalField = "total", onDone }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const total = Number(record?.[totalField] || 0);
  const alreadyPaid = Number(record?.amount_paid || 0);
  const balance = Math.max(Number((total - alreadyPaid).toFixed(2)), 0);

  useEffect(() => {
    if (open) {
      setAmount(String(balance));
      // payment_mode is how money moved (Cash/Bank). Grinding and oil also
      // carry payment_method, but that is Cash vs Grain — a different question.
      setMethod(record?.payment_mode || "Cash");
      setDate(record?.date || today());
    }
    // Re-seed each time the dialog opens for a different bill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, record?.id]);

  const entered = Number(amount || 0);
  const remaining = Number((balance - entered).toFixed(2));

  const submit = async () => {
    if (!(entered > 0)) return toast.error("Enter an amount greater than zero");
    if (entered > balance + 0.009) return toast.error(`Balance is only ${money(balance)}`);
    setSaving(true);
    try {
      await api.patch(`/${path}/${record.id}/pay`, { amount: entered, payment_method: method, date });
      toast.success(remaining > 0 ? `${money(entered)} received · ${money(remaining)} still due` : "Bill settled in full");
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Payment</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-border/60 bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Bill total</span><span className="font-medium">{money(total)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Already paid</span><span className="font-medium">{money(alreadyPaid)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Balance</span><span className="font-bold">{money(balance)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 mt-1" /></div>
            <div><Label>Paid by</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-11 mt-1" data-testid="payment-method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank">Bank transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Amount received now</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 mt-1" data-testid="payment-amount" />
            <div className="flex gap-2 mt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAmount(String(balance))} data-testid="payment-full">Full balance</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setAmount(String(Number((balance / 2).toFixed(2))))}>Half</Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            {remaining > 0
              ? <>After this, <span className="font-semibold text-foreground">{money(remaining)}</span> stays pending.</>
              : <>This settles the bill in full.</>}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} data-testid="save-payment-btn">Save Payment</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
