import { useState } from "react";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import api, { money, today, downloadFile, formatApiErrorDetail } from "@/lib/api";
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
import { PartySelect } from "@/components/PartySelect";
import { toast } from "sonner";

const blankLine = () => ({ product_id: "", quantity: "", rate: "", discount_percent: "", gst_percent: "" });

const empty = () => ({
  date: today(), customer_name: "", items: [blankLine()],
  payment_status: "Paid", amount_paid: "", payment_mode: "Cash", round_off: true,
});

export default function Sales() {
  const sales = useList("/sales");
  const products = useList("/products");
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(sales.items, q, ["customer_name", "product_name", "invoice_number", "payment_status", "date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(empty());
  const [payFor, setPayFor] = useState(null);

  // Products are not all measured in kg — oil is litres, packing is bags — so
  // every quantity is labelled with the unit of the product it belongs to.
  const unitOf = (productId, fallback = "") => products.items.find((p) => p.id === productId)?.unit || fallback;

  // A sale from before invoices could hold several products has no items array,
  // so fall back to its single product.
  const linesOf = (s) => (s.items?.length ? s.items
    : [{ product_id: s.product_id, product_name: s.product_name, quantity: s.quantity, unit: unitOf(s.product_id) }]);
  const lineSummary = (s) => {
    const l = linesOf(s);
    return l.length === 1 ? l[0].product_name : `${l[0].product_name} +${l.length - 1} more`;
  };
  const lineQty = (s) => {
    const l = linesOf(s);
    return l.length === 1
      ? `${l[0].quantity} ${l[0].unit || unitOf(l[0].product_id)}`.trim()
      : `${l.reduce((t, i) => t + (i.quantity || 0), 0)} across ${l.length}`;
  };

  const openNew = () => { setEditingId(null); setF(empty()); setOpen(true); };
  const openEdit = (s) => {
    setEditingId(s.id);
    // Sales made before invoices could hold several products have no items
    // array, so present the single product as one line.
    const lines = (s.items?.length ? s.items : [{ product_id: s.product_id, quantity: s.quantity, rate: s.price }])
      .map((i) => ({
        product_id: i.product_id || "",
        quantity: String(i.quantity ?? ""),
        rate: String(i.rate ?? ""),
        discount_percent: i.discount_percent ? String(i.discount_percent) : "",
        gst_percent: i.gst_percent ? String(i.gst_percent) : "",
      }));
    setF({ date: s.date, customer_name: s.customer_name, items: lines,
           payment_status: s.payment_status, amount_paid: "",
           payment_mode: s.payment_mode || "Cash", round_off: s.round_off !== undefined });
    setOpen(true);
  };

  const setLine = (idx, patch) =>
    setF((prev) => ({ ...prev, items: prev.items.map((l, i) => (i === idx ? { ...l, ...patch } : l)) }));
  const addLine = () => setF((prev) => ({ ...prev, items: [...prev.items, blankLine()] }));
  const removeLine = (idx) =>
    setF((prev) => ({ ...prev, items: prev.items.length === 1 ? prev.items : prev.items.filter((_, i) => i !== idx) }));

  // Mirrors the backend so the operator sees the invoice before saving.
  const priced = f.items.map((l) => {
    const qty = +l.quantity || 0;
    const rate = +l.rate || 0;
    const amount = qty * rate;
    const discount = amount * (+l.discount_percent || 0) / 100;
    const taxable = amount - discount;
    const gst = taxable * (+l.gst_percent || 0) / 100;
    return { ...l, qty, rate, amount, discount, taxable, gst, total: taxable + gst };
  });
  const subtotal = priced.reduce((t, l) => t + l.amount, 0);
  const discountTotal = priced.reduce((t, l) => t + l.discount, 0);
  const gstTotal = priced.reduce((t, l) => t + l.gst, 0);
  const net = subtotal - discountTotal + gstTotal;
  const grandTotal = f.round_off ? Math.round(net) : +net.toFixed(2);

  const save = async () => {
    if (!f.customer_name) return toast.error("Choose the customer");
    const lines = f.items.filter((l) => l.product_id && +l.quantity > 0);
    if (!lines.length) return toast.error("Add at least one product");
    const body = {
      date: f.date, customer_name: f.customer_name, payment_status: f.payment_status,
      round_off: f.round_off,
      items: lines.map((l) => ({
        product_id: l.product_id, quantity: +l.quantity, rate: +l.rate || 0,
        discount_percent: +l.discount_percent || 0, gst_percent: +l.gst_percent || 0,
      })),
    };
    // Only sent when creating: edits must not re-credit a bill that already has payments.
    if (!editingId) {
      body.amount_paid = f.payment_status === "Paid" ? null : (f.payment_status === "Partial" ? +f.amount_paid || 0 : 0);
      body.payment_mode = f.payment_mode;
    }
    try {
      if (editingId) { await api.put(`/sales/${editingId}`, body); toast.success("Sale updated"); }
      else { await api.post("/sales", body); toast.success("Sale recorded, stock deducted"); }
    } catch (e) {
      return toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
    setOpen(false); setEditingId(null); setF(empty());
    sales.load(); products.load();
  };

  const saleTotal = grandTotal;
  // What the customer hands over now, and what is left owing.
  const paidNow = f.payment_status === "Paid" ? grandTotal
    : f.payment_status === "Partial" ? Math.min(+f.amount_paid || 0, grandTotal) : 0;
  const dueNow = +(grandTotal - paidNow).toFixed(2);

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
                <PartySelect kind="customer" value={f.customer_name}
                    onChange={(v) => setF({ ...f, customer_name: v })}
                    items={customers.items} onCreated={() => customers.load()}
                    testid="sale-customer" />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Products</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine} data-testid="add-line-btn">
                  <Plus className="h-4 w-4 mr-1" /> Add product
                </Button>
              </div>

              <div className="space-y-3">
                {f.items.map((line, idx) => {
                  const unit = unitOf(line.product_id, "");
                  const inStock = products.items.find((p) => p.id === line.product_id)?.current_stock;
                  return (
                    <div key={idx} className="rounded-lg border border-border/60 p-3 space-y-2" data-testid={`sale-line-${idx}`}>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <Select value={line.product_id}
                            onValueChange={(v) => setLine(idx, { product_id: v, rate: String(products.items.find((p) => p.id === v)?.rate ?? "") })}>
                            <SelectTrigger className="h-11" data-testid={`sale-product-${idx}`}><SelectValue placeholder="Select product" /></SelectTrigger>
                            <SelectContent>
                              {products.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        {f.items.length > 1 && (
                          <Button type="button" variant="ghost" size="icon" className="h-11 w-11"
                            onClick={() => removeLine(idx)} data-testid={`remove-line-${idx}`}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs">Qty {unit && `(${unit})`}</Label>
                          <Input type="number" value={line.quantity} onChange={(e) => setLine(idx, { quantity: e.target.value })} className="h-10 mt-1" data-testid={`sale-qty-${idx}`} />
                        </div>
                        <div>
                          <Label className="text-xs">Rate ₹{unit && `/${unit}`}</Label>
                          <Input type="number" value={line.rate} onChange={(e) => setLine(idx, { rate: e.target.value })} className="h-10 mt-1" data-testid={`sale-rate-${idx}`} />
                        </div>
                        <div>
                          <Label className="text-xs">Discount %</Label>
                          <Input type="number" value={line.discount_percent} onChange={(e) => setLine(idx, { discount_percent: e.target.value })} className="h-10 mt-1" data-testid={`sale-discount-${idx}`} />
                        </div>
                        <div>
                          <Label className="text-xs">GST %</Label>
                          <Input type="number" value={line.gst_percent} onChange={(e) => setLine(idx, { gst_percent: e.target.value })} className="h-10 mt-1" data-testid={`sale-gst-${idx}`} />
                        </div>
                      </div>

                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>
                          {inStock != null && `${inStock} ${unit} in stock`}
                          {inStock != null && +line.quantity > inStock && (
                            <span className="text-destructive font-medium"> — not enough</span>
                          )}
                        </span>
                        <span className="font-semibold text-foreground">{money(priced[idx]?.total || 0)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
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
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1" data-testid="sale-totals">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total quantity</span>
                <span data-testid="sale-total-qty">
                  {/* Grouped by unit: adding kg to litre to bags gives a number
                      that means nothing. */}
                  {Object.entries(priced.reduce((acc, l) => {
                    const u = unitOf(l.product_id) || "";
                    if (l.qty) acc[u] = +( (acc[u] || 0) + l.qty ).toFixed(3);
                    return acc;
                  }, {})).map(([u, q]) => `${q} ${u}`).join(" · ") || "—"}
                </span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{money(subtotal)}</span></div>
              {discountTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="text-destructive">−{money(discountTotal)}</span></div>}
              {gstTotal > 0 && <div className="flex justify-between"><span className="text-muted-foreground">GST</span><span>{money(gstTotal)}</span></div>}
              {f.round_off && Math.abs(grandTotal - net) > 0.004 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Rounding</span><span>{money(grandTotal - net)}</span></div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-border/60 pt-1 mt-1">
                <span>Grand total</span><span data-testid="sale-grand-total">{money(grandTotal)}</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paid</span>
                <span data-testid="sale-paid">{money(paidNow)}</span></div>
              <div className="flex justify-between font-semibold"><span>Due</span>
                <span className={dueNow > 0 ? "text-destructive" : ""} data-testid="sale-due">{money(dueNow)}</span></div>
            </div>
            <p className="text-sm text-muted-foreground">
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

      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Product</TableHead>
            <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id} className="hover:bg-muted/50" data-testid={`sale-row-${s.id}`}>
                <TableCell className="font-mono text-xs">{s.invoice_number}</TableCell><TableCell>{s.date}</TableCell>
                <TableCell className="font-medium">{s.customer_name}</TableCell>
                <TableCell>
                  {lineSummary(s)}
                  {(s.items?.length || 1) > 1 && (
                    <Badge variant="outline" className="ml-1 text-[10px]">{s.items.length} items</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">{lineQty(s)}</TableCell><TableCell className="text-right font-medium">{money(s.total)}</TableCell>
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
