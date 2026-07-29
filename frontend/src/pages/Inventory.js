import { useState } from "react";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import { money, today, formatApiErrorDetail } from "@/lib/api";
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
import { Plus, Trash2, Pencil, Scale, IndianRupee } from "lucide-react";
import { PaymentDialog } from "@/components/PaymentDialog";
import { toast } from "sonner";

// Must cover every category the seeded catalogue uses, or those products cannot
// be created from this form. "Wheat Crop" is the raw grain; "Wheat" was a stale
// label that matched nothing in the data.
const CATEGORIES = ["Wheat Crop", "Flour", "Bran", "Oil Seeds", "Edible Oil", "Oil Cake", "Masala", "Packing", "Other"];

// "pcs" and "bag" both appear on packing items — bags bought loose are counted
// in pieces, bags sold by size are priced per bag.
const UNITS = ["kg", "litre", "quintal", "bag", "pcs"];

const BLANK_PRODUCT = { name: "", category: "Flour", unit: "kg", current_stock: 0, rate: 0, low_stock_threshold: 50 };

// Sentinel for the "buying something new" row in the product dropdown.
const NEW_PRODUCT = "__new_product__";

const blankPurchase = () => ({ date: today(), supplier_name: "", product_id: "", quantity: "", rate: "", payment_status: "Paid", amount_paid: "", new_name: "", new_category: "Other", new_unit: "kg" });

