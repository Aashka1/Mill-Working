import { useState } from "react";
import { useList, useFilter, PageToolbar } from "@/components/common";
import api, { money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Check, TrendingUp, TrendingDown } from "lucide-react";
import { toast } from "sonner";

const FINISHED = ["Flour", "Bran", "Edible Oil", "Oil Cake"];

export default function Costing() {
  const products = useList("/products");
  const [q, setQ] = useState("");
  const [edits, setEdits] = useState({});
  const rows = useFilter(products.items.filter((p) => FINISHED.includes(p.category)), q, ["name", "category"]);

  const saveRate = async (p) => {
    const rate = +(edits[p.id] ?? p.rate);
    await api.put(`/products/${p.id}`, {
      name: p.name, category: p.category, unit: p.unit, current_stock: p.current_stock,
      rate, cost_per_unit: p.cost_per_unit, low_stock_threshold: p.low_stock_threshold,
    });
    toast.success(`${p.name} price updated`);
    setEdits((e) => { const n = { ...e }; delete n[p.id]; return n; });
    products.load();
  };

  return (
    <div>
      <PageToolbar
        title="Product Costing" subtitle="Production cost vs selling price — set prices with confidence"
        search={q} setSearch={setQ} searchTestid="search-costing"
      />
      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Finished Good</TableHead><TableHead>Category</TableHead>
            <TableHead className="text-right">Stock</TableHead><TableHead className="text-right">Cost / unit</TableHead>
            <TableHead className="text-right">Selling Price</TableHead><TableHead className="text-right">Margin / unit</TableHead>
            <TableHead className="text-right">Margin %</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {rows.map((p) => {
              const rate = +(edits[p.id] ?? p.rate) || 0;
              const cost = p.cost_per_unit || 0;
              const margin = rate - cost;
              const pct = rate ? (margin / rate) * 100 : 0;
              const dirty = edits[p.id] !== undefined && +edits[p.id] !== p.rate;
              return (
                <TableRow key={p.id} className="hover:bg-muted/50" data-testid={`costing-row-${p.id}`}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><Badge variant="outline">{p.category}</Badge></TableCell>
                  <TableCell className="text-right">{p.current_stock} {p.unit}</TableCell>
                  <TableCell className="text-right text-muted-foreground">{money(cost)}</TableCell>
                  <TableCell className="text-right">
                    <Input type="number" value={edits[p.id] ?? p.rate} onChange={(e) => setEdits({ ...edits, [p.id]: e.target.value })}
                      className="h-9 w-28 ml-auto text-right" data-testid={`costing-rate-${p.id}`} />
                  </TableCell>
                  <TableCell className={`text-right font-medium ${margin >= 0 ? "text-secondary" : "text-destructive"}`}>{money(margin)}</TableCell>
                  <TableCell className="text-right">
                    <span className={`inline-flex items-center gap-1 font-medium ${margin >= 0 ? "text-secondary" : "text-destructive"}`}>
                      {margin >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{pct.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    {dirty && <Button size="sm" onClick={() => saveRate(p)} data-testid={`save-rate-${p.id}`}><Check className="h-4 w-4 mr-1" /> Save</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
            {rows.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No finished goods yet. Run production to build stock & cost.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
      <p className="text-xs text-muted-foreground mt-4">Cost per unit is derived from purchase price &amp; production runs (weighted average). Selling price is what you charge customers.</p>
    </div>
  );
}
