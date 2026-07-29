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
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";

const MILL_CONFIG = {
  Flour: { input: "Wheat Crop", outputs: ["Atta", "Wheat Bran"] },
  Oil: { input: "Mustard Seeds", outputs: ["Mustard Oil", "Mustard Oil Cake"] },
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

  const byName = (n) => products.items.find((p) => p.name === n);
  const inputProduct = products.items.find((p) => p.id === inputId);

  const applyMill = (m) => {
    setMill(m);
    const cfg = MILL_CONFIG[m];
    setInputId(byName(cfg.input)?.id || "");
    setOuts(cfg.outputs.map((n) => ({ product_id: byName(n)?.id || "", quantity: "" })));
  };

  const openNew = () => { applyMill(mill); setDate(today()); setInputQty(""); setOpen(true); };

  const setOut = (i, key, val) => setOuts(outs.map((o, idx) => (idx === i ? { ...o, [key]: val } : o)));

  const save = async () => {
    if (!inputId || !inputQty) return toast.error("Select input and quantity");
    const validOuts = outs.filter((o) => o.product_id && +o.quantity > 0);
    if (validOuts.length === 0) return toast.error("Add at least one output");
    try {
      await api.post("/production", {
        date, mill, input_product_id: inputId, input_product_name: inputProduct?.name,
        input_quantity: +inputQty,
        outputs: validOuts.map((o) => ({ product_id: o.product_id, product_name: products.items.find((p) => p.id === o.product_id)?.name, quantity: +o.quantity })),
      });
      toast.success("Production recorded, inventory updated");
      setOpen(false);
      production.load(); products.load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const inputCost = (+inputQty || 0) * (inputProduct?.cost_per_unit || 0);

  return (
    <div>
      <PageToolbar
        title="Production" subtitle="Convert raw stock into finished goods & by-products"
        search={q} setSearch={setQ} searchTestid="search-production"
        actions={<Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-production-btn"><Plus className="h-4 w-4 mr-1" /> New Production Run</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Record Production Run</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Mill</Label>
                <Select value={mill} onValueChange={applyMill}>
                  <SelectTrigger className="h-11 mt-1" data-testid="production-mill"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Flour">Flour Mill</SelectItem><SelectItem value="Oil">Oil Mill</SelectItem></SelectContent>
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
              {outs.map((o, i) => (
                <div key={i} className="grid grid-cols-2 gap-4">
                  <Select value={o.product_id} onValueChange={(v) => setOut(i, "product_id", v)}>
                    <SelectTrigger className="h-11" data-testid={`production-output-${i}`}><SelectValue placeholder="Output product" /></SelectTrigger>
                    <SelectContent>{products.items.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Input type="number" placeholder="Qty produced" value={o.quantity} onChange={(e) => setOut(i, "quantity", e.target.value)} className="h-11" data-testid={`production-output-qty-${i}`} />
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setOuts([...outs, { product_id: "", quantity: "" }])} data-testid="add-output-row">+ Add output</Button>
            </div>
            <p className="text-sm text-muted-foreground">Estimated input cost: <span className="font-bold text-foreground">{money(inputCost)}</span> (allocated across outputs)</p>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-production-btn">Save Production</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border/60">
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
                <TableCell>{p.outputs.map((o, i) => <span key={i} className="block text-sm">{o.quantity} {o.product_name} <span className="text-muted-foreground">({money(o.cost)})</span></span>)}</TableCell>
                <TableCell className="text-right font-medium">{money(p.input_cost)}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => production.remove(p.id).then(() => products.load())}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No production runs yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
