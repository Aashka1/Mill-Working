import { useState } from "react";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import api, { money, today, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Download, FileDown, Pencil, IndianRupee } from "lucide-react";
import { PaymentDialog } from "@/components/PaymentDialog";
import { toast } from "sonner";

const empty = { date: today(), customer_name: "", product_id: "", product_name: "", quantity: "", price: "", payment_status: "Paid", amount_paid: "", payment_mode: "Cash" };

export default function Sales() {
  const sales = useList("/sales");
  const products = useList("/products");
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(sales.items, q, ["customer_name", "product_name", "invoice_number", "payment_status", "date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(empty);
  const [payFor, setPayFor] = useState(null);

  // Products are not all measured in kg — oil is litres, packing is bags — so
  // every quantity is labelled with the unit of the product it belongs to.
  const unitOf = (productId, fallback = "") => products.items.find((p) => p.id === productId)?.unit || fallback;
  const selectedUnit = unitOf(f.product_id, "unit");

  const openNew = () => { setEditingId(null); setF(empty); setOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.id);
    setF({ date: s.date, customer_name: s.customer_name, product_id: s.product_id, product_name: s.product_name, quantity: String(s.quantity), price: String(s.price), payment_status: s.payment_status, amount_paid: "", payment_mode: s.payment_mode || "Cash" });
    setOpen(true);
  };

  const save = async () => {
    const prod = products.items.find((p) => p.id === f.product_id);
    if (!prod || !f.customer_name || !f.quantity || !f.price) return toast.error("Fill all fields");
    if (!editingId && +f.quantity > prod.current_stock) return toast.error(`Only ${prod.current_stock} ${prod.unit} in stock`);
    const body = { date: f.date, customer_name: f.customer_name, product_id: prod.id, product_name: prod.name, quantity: +f.quantity, price: +f.price, payment_status: f.payment_status };
    // Only sent when creating: edits must not re-credit a bill that already has payments.
    if (!editingId) {
      body.amount_paid = f.payment_status === "Paid" ? null : (f.payment_status === "Partial" ? +f.amount_paid || 0 : 0);
      body.payment_mode = f.payment_mode;
    }
    if (editingId) { await api.put(`/sales/${editingId}`, body); toast.success("Sale updated"); }
    else { await api.post("/sales", body); toast.success("Sale recorded, stock deducted"); }
    setOpen(false); setEditingId(null); setF(empty);
    sales.load(); products.load();
  };

  const saleTotal = (+f.quantity || 0) * (+f.price || 0);

  return (
    <div>
      <PageToolbar
        title="Sales Management" subtitle="Record product sales and deduct stock"
        search={q} setSearch={setQ} searchTestid="search-sales"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => downloadFile("/export/sales", "sales_report.xlsx")} data-testid="export-sales-btn"><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
            <Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-sale-btn"><Plus className="h-4 w-4 mr-1" /> New Sale</Button>
          </>
        }
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Record"} Sale</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
              <div><Label>Customer</Label>
                <Select value={f.customer_name} onValueChange={(v) => setF({ ...f, customer_name: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="sale-customer"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{customers.items.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                    {customers.items.length === 0 && <SelectItem value="Walk-in">Walk-in Customer</SelectItem>}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Product</Label>
              <Select value={f.product_id} onValueChange={(v) => setF({ ...f, product_id: v, price: products.items.find((p) => p.id === v)?.rate || "" })}>
                <SelectTrigger className="h-11 mt-1" data-testid="sale-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quantity ({selectedUnit})</Label><Input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className="h-11 mt-1" data-testid="sale-qty" /></div>
              <div><Label>Price ₹/{selectedUnit}</Label><Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="h-11 mt-1" data-testid="sale-price" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Payment</Label>
                <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="sale-payment"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Paid">Paid in full</SelectItem>
                    <SelectItem value="Partial">Part payment</SelectItem>
                    <SelectItem value="Pending">Nothing paid yet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!editingId && f.payment_status === "Partial" && (
                <div><Label>Amount received</Label>
                  <Input type="number" value={f.amount_paid} onChange={(e) => setF({ ...f, amount_paid: e.target.value })} className="h-11 mt-1" data-testid="sale-amount-paid" />
                </div>
              )}
              {/* Only ask how the money arrived when some of it actually did. */}
              {!editingId && f.payment_status !== "Pending" && (
                <div><Label>Paid by</Label>
                  <Select value={f.payment_mode} onValueChange={(v) => setF({ ...f, payment_mode: v })}>
                    <SelectTrigger className="h-11 mt-1" data-testid="sale-payment-mode"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank">Bank transfer</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-bold text-foreground">{money(saleTotal)}</span>
              {!editingId && f.payment_status === "Partial" && (
                <> · Balance after payment: <span className="font-bold text-foreground">{money(Math.max(saleTotal - (+f.amount_paid || 0), 0))}</span></>
              )}
            </p>
            {editingId && <p className="text-xs text-muted-foreground">Payments already recorded stay as they are. Use the ₹ button on the row to take another.</p>}
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-sale-btn">{editingId ? "Update" : "Save"} Sale</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} record={payFor} path="sales" onDone={() => sales.load()} />

      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Product</TableHead>
            <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id} className="hover:bg-muted/50" data-testid={`sale-row-${s.id}`}>
                <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell><TableCell>{s.date}</TableCell>
                <TableCell className="font-medium">{s.customer_name}</TableCell><TableCell>{s.product_name}</TableCell>
                <TableCell className="text-right">{s.quantity} {unitOf(s.product_id)}</TableCell><TableCell className="text-right font-medium">{money(s.total)}</TableCell>
                <TableCell className="space-x-1">
                  <StatusBadge status={s.payment_status} balance={s.balance_due} />
                  {s.payment_status !== "Pending" && s.payment_mode && <Badge variant="outline" className="text-[10px]">{s.payment_mode}</Badge>}
                </TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  {s.payment_status !== "Paid" && <Button variant="ghost" size="icon" onClick={() => setPayFor(s)} data-testid={`pay-sale-${s.id}`}><IndianRupee className="h-4 w-4 text-secondary" /></Button>}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)} data-testid={`edit-sale-${s.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => downloadFile(`/invoices/${s.id}/pdf`, `${s.invoice_number}.pdf`)} data-testid={`pdf-sale-${s.id}`}><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => sales.remove(s.id).then(() => products.load())}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No sales yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
