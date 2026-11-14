import { useEffect, useState } from "react";
import { useList, useFilter, PageToolbar } from "@/components/common";
import api, { money, today } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowRight, Pencil } from "lucide-react";
import { toast } from "sonner";

// Each mill names its input and outputs; applyMill resolves them against the
// product catalogue, so every name here must exist as a product.
const MILL_CONFIG = {
  Flour: { input: "Wheat Crop", outputs: ["Atta", "Wheat Bran"] },
  Oil: { input: "Mustard Seeds", outputs: ["Mustard Oil", "Mustard Oil Cake"] },
  Sattu: { input: "Wheat Crop", outputs: ["Sattu"] },
  Besan: { input: "Gram (Chana)", outputs: ["Besan"] },
  Masala: { input: "Whole Spices", outputs: ["Masala"] },
};

export default function Production() {
  const production = useList("/production");
  const products = useList("/products");
  const [q, setQ] = useState("");
  const filtered = useFilter(production.items, q, ["input_product_name", "mill", "date"]);
  const [open, setOpen] = useState(false);
  const [mill, setMill] = useState("Flour");
  const [date, setDate] = useState(today());
  const [inputId, setInputId] = useState("");
  const [inputQty, setInputQty] = useState("");
  const [outs, setOuts] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const byName = (n) => products.items.find((p) => p.name === n);
  const inputProduct = products.items.find((p) => p.id === inputId);

  const applyMill = (m) => {
    setMill(m);
    const cfg = MILL_CONFIG[m];
    setInputId(byName(cfg.input)?.id || "");
    setOuts(cfg.outputs.map((n) => ({ product_id: byName(n)?.id || "", quantity: "", cost_rate: "", selling_rate: "" })));
  };

  const openNew = () => { setEditingId(null); applyMill(mill); setDate(today()); setInputQty(""); setOpen(true); };

  const openEdit = (run) => {
    setEditingId(run.id);
    setMill(run.mill);
    setDate(run.date);
    // Older runs predate product_id being stored, so fall back to the name.
    setInputId(run.input_product_id || byName(run.input_product_name)?.id || "");
    setInputQty(String(run.input_quantity));
    setOuts((run.outputs || []).map((o) => ({
      product_id: o.product_id || byName(o.product_name)?.id || "",
      quantity: String(o.quantity),
      // Only rates the operator set are brought back; the rest were worked out.
      cost_rate: o.cost_rate_set ? String(o.cost_per_unit) : "",
      selling_rate: o.selling_rate != null ? String(o.selling_rate) : "",
    })));
    setOpen(true);
  };

  const setOut = (i, key, val) => setOuts(outs.map((o, idx) => (idx === i ? { ...o, [key]: val } : o)));

  const save = async () => {
    if (!inputId || !inputQty) return toast.error("Select input and quantity");
    const validOuts = outs.filter((o) => o.product_id && +o.quantity > 0);
    if (validOuts.length === 0) return toast.error("Add at least one output");
    const body = {
      date, mill, input_product_id: inputId, input_product_name: inputProduct?.name,
      input_quantity: +inputQty,
      outputs: validOuts.map((o) => ({
        product_id: o.product_id, product_name: products.items.find((p) => p.id === o.product_id)?.name, quantity: +o.quantity,
        cost_rate: o.cost_rate === "" || o.cost_rate == null ? null : +o.cost_rate,
        selling_rate: o.selling_rate === "" || o.selling_rate == null ? null : +o.selling_rate,
      })),
    };
    try {
      if (editingId) {
        await api.put(`/production/${editingId}`, body);
        toast.success("Production run updated, inventory adjusted");
      } else {
        await api.post("/production", body);
        toast.success("Production recorded, inventory updated");
      }
      setOpen(false);
      setEditingId(null);
      production.load(); products.load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const inputCost = (+inputQty || 0) * (inputProduct?.cost_per_unit || 0);
  // Mirrors the backend: priced outputs take their rate, the rest share what
  // is left of the input cost by weight.
  const live = outs.filter((o) => +o.quantity > 0);
  const totalOut = live.reduce((a, o) => a + (+o.quantity), 0);
  const lossKg = +((+inputQty || 0) - totalOut).toFixed(3);
  const pricedCost = live.filter((o) => o.cost_rate !== "" && o.cost_rate != null).reduce((a, o) => a + (+o.quantity) * (+o.cost_rate), 0);
  const unpricedQty = live.filter((o) => o.cost_rate === "" || o.cost_rate == null).reduce((a, o) => a + (+o.quantity), 0);
  const costOf = (o) => {
    if (!(+o.quantity > 0)) return null;
    if (o.cost_rate !== "" && o.cost_rate != null) return (+o.quantity) * (+o.cost_rate);
    return unpricedQty ? (inputCost - pricedCost) * (+o.quantity) / unpricedQty : 0;
  };

  return (
    <div>
      <PageToolbar
        title="Production" subtitle="Convert raw stock into finished goods & by-products"
        search={q} setSearch={setQ} searchTestid="search-production"
        actions={<Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-production-btn"><Plus className="h-4 w-4 mr-1" /> New Production Run</Button>}
      />

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "Record"} Production Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Mill</Label>
                <Select value={mill} onValueChange={applyMill}>
                  <SelectTrigger className="h-11 mt-1" data-testid="production-mill"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Flour">Flour Mill</SelectItem><SelectItem value="Oil">Oil Mill</SelectItem><SelectItem value="Sattu">Sattu</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Raw Input</Label>
                <Select value={inputId} onValueChange={setInputId}>
                  <SelectTrigger className="h-11 mt-1" data-testid="production-input"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{products.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.current_stock} {p.unit})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Quantity Used</Label><Input type="number" value={inputQty} onChange={(e) => setInputQty(e.target.value)} className="h-11 mt-1" data-testid="production-input-qty" /></div>
            </div>
            <div className="flex items-center justify-center text-muted-foreground text-sm gap-2"><ArrowRight className="h-4 w-4" /> produces</div>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground">
                <span className="col-span-4">Output</span><span className="col-span-2">Qty (kg)</span>
                <span className="col-span-3">Cost ₹/kg</span><span className="col-span-3">Selling ₹/kg</span>
              </div>
              {outs.map((o, i) => {
                const c = costOf(o);
                return (
                  <div key={i}>
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-4">
                        <Select value={o.product_id} onValueChange={(v) => setOut(i, "product_id", v)}>
                          <SelectTrigger className="h-11" data-testid={`production-output-${i}`}><SelectValue placeholder="Output product" /></SelectTrigger>
                          <SelectContent>{products.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name === "Wheat Bran" ? "Wheat Bran (Chokar)" : p.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <Input type="number" placeholder="Qty" value={o.quantity} onChange={(e) => setOut(i, "quantity", e.target.value)} className="h-11 col-span-2" data-testid={`production-output-qty-${i}`} />
                      <Input type="number" placeholder="Auto" value={o.cost_rate ?? ""} onChange={(e) => setOut(i, "cost_rate", e.target.value)} className="h-11 col-span-3" data-testid={`production-output-cost-${i}`} />
                      <Input type="number" placeholder={String(products.items.find((p) => p.id === o.product_id)?.rate || "")} value={o.selling_rate ?? ""} onChange={(e) => setOut(i, "selling_rate", e.target.value)} className="h-11 col-span-3" data-testid={`production-output-sell-${i}`} />
                    </div>
                    {c != null && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Cost {money(c)} · {(c / (+o.quantity)).toFixed(2)} ₹/kg{(o.cost_rate === "" || o.cost_rate == null) ? " (remainder of input cost)" : ""}
                      </p>
                    )}
                  </div>
                );
              })}
              <Button variant="outline" size="sm" onClick={() => setOuts([...outs, { product_id: "", quantity: "", cost_rate: "", selling_rate: "" }])} data-testid="add-output-row">+ Add output</Button>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1">
              <div className="flex justify-between"><span>Input cost ({inputProduct?.name || "input"})</span><span className="font-bold">{money(inputCost)}</span></div>
              <div className="flex justify-between"><span>Total output</span><span>{+totalOut.toFixed(3)} kg</span></div>
              <div className="flex justify-between"><span>Loss / other</span><span className={lossKg < 0 ? "text-destructive" : ""}>{lossKg} kg</span></div>
              <p className="text-xs text-muted-foreground pt-1">Set Chokar's cost rate lower than Atta's — any output left on "Auto" takes the rest of the input cost. Selling rate, if filled, updates the product's sale price.</p>
            </div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-production-btn">Save Production</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Mill</TableHead><TableHead>Input Used</TableHead>
            <TableHead>Outputs Produced</TableHead><TableHead className="text-right">Input Cost</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id} className="hover:bg-muted/50" data-testid={`production-row-${p.id}`}>
                <TableCell>{p.date}</TableCell>
                <TableCell><Badge variant="outline">{p.mill}</Badge></TableCell>
                <TableCell className="font-medium">{p.input_quantity} × {p.input_product_name}</TableCell>
                <TableCell>
                  {p.outputs.map((o, i) => <span key={i} className="block text-sm">{o.quantity} {o.product_name} <span className="text-muted-foreground">({money(o.cost)} · {o.cost_per_unit} ₹/kg)</span></span>)}
                  {p.loss_kg > 0 && <span className="block text-xs text-muted-foreground">Loss {p.loss_kg} kg</span>}
                </TableCell>
                <TableCell className="text-right font-medium">{money(p.input_cost)}</TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)} data-testid={`edit-production-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => production.remove(p.id).then(() => products.load())}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No production runs yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
