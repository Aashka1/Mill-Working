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
import { Plus, Trash2, Download, FileDown, Info, Pencil, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const SEEDS = ["Mustard", "Groundnut", "Sesame", "Coconut", "Sunflower", "Other"];
const empty = { date: today(), customer_name: "", seed_type: "Mustard", quantity_received: "", oil_extracted: "", oil_cake_produced: "", charge: "", payment_method: "Cash", retained_oil: "", retained_cake: "", payment_status: "Pending" };

export default function OilExtraction() {
  const oil = useList("/oil");
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(oil.items, q, ["customer_name", "seed_type", "invoice_number", "payment_status", "date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(empty);

  const openNew = () => { setEditingId(null); setF(empty); setOpen(true); };
  const openEdit = (o) => {
    setEditingId(o.id);
    setF({ date: o.date, customer_name: o.customer_name, seed_type: o.seed_type, quantity_received: String(o.quantity_received), oil_extracted: String(o.oil_extracted), oil_cake_produced: String(o.oil_cake_produced || ""), charge: String(o.charge), payment_method: o.payment_method || "Cash", retained_oil: String(o.retained_oil || ""), retained_cake: String(o.retained_cake || ""), payment_status: o.payment_status });
    setOpen(true);
  };

  const save = async () => {
    if (!f.customer_name || !f.quantity_received) return toast.error("Fill all fields");
    const body = { date: f.date, customer_name: f.customer_name, seed_type: f.seed_type, quantity_received: +f.quantity_received, oil_extracted: +(f.oil_extracted || 0), oil_cake_produced: +(f.oil_cake_produced || 0), charge: +(f.charge || 0), payment_method: f.payment_method, retained_oil: +(f.retained_oil || 0), retained_cake: +(f.retained_cake || 0), payment_status: f.payment_status };
    if (editingId) { await api.put(`/oil/${editingId}`, body); toast.success("Order updated"); }
    else { await api.post("/oil", body); toast.success("Oil extraction order recorded"); }
    setOpen(false); setEditingId(null); setF(empty);
    oil.load();
  };

  const markPaid = async (o) => { await api.patch(`/oil/${o.id}/pay`, { payment_method: o.payment_method || "Cash" }); toast.success("Marked as paid"); oil.load(); };

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
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "New"} Oil Extraction Order</DialogTitle></DialogHeader>
          <div className="space-y-4">
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
            <div><Label>Payment Status</Label>
              <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}>
                <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Pending">Pending</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-oil-btn">{editingId ? "Update" : "Save"} Order</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3"><Info className="h-4 w-4" /> Customer-owned seeds — only retained oil/cake affects shop inventory.</div>
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
                <TableCell className="text-right font-medium">{money(o.charge)}</TableCell><TableCell><StatusBadge status={o.payment_status} /></TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  {o.payment_status === "Pending" && <Button variant="ghost" size="icon" onClick={() => markPaid(o)} data-testid={`pay-oil-${o.id}`}><CheckCircle2 className="h-4 w-4 text-secondary" /></Button>}
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
