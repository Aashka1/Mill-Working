import { useEffect, useState } from "react";
import api, { money, today } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// Reusable ledger + record-payment dialog for a customer or supplier
export function LedgerDialog({ open, onOpenChange, entity, partyType, onChanged }) {
  const [data, setData] = useState(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [note, setNote] = useState("");

  const load = () => {
    if (!entity) return;
    const path = partyType === "customer" ? `/customers/${entity.id}/ledger` : `/suppliers/${entity.id}/ledger`;
    api.get(path).then((r) => setData(r.data)).catch(() => {});
  };

  useEffect(() => { if (open) { load(); setAmount(""); setNote(""); setDate(today()); } }, [open, entity]);

  const record = async () => {
    if (!amount || +amount <= 0) return toast.error("Enter amount");
    await api.post("/payments", { party_type: partyType, party_name: entity.name, amount: +amount, date, note: note || "Payment" });
    toast.success("Payment recorded");
    setAmount(""); setNote("");
    load();
    onChanged && onChanged();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Ledger — {entity?.name}</DialogTitle></DialogHeader>
        {data && (
          <>
            <div className="grid grid-cols-3 gap-4 text-sm mb-2">
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Total Billed</p><p className="font-bold text-lg">{money(data.total_debit)}</p></div>
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Total Paid</p><p className="font-bold text-lg text-secondary">{money(data.total_credit)}</p></div>
              <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Balance Due</p><p className={`font-bold text-lg ${data.balance > 0 ? "text-destructive" : "text-secondary"}`}>{money(data.balance)}</p></div>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader><TableRow><TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Ref</TableHead><TableHead className="text-right">Debit</TableHead><TableHead className="text-right">Credit</TableHead><TableHead className="text-right">Balance</TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.entries.map((e, i) => (
                    <TableRow key={i} data-testid={`ledger-row-${i}`}>
                      <TableCell className="text-xs">{e.date}</TableCell>
                      <TableCell><Badge variant="outline" className={e.type === "Payment" ? "text-secondary border-secondary/40" : ""}>{e.type}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{e.ref}</TableCell>
                      <TableCell className="text-right">{e.debit ? money(e.debit) : "—"}</TableCell>
                      <TableCell className="text-right text-secondary">{e.credit ? money(e.credit) : "—"}</TableCell>
                      <TableCell className="text-right font-medium">{money(e.balance)}</TableCell>
                    </TableRow>
                  ))}
                  {data.entries.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No transactions.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end border-t border-border/60 pt-4">
              <div><Label>Payment ₹</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-11 mt-1" data-testid="ledger-amount" /></div>
              <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 mt-1" /></div>
              <div><Label>Note</Label><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" className="h-11 mt-1" /></div>
              <Button className="h-11" onClick={record} data-testid="record-payment-btn">Record Payment</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