export default function Inventory() {
  const products = useList("/products");
  const purchases = useList("/purchases");
  const suppliers = useList("/suppliers");
  const [q, setQ] = useState("");
  const [pq, setPq] = useState("");
  const filtered = useFilter(products.items, q, ["name", "category"]);
  const fPurch = useFilter(purchases.items, pq, ["supplier_name", "product_name", "date"]);

  const [prodOpen, setProdOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [pf, setPf] = useState({ ...BLANK_PRODUCT });

  const openNewProduct = () => { setEditingProduct(null); setPf({ ...BLANK_PRODUCT }); setProdOpen(true); };
  const openEditProduct = (p) => {
    setEditingProduct(p.id);
    setPf({ name: p.name, category: p.category, unit: p.unit, current_stock: p.current_stock, rate: p.rate, low_stock_threshold: p.low_stock_threshold });
    setProdOpen(true);
  };

  // Stock corrections are relative and audited, kept apart from editing the
  // product's details. Typing an absolute figure into the edit form would
  // overwrite whatever a sale or purchase changed in the meantime.
  const [adjust, setAdjust] = useState(null); // { product, delta, reason }
  const openAdjust = (p) => setAdjust({ product: p, delta: "", reason: "" });
  const saveAdjust = async () => {
    if (!+adjust.delta) return toast.error("Enter a non-zero amount");
    try {
      const { data } = await api.post(`/products/${adjust.product.id}/adjust`, { delta: +adjust.delta, reason: adjust.reason });
      toast.success(`${data.name} is now ${data.current_stock} ${data.unit}`);
    } catch (err) {
      return toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
    setAdjust(null);
    products.load();
  };

  const saveProduct = async () => {
    if (!pf.name) return toast.error("Enter product name");
    const body = { ...pf, current_stock: +pf.current_stock, rate: +pf.rate, low_stock_threshold: +pf.low_stock_threshold };
    try {
      if (editingProduct) {
        await api.put(`/products/${editingProduct}`, body);
        toast.success("Product updated");
      } else {
        // Adding a name that already exists tops that product up instead of
        // creating a second row — say so, so the stock is not entered twice.
        const { data } = await api.post("/products", body);
        toast.success(data.merged
          ? `Added to existing ${data.name} — now ${data.current_stock} ${data.unit}`
          : "Product added");
      }
    } catch (err) {
      return toast.error(formatApiErrorDetail(err.response?.data?.detail) || err.message);
    }
    products.load();
    setProdOpen(false);
    setEditingProduct(null);
    setPf({ ...BLANK_PRODUCT });
  };

  // A product already in the catalogue may use a category or unit that predates
  // these lists; include it so the dropdown shows the real value instead of an
  // empty box.
  const categoryOptions = pf.category && !CATEGORIES.includes(pf.category) ? [...CATEGORIES, pf.category] : CATEGORIES;
  const unitOptions = pf.unit && !UNITS.includes(pf.unit) ? [...UNITS, pf.unit] : UNITS;
  const unitOf = (productId, fallback = "") => products.items.find((p) => p.id === productId)?.unit || fallback;

  const [purOpen, setPurOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState(null);
  const [payFor, setPayFor] = useState(null);
  const [buf, setBuf] = useState(blankPurchase());

  const buyingNew = buf.product_id === NEW_PRODUCT;

  const openNewPurchase = () => { setEditingPurchase(null); setBuf(blankPurchase()); setPurOpen(true); };
  const openEditPurchase = (p) => {
    setEditingPurchase(p.id);
    setBuf({ date: p.date, supplier_name: p.supplier_name, product_id: p.product_id,
             quantity: String(p.quantity), rate: String(p.rate), payment_status: p.payment_status, amount_paid: "" });
    setPurOpen(true);
  };

  const savePurchase = async () => {
    const prod = products.items.find((p) => p.id === buf.product_id);
    if (!buf.supplier_name || !buf.quantity || !buf.rate) return toast.error("Fill all fields");
    if (!prod && !buyingNew) return toast.error("Select a product");
    if (buyingNew && !buf.new_name.trim()) return toast.error("Enter a name for the new item");
    const body = buyingNew
      ? { date: buf.date, supplier_name: buf.supplier_name, product_id: "", product_name: buf.new_name.trim(),
          unit: buf.new_unit, category: buf.new_category,
          quantity: +buf.quantity, rate: +buf.rate, payment_status: buf.payment_status }
      : { date: buf.date, supplier_name: buf.supplier_name, product_id: prod.id, product_name: prod.name,
          quantity: +buf.quantity, rate: +buf.rate, payment_status: buf.payment_status };
    if (!editingPurchase) body.amount_paid = buf.payment_status === "Paid" ? null : (buf.payment_status === "Partial" ? +buf.amount_paid || 0 : 0);
    if (editingPurchase) {
      await api.put(`/purchases/${editingPurchase}`, body);
      toast.success("Purchase updated, stock adjusted");
    } else {
      await api.post("/purchases", body);
      toast.success("Purchase recorded, stock updated");
    }
    setPurOpen(false);
    setEditingPurchase(null);
    setBuf(blankPurchase());
    products.load(); purchases.load();
  };

  const purchaseUnit = buyingNew ? buf.new_unit : unitOf(buf.product_id, "unit");

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
            <Button className="h-11 active:scale-95 transition-transform" onClick={openNewProduct} data-testid="add-product-btn"><Plus className="h-4 w-4 mr-1" /> Add Product</Button>
            <Dialog open={prodOpen} onOpenChange={(o) => { setProdOpen(o); if (!o) setEditingProduct(null); }}>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingProduct ? "Edit" : "Add"} Product</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div><Label>Name</Label><Input value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} className="h-11 mt-1" data-testid="product-name" /></div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Category</Label>
                      <Select value={pf.category} onValueChange={(v) => setPf({ ...pf, category: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="product-category"><SelectValue /></SelectTrigger>
                        <SelectContent>{categoryOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Unit</Label>
                      <Select value={pf.unit} onValueChange={(v) => setPf({ ...pf, unit: v })}>
                        <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{unitOptions.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className={`grid gap-4 ${editingProduct ? "grid-cols-2" : "grid-cols-3"}`}>
                    {!editingProduct && <div><Label>Opening Stock ({pf.unit})</Label><Input type="number" value={pf.current_stock} onChange={(e) => setPf({ ...pf, current_stock: e.target.value })} className="h-11 mt-1" data-testid="product-stock" /></div>}
                    <div><Label>Rate ₹/{pf.unit}</Label><Input type="number" value={pf.rate} onChange={(e) => setPf({ ...pf, rate: e.target.value })} className="h-11 mt-1" /></div>
                    <div><Label>Low Alert</Label><Input type="number" value={pf.low_stock_threshold} onChange={(e) => setPf({ ...pf, low_stock_threshold: e.target.value })} className="h-11 mt-1" /></div>
                  </div>
                  {editingProduct && (
                    <p className="text-xs text-muted-foreground">
                      Stock is not editable here — use <span className="font-medium text-foreground">Adjust stock</span> on the row,
                      so the correction is recorded and cannot overwrite a sale made while this was open.
                    </p>
                  )}
                </div>
                <DialogFooter><Button onClick={saveProduct} data-testid="save-product-btn">Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={!!adjust} onOpenChange={(o) => !o && setAdjust(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Adjust stock — {adjust?.product?.name}</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Currently <span className="font-medium text-foreground">{adjust?.product?.current_stock} {adjust?.product?.unit}</span>.
                    Enter the change, not the new total — use a minus sign to remove.
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Change ({adjust?.product?.unit})</Label>
                      <Input type="number" value={adjust?.delta ?? ""} placeholder="e.g. -5"
                        onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })} className="h-11 mt-1" data-testid="adjust-delta" /></div>
                    <div><Label>New total</Label>
                      <Input value={adjust ? Math.round(((+adjust.product.current_stock || 0) + (+adjust.delta || 0)) * 1000) / 1000 : ""}
                        readOnly disabled className="h-11 mt-1" /></div>
                  </div>
                  <div><Label>Reason</Label>
                    <Input value={adjust?.reason ?? ""} placeholder="spillage, recount, damage"
                      onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })} className="h-11 mt-1" data-testid="adjust-reason" /></div>
                </div>
                <DialogFooter><Button onClick={saveAdjust} data-testid="save-adjust-btn">Save Adjustment</Button></DialogFooter>
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
                      <TableCell className="text-right flex gap-1 justify-end">
                        <Button variant="ghost" size="icon" title="Adjust stock" onClick={() => openAdjust(p)} data-testid={`adjust-product-${p.id}`}><Scale className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Edit details" onClick={() => openEditProduct(p)} data-testid={`edit-product-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => products.remove(p.id)} data-testid={`del-product-${p.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No products yet.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="purchases">
          <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} record={payFor} path="purchases" onDone={() => { purchases.load(); }} />
          <div className="flex justify-between items-center mb-4">
            <Input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Search purchases..." className="h-11 max-w-xs" data-testid="search-purchases" />
            <Button className="h-11 active:scale-95 transition-transform" onClick={openNewPurchase} data-testid="add-purchase-btn"><Plus className="h-4 w-4 mr-1" /> Record Purchase</Button>
            <Dialog open={purOpen} onOpenChange={(o) => { setPurOpen(o); if (!o) setEditingPurchase(null); }}>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingPurchase ? "Edit" : "Record"} Purchase</DialogTitle></DialogHeader>
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
                      <SelectContent>
                        {products.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</SelectItem>)}
                        {/* Last in the list, so the catalogue stays on top. */}
                        <SelectItem value={NEW_PRODUCT}>＋ Buying something new…</SelectItem>
                      </SelectContent>
                    </Select>
                    {buyingNew && (
                      <div className="mt-3 rounded-lg border border-border/60 p-3 space-y-3">
                        <p className="text-xs text-muted-foreground">It is added to Current Stock with this quantity.</p>
                        <div className="grid grid-cols-3 gap-3">
                          <div><Label>Item name</Label><Input value={buf.new_name} onChange={(e) => setBuf({ ...buf, new_name: e.target.value })} className="h-11 mt-1" data-testid="purchase-new-name" /></div>
                          <div><Label>Category</Label>
                            <Select value={buf.new_category} onValueChange={(v) => setBuf({ ...buf, new_category: v })}>
                              <SelectTrigger className="h-11 mt-1" data-testid="purchase-new-category"><SelectValue /></SelectTrigger>
                              <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div><Label>Unit</Label>
                            <Select value={buf.new_unit} onValueChange={(v) => setBuf({ ...buf, new_unit: v })}>
                              <SelectTrigger className="h-11 mt-1" data-testid="purchase-new-unit"><SelectValue /></SelectTrigger>
                              <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Quantity ({purchaseUnit})</Label><Input type="number" value={buf.quantity} onChange={(e) => setBuf({ ...buf, quantity: e.target.value })} className="h-11 mt-1" data-testid="purchase-qty" /></div>
                    <div><Label>Rate ₹/{purchaseUnit}</Label><Input type="number" value={buf.rate} onChange={(e) => setBuf({ ...buf, rate: e.target.value })} className="h-11 mt-1" data-testid="purchase-rate" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Payment</Label>
                      <Select value={buf.payment_status} onValueChange={(v) => setBuf({ ...buf, payment_status: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="purchase-payment"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Paid">Paid in full</SelectItem>
                          <SelectItem value="Partial">Part payment</SelectItem>
                          <SelectItem value="Pending">Nothing paid yet</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {!editingPurchase && buf.payment_status === "Partial" && (
                      <div><Label>Amount paid</Label>
                        <Input type="number" value={buf.amount_paid} onChange={(e) => setBuf({ ...buf, amount_paid: e.target.value })} className="h-11 mt-1" data-testid="purchase-amount-paid" />
                        <p className="text-xs text-muted-foreground mt-1">Balance {money(Math.max((+buf.quantity || 0) * (+buf.rate || 0) - (+buf.amount_paid || 0), 0))}</p>
                      </div>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">Total: <span className="font-bold text-foreground">{money((+buf.quantity || 0) * (+buf.rate || 0))}</span></p>
                </div>
                <DialogFooter><Button onClick={savePurchase} data-testid="save-purchase-btn">{editingPurchase ? "Update" : "Save"} Purchase</Button></DialogFooter>
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
                    <TableCell className="text-right">{p.quantity} {unitOf(p.product_id)}</TableCell><TableCell className="text-right">{money(p.rate)}</TableCell>
                    <TableCell className="text-right font-medium">{money(p.total)}</TableCell><TableCell><StatusBadge status={p.payment_status} balance={p.balance_due} /></TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      {p.payment_status !== "Paid" && <Button variant="ghost" size="icon" onClick={() => setPayFor(p)} data-testid={`pay-purchase-${p.id}`}><IndianRupee className="h-4 w-4 text-secondary" /></Button>}
                      <Button variant="ghost" size="icon" onClick={() => openEditPurchase(p)} data-testid={`edit-purchase-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => purchases.remove(p.id).then(() => products.load())}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
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
