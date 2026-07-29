import { useState } from "react";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import { money, today } from "@/lib/api";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function Inventory() {
  const products = useList("/products");
  const purchases = useList("/purchases");
  const suppliers = useList("/suppliers");
  const [q, setQ] = useState("");
  const [pq, setPq] = useState("");
  const filtered = useFilter(products.items, q, ["name", "category"]);
  const fPurch = useFilter(purchases.items, pq, ["supplier_name", "product_name", "date"]);

  const [prodOpen, setProdOpen] = useState(false);
  const [pf, setPf] = useState({ name: "", category: "Wheat", unit: "kg", current_stock: 0, rate: 0, low_stock_threshold: 50 });
  const saveProduct = async () => {
    if (!pf.name) return toast.error("Enter product name");
    await products.create({ ...pf, current_stock: +pf.current_stock, rate: +pf.rate, low_stock_threshold: +pf.low_stock_threshold });
    setProdOpen(false);
    setPf({ name: "", category: "Wheat", unit: "kg", current_stock: 0, rate: 0, low_stock_threshold: 50 });
  };

  const [purOpen, setPurOpen] = useState(false);
  const [buf, setBuf] = useState({ date: today(), supplier_name: "", product_id: "", quantity: "", rate: "", payment_status: "Paid" });
  const savePurchase = async () => {
    const prod = products.items.find((p) => p.id === buf.product_id);
    if (!prod || !buf.supplier_name || !buf.quantity || !buf.rate) return toast.error("Fill all fields");
    await api.post("/purchases", {
      date: buf.date, supplier_name: buf.supplier_name, product_id: prod.id, product_name: prod.name,
      quantity: +buf.quantity, rate: +buf.rate, payment_status: buf.payment_status,
    });
    toast.success("Purchase recorded, stock updated");
    setPurOpen(false);
    setBuf({ date: today(), supplier_name: "", product_id: "", quantity: "", rate: "", payment_status: "Paid" });
    products.load(); purchases.load();
  };

  return (
    <div>
      <PageToolbar title="Inventory Management" subtitle="Shop-owned stock and purchases" />
      <Tabs defaultValue="stock">
        <TabsList className="mb-6">
          <TabsTrigger value="stock" data-testid="tab-stock">Current Stock</TabsTrigger>
          <TabsTrigger value="purchases" data-testid="tab-purchases">Purchases</TabsTrigger>
        </TabsList>

        <TabsContent value="stock">
          <div className="flex justify-between items-center mb-4">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="h-11 max-w-xs" data-testid="search-products" />
            <Dialog open={prodOpen} onOpenChange={setProdOpen}>
              <DialogTrigger asChild>
                <Button className="h-11 active:scale-95 transition-transform" data-testid="add-product-btn"><Plus className="h-4 w-4 mr-1" /> Add Product</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name</Label><Input value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} className="h-11 mt-1" data-testid="product-name" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Category</Label>
                      <Select value={pf.category} onValueChange={(v) => setPf({ ...pf, category: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="product-category"><SelectValue /></SelectTrigger>
                        <SelectContent>{["Wheat", "Oil Seeds", "Edible Oil", "Flour", "Other"].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Unit</Label>
                      <Select value={pf.unit} onValueChange={(v) => setPf({ ...pf, unit: v })}>
                        <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{["kg", "litre", "quintal", "bag"].map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div><Label>Opening Stock</Label><Input type="number" value={pf.current_stock} onChange={(e) => setPf({ ...pf, current_stock: e.target.value })} className="h-11 mt-1" data-testid="product-stock" /></div>
                    <div><Label>Rate ₹</Label><Input type="number" value={pf.rate} onChange={(e) => setPf({ ...pf, rate: e.target.value })} className="h-11 mt-1" /></div>
                    <div><Label>Low Alert</Label><Input type="number" value={pf.low_stock_threshold} onChange={(e) => setPf({ ...pf, low_stock_threshold: e.target.value })} className="h-11 mt-1" /></div>
                  </div>
                </div>
                <DialogFooter><Button onClick={saveProduct} data-testid="save-product-btn">Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="border-border/60">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Product</TableHead><TableHead>Category</TableHead><TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Rate</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {filtered.map((p) => {
                  const low = p.current_stock <= p.low_stock_threshold;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/50" data-testid={`product-row-${p.id}`}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.category}</TableCell>
                      <TableCell className="text-right">{p.current_stock} {p.unit}</TableCell>
                      <TableCell className="text-right">{money(p.rate)}</TableCell>
                      <TableCell>{low ? <Badge variant="outline" className="text-destructive border-destructive/30">Low</Badge> : <Badge variant="outline" className="text-secondary border-secondary/30">OK</Badge>}</TableCell>
                      <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => products.remove(p.id)} data-testid={`del-product-${p.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No products yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <div className="flex justify-between items-center mb-4">
            <Input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Search purchases..." className="h-11 max-w-xs" data-testid="search-purchases" />
            <Dialog open={purOpen} onOpenChange={setPurOpen}>
              <DialogTrigger asChild>
                <Button className="h-11 active:scale-95 transition-transform" data-testid="add-purchase-btn"><Plus className="h-4 w-4 mr-1" /> Record Purchase</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Record Purchase</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Date</Label><Input type="date" value={buf.date} onChange={(e) => setBuf({ ...buf, date: e.target.value })} className="h-11 mt-1" /></div>
                    <div><Label>Supplier</Label>
                      <Select value={buf.supplier_name} onValueChange={(v) => setBuf({ ...buf, supplier_name: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="purchase-supplier"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{suppliers.items.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                          {suppliers.items.length === 0 && <SelectItem value="Walk-in">Walk-in Supplier</SelectItem>}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Product</Label>
                    <Select value={buf.product_id} onValueChange={(v) => setBuf({ ...buf, product_id: v })}>
                      <SelectTrigger className="h-11 mt-1" data-testid="purchase-product"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>{products.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Quantity (kg)</Label><Input type="number" value={buf.quantity} onChange={(e) => setBuf({ ...buf, quantity: e.target.value })} className="h-11 mt-1" data-testid="purchase-qty" /></div>
                    <div><Label>Rate ₹/unit</Label><Input type="number" value={buf.rate} onChange={(e) => setBuf({ ...buf, rate: e.target.value })} className="h-11 mt-1" data-testid="purchase-rate" /></div>
                  </div>
                  <div><Label>Payment</Label>
                    <Select value={buf.payment_status} onValueChange={(v) => setBuf({ ...buf, payment_status: v })}>
                      <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Pending">Pending</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-foreground">{money((+buf.quantity || 0) * (+buf.rate || 0))}</span></p>
                </div>
                <DialogFooter><Button onClick={savePurchase} data-testid="save-purchase-btn">Save Purchase</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
          <Card className="border-border/60">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Supplier</TableHead><TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Rate</TableHead>
                <TableHead className="text-right">Total</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {fPurch.map((p) => (
                  <TableRow key={p.id} className="hover:bg-muted/50">
                    <TableCell>{p.date}</TableCell><TableCell>{p.supplier_name}</TableCell><TableCell>{p.product_name}</TableCell>
                    <TableCell className="text-right">{p.quantity} kg</TableCell><TableCell className="text-right">{money(p.rate)}</TableCell>
                    <TableCell className="text-right font-medium">{money(p.total)}</TableCell><TableCell><StatusBadge status={p.payment_status} /></TableCell>
                    <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => purchases.remove(p.id).then(() => products.load())}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                  </TableRow>
                ))}
                {fPurch.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No purchases yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
