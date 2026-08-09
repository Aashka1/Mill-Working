import { useEffect, useState } from "react";
import { useList, useFilter, PageToolbar } from "@/components/common";
import api, { money, today } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowLeftRight, Info, Pencil } from "lucide-react";
import { PartySelect } from "@/components/PartySelect";
import { toast } from "sonner";

const MONEY_METHODS = ["Cash", "UPI", "Bank", "NEFT", "RTGS", "IMPS", "Cheque"];
const FLOUR_DEDUCTION = "Flour Deduction";
const DEDUCTION_BASES = [
  { value: "Value", label: "Enough to cover the charge" },
  { value: "Percent", label: "Percentage of the flour" },
  { value: "Weight", label: "A fixed weight" },
];

export default function Exchange() {
  const exchanges = useList("/exchanges");
  const customers = useList("/customers");
  const [settings, setSettings] = useState({ washed_loss: 2.5, unwashed_loss: 5 });
  const [q, setQ] = useState("");
  const filtered = useFilter(exchanges.items, q, ["customer_name", "date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState({ date: today(), customer_name: "", wheat_qty: "", washed: true, loss_percent: "2.5", atta_given: "",
    grinding_rate: "", payment_method: "Cash", bank_id: "", deduction_basis: "Value", deduction_percent: "", deduction_weight: "" });
  const [banks, setBanks] = useState([]);

  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => {}); }, []);
  useEffect(() => { api.get("/banks").then((r) => setBanks(r.data)).catch(() => {}); }, []);

  const autoAtta = (+f.wheat_qty || 0) * (1 - (+f.loss_percent || 0) / 100);
  const rate = f.grinding_rate === "" ? (settings.grinding_rate ?? 2) : +f.grinding_rate;
  const grindingCharge = (+f.wheat_qty || 0) * (rate || 0);
  const flourRate = settings.flour_rate || 0;
  const flourProduced = f.atta_given ? +f.atta_given : +autoAtta.toFixed(2);
  // Mirrors the backend so the operator sees the deduction before saving.
  const previewDeduction = f.payment_method !== FLOUR_DEDUCTION ? 0
    : f.deduction_basis === "Weight" ? (+f.deduction_weight || 0)
    : f.deduction_basis === "Percent" ? flourProduced * ((f.deduction_percent === "" ? (settings.flour_deduction_percent ?? 5) : +f.deduction_percent) / 100)
    : (flourRate > 0 ? grindingCharge / flourRate : 0);
  const deliverPreview = Math.max(flourProduced - previewDeduction, 0);
  const setWashed = (w) => setF({ ...f, washed: w, loss_percent: String(w ? settings.washed_loss : settings.unwashed_loss) });

  const blank = () => ({ date: today(), customer_name: "", wheat_qty: "", washed: true, loss_percent: String(settings.washed_loss), atta_given: "",
    grinding_rate: String(settings.grinding_rate ?? 2), payment_method: "Cash", bank_id: "",
    deduction_basis: "Value", deduction_percent: "", deduction_weight: "" });

  const openNew = () => { setEditingId(null); setF(blank()); setOpen(true); };
  const openEdit = (e) => {
    setEditingId(e.id);
    setF({ date: e.date, customer_name: e.customer_name, wheat_qty: String(e.wheat_qty),
           washed: e.washed, loss_percent: String(e.loss_percent), atta_given: String(e.atta_given),
           grinding_rate: String(e.grinding_rate ?? settings.grinding_rate ?? 2),
           payment_method: e.payment_method || "Cash", bank_id: e.bank_id || "",
           deduction_basis: e.deduction_basis || "Value",
           deduction_percent: e.deduction_percent ?? "",
           deduction_weight: e.deducted_flour ? String(e.deducted_flour) : "" });
    setOpen(true);
  };

  const save = async () => {
    if (!f.customer_name || !f.wheat_qty) return toast.error("Fill all fields");
    const atta = f.atta_given ? +f.atta_given : +autoAtta.toFixed(2);
    const kind = f.payment_method === FLOUR_DEDUCTION;
    const body = { date: f.date, customer_name: f.customer_name, wheat_qty: +f.wheat_qty,
      washed: f.washed, loss_percent: +f.loss_percent, atta_given: atta,
      grinding_rate: f.grinding_rate === "" ? null : +f.grinding_rate,
      payment_method: f.payment_method,
      payment_mode: kind ? "Cash" : f.payment_method,
      bank_id: kind ? null : (f.bank_id || null),
      deduction_basis: f.deduction_basis,
      deduction_percent: f.deduction_percent === "" ? null : +f.deduction_percent,
      deduction_weight: f.deduction_weight === "" ? null : +f.deduction_weight,
      payment_status: "Paid" };
    try {
      if (editingId) {
        await api.put(`/exchanges/${editingId}`, body);
        toast.success("Exchange updated, inventory adjusted");
      } else {
        await api.post("/exchanges", body);
        toast.success("Exchange recorded, inventory updated");
      }
    } catch (err) {
      return toast.error(err.response?.data?.detail || "Failed");
    }
    setOpen(false);
    setEditingId(null);
    setF(blank());
    exchanges.load();
  };

  return (
    <div>
      <PageToolbar
        title="Exchange" subtitle="Customer trades wheat crop for ready atta"
        search={q} setSearch={setQ} searchTestid="search-exchange"
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingId(null); }}>
            <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-exchange-btn"><Plus className="h-4 w-4 mr-1" /> New Exchange</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Edit" : "Record"} Exchange</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
                  <div><Label>Customer</Label>
                    <PartySelect kind="customer" value={f.customer_name}
                    onChange={(v) => setF({ ...f, customer_name: v })}
                    items={customers.items} onCreated={() => customers.load()}
                    testid="exchange-customer" />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <Label>Wheat washed?</Label>
                  <Switch checked={f.washed} onCheckedChange={setWashed} data-testid="exchange-washed" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Wheat Crop (kg)</Label><Input type="number" value={f.wheat_qty} onChange={(e) => setF({ ...f, wheat_qty: e.target.value })} className="h-11 mt-1" data-testid="exchange-wheat" /></div>
                  <div><Label>Grinding Loss %</Label><Input type="number" value={f.loss_percent} onChange={(e) => setF({ ...f, loss_percent: e.target.value })} className="h-11 mt-1" data-testid="exchange-loss" /></div>
                </div>
                <div><Label>Atta Given (kg)</Label>
                  <Input type="number" value={f.atta_given} onChange={(e) => setF({ ...f, atta_given: e.target.value })} placeholder={autoAtta.toFixed(2)} className="h-11 mt-1" data-testid="exchange-atta" />
                  <p className="text-xs text-muted-foreground mt-1">Auto: {autoAtta.toFixed(2)} kg after {f.loss_percent}% loss. Override if needed.</p>
                </div>

                <div className="rounded-lg border border-border/60 p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Grinding rate ₹/kg</Label>
                      <Input type="number" value={f.grinding_rate} onChange={(e) => setF({ ...f, grinding_rate: e.target.value })}
                        placeholder={String(settings.grinding_rate ?? 2)} className="h-11 mt-1" data-testid="exchange-rate" />
                      <p className="text-xs text-muted-foreground mt-1">Blank uses the {settings.grinding_rate ?? 2} set in Settings.</p>
                    </div>
                    <div><Label>Grinding charge</Label>
                      <div className="h-11 mt-1 flex items-center font-bold text-lg" data-testid="exchange-charge">{money(grindingCharge)}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Payment type</Label>
                      <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="exchange-payment"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MONEY_METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                          <SelectItem value={FLOUR_DEDUCTION}>Flour Deduction</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {f.payment_method !== FLOUR_DEDUCTION && f.payment_method !== "Cash" && (
                      <div><Label>Into which account</Label>
                        <Select value={f.bank_id} onValueChange={(v) => setF({ ...f, bank_id: v })}>
                          <SelectTrigger className="h-11 mt-1" data-testid="exchange-bank"><SelectValue placeholder="Choose" /></SelectTrigger>
                          <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                    {f.payment_method === FLOUR_DEDUCTION && (
                      <div><Label>Deduct flour by</Label>
                        <Select value={f.deduction_basis} onValueChange={(v) => setF({ ...f, deduction_basis: v })}>
                          <SelectTrigger className="h-11 mt-1" data-testid="exchange-basis"><SelectValue /></SelectTrigger>
                          <SelectContent>{DEDUCTION_BASES.map((b) => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {f.payment_method === FLOUR_DEDUCTION && (
                    <>
                      {f.deduction_basis === "Percent" && (
                        <div><Label>Percentage</Label>
                          <Input type="number" value={f.deduction_percent} onChange={(e) => setF({ ...f, deduction_percent: e.target.value })}
                            placeholder={String(settings.flour_deduction_percent ?? 5)} className="h-11 mt-1" data-testid="exchange-percent" /></div>
                      )}
                      {f.deduction_basis === "Weight" && (
                        <div><Label>Weight kept (kg)</Label>
                          <Input type="number" value={f.deduction_weight} onChange={(e) => setF({ ...f, deduction_weight: e.target.value })} className="h-11 mt-1" data-testid="exchange-weight" /></div>
                      )}
                      <div className="text-sm rounded-lg bg-muted/50 p-3 space-y-1" data-testid="exchange-deduction-preview">
                        <div className="flex justify-between"><span className="text-muted-foreground">Flour produced</span><span>{flourProduced.toFixed(2)} kg</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Deducted as grinding charges</span><span className="text-destructive">−{previewDeduction.toFixed(2)} kg</span></div>
                        <div className="flex justify-between font-semibold"><span>Final flour delivered</span><span>{deliverPreview.toFixed(2)} kg</span></div>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <DialogFooter><Button onClick={save} data-testid="save-exchange-btn">Save Exchange</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3"><Info className="h-4 w-4" /> Shop <b className="mx-1">Wheat Crop</b> stock increases, <b className="mx-1">Atta</b> stock decreases.</div>
      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Washed</TableHead>
            <TableHead className="text-right">Wheat In (kg)</TableHead><TableHead className="text-right">Loss (kg)</TableHead>
            <TableHead className="text-right">Delivered (kg)</TableHead>
            <TableHead className="text-right">Grinding Charge</TableHead>
            <TableHead>Paid By</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className="hover:bg-muted/50" data-testid={`exchange-row-${e.id}`}>
                <TableCell>{e.date}</TableCell><TableCell className="font-medium">{e.customer_name}</TableCell>
                <TableCell><Badge variant="outline">{e.washed ? "Washed" : "Unwashed"}</Badge></TableCell>
                <TableCell className="text-right">{e.wheat_qty}</TableCell><TableCell className="text-right text-destructive">{e.loss_kg}</TableCell>
                <TableCell className="text-right font-medium">
                  {e.final_flour_delivered ?? e.atta_given}
                  {e.deducted_flour > 0 && (
                    <div className="text-xs text-muted-foreground">−{e.deducted_flour} kg kept as fee</div>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {money(e.grinding_charge || 0)}
                  {e.grinding_rate ? <div className="text-xs text-muted-foreground">@ {money(e.grinding_rate)}/kg</div> : null}
                </TableCell>
                <TableCell><Badge variant="outline">{e.payment_method || "Cash"}</Badge></TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(e)} data-testid={`edit-exchange-${e.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => exchanges.remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No exchanges yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
