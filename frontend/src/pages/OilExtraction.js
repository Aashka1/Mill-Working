import { useState } from "react";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import api, { money, today, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Download, FileDown, Info, Pencil, IndianRupee } from "lucide-react";
import { PaymentDialog } from "@/components/PaymentDialog";
import { toast } from "sonner";

const SEEDS = ["Mustard", "Groundnut", "Sesame", "Coconut", "Sunflower", "Other"];
const empty = { date: today(), customer_name: "", seed_type: "Mustard", quantity_received: "", oil_extracted: "", oil_cake_produced: "", charge: "", payment_method: "Cash", retained_oil: "", retained_cake: "", cake_sold_to_shop: "", cake_rate: "", payment_status: "Pending", amount_paid: "" };

export default function OilExtraction() {
  const oil = useList("/oil");
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(oil.items, q, ["customer_name", "seed_type", "invoice_number", "payment_status", "date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(empty);
  const [payFor, setPayFor] = useState(null);

  const openNew = () => { setEditingId(null); setF(empty); setOpen(true); };
  const openEdit = (o) => {
    setEditingId(o.id);
    setF({ date: o.date, customer_name: o.customer_name, seed_type: o.seed_type, quantity_received: String(o.quantity_received), oil_extracted: String(o.oil_extracted), oil_cake_produced: String(o.oil_cake_produced || ""), charge: String(o.charge), payment_method: o.payment_method || "Cash", retained_oil: String(o.retained_oil || ""), retained_cake: String(o.retained_cake || ""), cake_sold_to_shop: String(o.cake_sold_to_shop || ""), cake_rate: String(o.cake_rate || ""), payment_status: o.payment_status, amount_paid: "" });
    setOpen(true);
  };

  const save = async () => {
    if (!f.customer_name || !f.quantity_received) return toast.error("Fill all fields");
    const body = { date: f.date, customer_name: f.customer_name, seed_type: f.seed_type, quantity_received: +f.quantity_received, oil_extracted: +(f.oil_extracted || 0), oil_cake_produced: +(f.oil_cake_produced || 0), charge: +(f.charge || 0), payment_method: f.payment_method, retained_oil: +(f.retained_oil || 0), retained_cake: +(f.retained_cake || 0), cake_sold_to_shop: +(f.cake_sold_to_shop || 0), cake_rate: +(f.cake_rate || 0), payment_status: f.payment_status };
    if (!editingId) body.amount_paid = f.payment_status === "Paid" ? null : (f.payment_status === "Partial" ? +f.amount_paid || 0 : 0);
    try {
      if (editingId) { await api.put(`/oil/${editingId}`, body); toast.success("Order updated"); }
      else { await api.post("/oil", body); toast.success("Oil extraction order recorded"); }
    } catch (err) {
      return toast.error(err.response?.data?.detail || "Failed to save");
    }
    setOpen(false); setEditingId(null); setF(empty);
    oil.load();
  };

  const cakeValue = (+f.cake_sold_to_shop || 0) * (+f.cake_rate || 0);
  const netPayable = (+f.charge || 0) - cakeValue;
  const cakeOver = (+f.retained_cake || 0) + (+f.cake_sold_to_shop || 0) > (+f.oil_cake_produced || 0) + 0.009;



  return (
    <div>
      <PageToolbar
        title="Oil Extraction Service" subtitle="Customer-owned seeds — cash or retain oil/cake as fee"
        search={q} setSearch={setQ} searchTestid="search-oil"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => downloadFile("/export/oil", "oil_report.xlsx")} data-testid="export-oil-btn"><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
            <Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-oil-btn"><Plus className="h-4 w-4 mr-1" /> New Order</Button>
          </>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        {/* See Grinding.js: same capped-height layout, needed here too now the
            form carries the cake-purchase and part-payment fields. */}
        <DialogContent className="max-w-lg max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto]">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "New"} Oil Extraction Order</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
              <div><Label>Customer</Label>
                <Select value={f.customer_name} onValueChange={(v) => setF({ ...f, customer_name: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="oil-customer"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{customers.items.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    {customers.items.length === 0 && <SelectItem value="Walk-in">Walk-in Customer</SelectItem>}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Seed Type</Label>
              <Select value={f.seed_type} onValueChange={(v) => setF({ ...f, seed_type: v })}>
                <SelectTrigger className="h-11 mt-1" data-testid="oil-seed"><SelectValue /></SelectTrigger>
                <SelectContent>{SEEDS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Seeds (kg)</Label><Input type="number" value={f.quantity_received} onChange={(e) => setF({ ...f, quantity_received: e.target.value })} className="h-11 mt-1" data-testid="oil-qty" /></div>
              <div><Label>Oil (L)</Label><Input type="number" value={f.oil_extracted} onChange={(e) => setF({ ...f, oil_extracted: e.target.value })} className="h-11 mt-1" data-testid="oil-extracted" /></div>
              <div><Label>Cake (kg)</Label><Input type="number" value={f.oil_cake_produced} onChange={(e) => setF({ ...f, oil_cake_produced: e.target.value })} className="h-11 mt-1" data-testid="oil-cake" /></div>
            </div>
            <div><Label>Payment Method</Label>
              <Select value={f.payment_method} onValueChange={(v) => setF({ ...f, payment_method: v })}>
                <SelectTrigger className="h-11 mt-1" data-testid="oil-pay-method"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Cash">Cash</SelectItem><SelectItem value="Oil">Retain Oil</SelectItem><SelectItem value="Cake">Retain Cake</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Cash Charge ₹</Label><Input type="number" value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value })} className="h-11 mt-1" data-testid="oil-charge" /></div>
              {f.payment_method === "Oil" && <div><Label>Oil kept (L)</Label><Input type="number" value={f.retained_oil} onChange={(e) => setF({ ...f, retained_oil: e.target.value })} className="h-11 mt-1" data-testid="oil-retained-oil" /></div>}
              {f.payment_method === "Cake" && <div><Label>Cake kept (kg)</Label><Input type="number" value={f.retained_cake} onChange={(e) => setF({ ...f, retained_cake: e.target.value })} className="h-11 mt-1" data-testid="oil-retained-cake" /></div>}
            </div>
            <div className="rounded-lg border border-border/60 p-3 space-y-3">
              <p className="text-sm font-medium">Customer sells cake to the shop</p>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Cake bought (kg)</Label><Input type="number" value={f.cake_sold_to_shop} onChange={(e) => setF({ ...f, cake_sold_to_shop: e.target.value })} className="h-11 mt-1" data-testid="oil-cake-sold" /></div>
                <div><Label>Rate ₹/kg</Label><Input type="number" value={f.cake_rate} onChange={(e) => setF({ ...f, cake_rate: e.target.value })} className="h-11 mt-1" data-testid="oil-cake-rate" /></div>
              </div>
              <p className="text-xs text-muted-foreground">
                Charge {money(+f.charge || 0)} − cake {money(cakeValue)} ={" "}
                <b className={netPayable < 0 ? "text-destructive" : "text-foreground"} data-testid="oil-net">{money(netPayable)}</b>
                {netPayable < 0 && " — the shop owes the customer this amount"}
                {cakeOver && <span className="text-destructive"> · only {f.oil_cake_produced || 0} kg of cake was produced</span>}
              </p>
            </div>
            {netPayable < 0 ? (
              // Nothing to collect: the cake outweighed the charge, so the shop
              // pays out. Offering Paid/Partial/Pending here would be nonsense.
              <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-3" data-testid="oil-payout-notice">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                  Paid to Customer · {money(Math.abs(netPayable))}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  The cake is worth more than the grinding, so this leaves the cash drawer.
                  It is recorded as money paid out, not as anything owed to the shop.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Payment Status</Label>
                <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="oil-payment-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid in full</SelectItem>
                    <SelectItem value="Partial">Part payment</SelectItem>
                    <SelectItem value="Pending">Nothing paid yet</SelectItem>
                  </SelectContent>
                </Select>
                </div>
                {!editingId && f.payment_status === "Partial" && (
                  <div><Label>Amount received</Label>
                    <Input type="number" value={f.amount_paid} onChange={(e) => setF({ ...f, amount_paid: e.target.value })} className="h-11 mt-1" data-testid="oil-amount-paid" />
                    <p className="text-xs text-muted-foreground mt-1">Balance {money(Math.max(netPayable - (+f.amount_paid || 0), 0))}</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-oil-btn">{editingId ? "Update" : "Save"} Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3"><Info className="h-4 w-4" /> Customer-owned seeds — only retained oil/cake affects shop inventory.</div>
      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} record={payFor} path="oil" onDone={() => oil.load()} />

      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Seed</TableHead>
            <TableHead className="text-right">Oil (L)</TableHead><TableHead className="text-right">Cake (kg)</TableHead>
            <TableHead>Payment</TableHead><TableHead className="text-right">Charge</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id} className="hover:bg-muted/50" data-testid={`oil-row-${o.id}`}>
                <TableCell className="font-mono text-xs">{o.invoice_number}</TableCell><TableCell>{o.date}</TableCell>
                <TableCell className="font-medium">{o.customer_name}</TableCell><TableCell>{o.seed_type}</TableCell>
                <TableCell className="text-right">{o.oil_extracted} L</TableCell><TableCell className="text-right">{o.oil_cake_produced || 0} kg</TableCell>
                <TableCell><Badge variant="outline">{o.payment_method || "Cash"}</Badge></TableCell>
                <TableCell className="text-right font-medium">{money(o.total ?? o.charge)}
                  {o.cake_sold_to_shop > 0 && <span className="block text-[10px] text-muted-foreground">{money(o.charge)} − cake {money(o.cake_value || 0)}</span>}
                </TableCell><TableCell><StatusBadge status={o.payment_status} balance={o.balance_due} paidToCustomer={o.paid_to_customer} /></TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  {o.payment_status !== "Paid" && o.payment_status !== "Paid to Customer" && <Button variant="ghost" size="icon" onClick={() => setPayFor(o)} data-testid={`pay-oil-${o.id}`}><IndianRupee className="h-4 w-4 text-secondary" /></Button>}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(o)} data-testid={`edit-oil-${o.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => downloadFile(`/invoices/${o.id}/pdf`, `${o.invoice_number}.pdf`)} data-testid={`pdf-oil-${o.id}`}><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => oil.remove(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No oil extraction orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
