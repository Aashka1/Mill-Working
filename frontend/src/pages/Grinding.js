import { useEffect, useState } from "react";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import api, { money, today, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Download, FileDown, Info, Pencil, IndianRupee } from "lucide-react";
import { PaymentDialog } from "@/components/PaymentDialog";
import { toast } from "sonner";

const ADD_NEW = "__add_new__";

const empty = { date: today(), customer_name: "", grain_type: "Wheat", output_product: "Atta", wheat_weight: "", washed: true, loss_percent: "2.5", charge_per_kg: "2", payment_method: "Cash", grain_fee_kg: "", payment_status: "Pending", amount_paid: "" };

export default function Grinding() {
  const grinding = useList("/grinding");
  const customers = useList("/customers");
  const [settings, setSettings] = useState({ washed_loss: 2.5, unwashed_loss: 5 });
  const [q, setQ] = useState("");
  const filtered = useFilter(grinding.items, q, ["customer_name", "invoice_number", "payment_status", "date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(empty);
  const [payFor, setPayFor] = useState(null);
  const [grainTypes, setGrainTypes] = useState([]);
  const [newGrain, setNewGrain] = useState({ name: "", output: "" });

  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => {}); }, []);
  const loadGrainTypes = () => api.get("/grain-types").then((r) => setGrainTypes(r.data)).catch(() => {});
  useEffect(() => { loadGrainTypes(); }, []);

  const addingGrain = f.grain_type === ADD_NEW;
  const pickGrain = (v) => {
    if (v === ADD_NEW) return setF({ ...f, grain_type: ADD_NEW });
    const t = grainTypes.find((g) => g.name === v);
    setF({ ...f, grain_type: v, output_product: t?.output || "Atta" });
  };
  const saveNewGrain = async () => {
    const name = newGrain.name.trim();
    if (!name) return toast.error("Enter what is being ground");
    const output = newGrain.output.trim() || `${name} Atta`;
    try {
      const { data } = await api.post("/grain-types", { name, output });
      setGrainTypes(data);
      setF({ ...f, grain_type: name, output_product: output });
      setNewGrain({ name: "", output: "" });
      toast.success(`${name} added — grinds into ${output}`);
    } catch (e) {
      toast.error(e.response?.data?.detail || "Could not add");
    }
  };

  const outputQty = (+f.wheat_weight || 0) * (1 - (+f.loss_percent || 0) / 100);
  const outputAtta = outputQty;
  const lossKg = (+f.wheat_weight || 0) - outputAtta;
  const setWashed = (w) => setF({ ...f, washed: w, loss_percent: String(w ? settings.washed_loss : settings.unwashed_loss) });

  const openNew = () => { setEditingId(null); setF({ ...empty, loss_percent: String(settings.washed_loss) }); setOpen(true); };
  const openEdit = (g) => {
    setEditingId(g.id);
    setF({ date: g.date, customer_name: g.customer_name, grain_type: g.grain_type || "Wheat", output_product: g.output_product || "Atta", wheat_weight: String(g.wheat_weight), washed: g.washed, loss_percent: String(g.loss_percent), charge_per_kg: String(g.charge_per_kg), payment_method: g.payment_method || "Cash", grain_fee_kg: String(g.grain_fee_kg || ""), payment_status: g.payment_status, amount_paid: "" });
    setOpen(true);
  };

  const save = async () => {
    if (!f.customer_name || !f.wheat_weight) return toast.error("Fill all fields");
    if (addingGrain) return toast.error("Add the new item first, or pick one from the list");
    const body = { date: f.date, customer_name: f.customer_name, grain_type: f.grain_type, output_product: f.output_product, wheat_weight: +f.wheat_weight, washed: f.washed, loss_percent: +f.loss_percent, charge_per_kg: +(f.charge_per_kg || 0), payment_method: f.payment_method, grain_fee_kg: +(f.grain_fee_kg || 0), payment_status: f.payment_status };
    if (!editingId) body.amount_paid = f.payment_status === "Paid" ? null : (f.payment_status === "Partial" ? +f.amount_paid || 0 : 0);
    if (editingId) { await api.put(`/grinding/${editingId}`, body); toast.success("Order updated"); }
    else { await api.post("/grinding", body); toast.success("Grinding order recorded"); }
    setOpen(false); setEditingId(null); setF(empty);
    grinding.load();
  };

  const grindCharge = (+f.wheat_weight || 0) * (+f.charge_per_kg || 0);

  return (
    <div>
      <PageToolbar
        title="Grinding Service" subtitle="Customer-owned grain — wheat, besan, multigrain and more"
        search={q} setSearch={setQ} searchTestid="search-grinding"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => downloadFile("/export/grinding", "grinding_report.xlsx")} data-testid="export-grinding-btn"><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
            <Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-grinding-btn"><Plus className="h-4 w-4 mr-1" /> New Order</Button>
          </>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Capped height with the fields scrolling: the form grows with the
            item selector's inline "add new" panel and the part-payment field,
            and an uncapped dialog pushes Save Order below the fold. Header and
            footer stay pinned via explicit grid rows; minmax(0,1fr) lets the
            middle row shrink below its content so it can actually overflow. */}
        <DialogContent className="max-w-lg max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "New"} Grinding Order</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
              <div><Label>Customer</Label>
                <Select value={f.customer_name} onValueChange={(v) => setF({ ...f, customer_name: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="grinding-customer"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{customers.items.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    {customers.items.length === 0 && <SelectItem value="Walk-in">Walk-in Customer</SelectItem>}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>What is being ground?</Label>
              <Select value={f.grain_type} onValueChange={pickGrain}>
                <SelectTrigger className="h-11 mt-1" data-testid="grinding-grain-type"><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {grainTypes.map((g) => <SelectItem key={g.name} value={g.name}>{g.name} → {g.output}</SelectItem>)}
                  {/* Always last, so the standing items stay at the top of the list. */}
                  <SelectItem value={ADD_NEW}>＋ Add something else…</SelectItem>
                </SelectContent>
              </Select>
              {addingGrain ? (
                <div className="mt-3 rounded-lg border border-border/60 p-3 space-y-3">
                  <p className="text-xs text-muted-foreground">Masala, a new millet — anything the mill grinds. It is saved for next time.</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Item brought in</Label><Input value={newGrain.name} onChange={(e) => setNewGrain({ ...newGrain, name: e.target.value })} placeholder="Masala" className="h-11 mt-1" data-testid="new-grain-name" /></div>
                    <div><Label>Ground into</Label><Input value={newGrain.output} onChange={(e) => setNewGrain({ ...newGrain, output: e.target.value })} placeholder="Masala Powder" className="h-11 mt-1" data-testid="new-grain-output" /></div>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={saveNewGrain} data-testid="save-grain-type">Add item</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => setF({ ...f, grain_type: "Wheat", output_product: "Atta" })}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Grinds into <b>{f.output_product}</b>.</p>
              )}
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
              <div><Label>Washed?</Label><p className="text-xs text-muted-foreground">Washed {settings.washed_loss}% · Unwashed {settings.unwashed_loss}% loss</p></div>
              <Switch checked={f.washed} onCheckedChange={setWashed} data-testid="grinding-washed" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{f.grain_type === ADD_NEW ? "Weight" : f.grain_type} Weight (kg)</Label><Input type="number" value={f.wheat_weight} onChange={(e) => setF({ ...f, wheat_weight: e.target.value })} className="h-11 mt-1" data-testid="grinding-weight" /></div>
              <div><Label>Grinding Loss %</Label><Input type="number" value={f.loss_percent} onChange={(e) => setF({ ...f, loss_percent: e.target.value })} className="h-11 mt-1" data-testid="grinding-loss" /></div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm flex justify-between">
              <span>Loss: <b className="text-destructive">{lossKg.toFixed(2)} kg</b></span>
              <span>{f.output_product} output: <b className="text-secondary">{outputQty.toFixed(2)} kg</b></span>
            </div>
            <div><Label>Payment Method</Label>
              <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v })}>
                <SelectTrigger className="h-11 mt-1" data-testid="grinding-pay-method"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Grain">Grain (shop keeps atta)</SelectItem></SelectContent>
              </Select>
            </div>
            {f.payment_method === "Cash" ? (
              <div><Label>Charge ₹/kg</Label><Input type="number" value={f.charge_per_kg} onChange={(e) => setF({ ...f, charge_per_kg: e.target.value })} className="h-11 mt-1" data-testid="grinding-charge" />
                <p className="text-xs text-muted-foreground mt-1">Total charge: {money((+f.wheat_weight || 0) * (+f.charge_per_kg || 0))}</p></div>
            ) : (
              <div><Label>{f.output_product} kept by shop (kg)</Label><Input type="number" value={f.grain_fee_kg} onChange={(e) => setF({ ...f, grain_fee_kg: e.target.value })} className="h-11 mt-1" data-testid="grinding-grainfee" />
                <p className="text-xs text-muted-foreground mt-1">Customer takes home: {(outputQty - (+f.grain_fee_kg || 0)).toFixed(2)} kg · Shop {f.output_product} stock +{(+f.grain_fee_kg || 0)} kg</p></div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Payment Status</Label>
                <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="grinding-payment-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid in full</SelectItem>
                    <SelectItem value="Partial">Part payment</SelectItem>
                    <SelectItem value="Pending">Nothing paid yet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!editingId && f.payment_status === "Partial" && (
                <div><Label>Amount received</Label>
                  <Input type="number" value={f.amount_paid} onChange={(e) => setF({ ...f, amount_paid: e.target.value })} className="h-11 mt-1" data-testid="grinding-amount-paid" />
                  <p className="text-xs text-muted-foreground mt-1">Balance {money(Math.max(grindCharge - (+f.amount_paid || 0), 0))}</p>
                </div>
              )}
            </div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-grinding-btn">{editingId ? "Update" : "Save"} Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} record={payFor} path="grinding" totalField="total_charge" onDone={() => grinding.load()} />

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3"><Info className="h-4 w-4" /> Customer-owned grain — only shop's retained grain (grain payment) affects inventory.</div>
      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
            <TableHead>Item</TableHead><TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead>
            <TableHead>Payment</TableHead><TableHead className="text-right">Charge</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((g) => (
              <TableRow key={g.id} className="hover:bg-muted/50" data-testid={`grinding-row-${g.id}`}>
                <TableCell className="font-mono text-xs">{g.invoice_number}</TableCell><TableCell>{g.date}</TableCell>
                <TableCell className="font-medium">{g.customer_name}</TableCell>
                <TableCell><Badge variant="outline">{g.grain_type || "Wheat"}</Badge></TableCell>
                <TableCell className="text-right">{g.wheat_weight} kg</TableCell>
                <TableCell className="text-right">{g.output_atta ?? "—"} kg</TableCell>
                <TableCell><Badge variant="outline">{g.payment_method || "Cash"}{g.payment_method === "Grain" && g.grain_fee_kg ? ` (${g.grain_fee_kg}kg)` : ""}</Badge></TableCell>
                <TableCell className="text-right font-medium">{money(g.total_charge)}</TableCell>
                <TableCell
                  className={g.payment_status !== "Paid" ? "cursor-pointer" : ""}
                  onClick={() => g.payment_status !== "Paid" && setPayFor(g)}
                  title={g.payment_status !== "Paid" ? "Click to record a payment" : ""}
                  data-testid={`grinding-status-${g.id}`}
                ><StatusBadge status={g.payment_status} balance={g.balance_due} /></TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  {g.payment_status !== "Paid" && <Button variant="ghost" size="icon" onClick={() => setPayFor(g)} data-testid={`pay-grinding-${g.id}`}><IndianRupee className="h-4 w-4 text-secondary" /></Button>}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(g)} data-testid={`edit-grinding-${g.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => downloadFile(`/invoices/${g.id}/pdf`, `${g.invoice_number}.pdf`)} data-testid={`pdf-grinding-${g.id}`}><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => grinding.remove(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No grinding orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
