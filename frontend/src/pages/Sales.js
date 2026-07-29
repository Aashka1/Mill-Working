import { useState } from "react";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import api, { money, today, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Download, FileDown } from "lucide-react";
import { toast } from "sonner";

export default function Sales() {
  const sales = useList("/sales");
  const products = useList("/products");
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(sales.items, q, ["customer_name", "product_name", "invoice_number", "payment_status", "date"]);

  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: today(), customer_name: "", product_id: "", quantity: "", price: "", payment_status: "Paid" });

  const save = async () => {
    const prod = products.items.find((p) => p.id === f.product_id);
    if (!prod || !f.customer_name || !f.quantity || !f.price) return toast.error("Fill all fields");
    if (+f.quantity > prod.current_stock) return toast.error(`Only ${prod.current_stock} ${prod.unit} in stock`);
    await api.post("/sales", {
      date: f.date, customer_name: f.customer_name, product_id: prod.id, product_name: prod.name,
      quantity: +f.quantity, price: +f.price, payment_status: f.payment_status,
    });
    toast.success("Sale recorded, stock deducted");
    setOpen(false);
    setF({ date: today(), customer_name: "", product_id: "", quantity: "", price: "", payment_status: "Paid" });
    sales.load(); products.load();
  };

  return (
    <div>
      <PageToolbar
        title="Sales Management" subtitle="Record product sales and deduct stock"
        search={q} setSearch={setQ} searchTestid="search-sales"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => downloadFile("/export/sales", "sales_report.xlsx")} data-testid="export-sales-btn"><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" data-testid="add-sale-btn"><Plus className="h-4 w-4 mr-1" /> New Sale</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record Sale</DialogTitle></DialogHeader>
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
                    <div><Label>Quantity (kg)</Label><Input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className="h-11 mt-1" data-testid="sale-qty" /></div>
                    <div><Label>Price ₹/unit</Label><Input type="number" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className="h-11 mt-1" data-testid="sale-price" /></div>
                  </div>
                  <div><Label>Payment</Label>
                    <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}>
                      <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Pending">Pending</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-foreground">{money((+f.quantity || 0) * (+f.price || 0))}</span></p>
                </div>
                <DialogFooter><Button onClick={save} data-testid="save-sale-btn">Save Sale</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
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
                <TableCell className="text-right">{s.quantity} kg</TableCell><TableCell className="text-right font-medium">{money(s.total)}</TableCell>
                <TableCell><StatusBadge status={s.payment_status} /></TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
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
