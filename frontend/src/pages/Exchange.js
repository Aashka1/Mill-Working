import { useEffect, useState } from "react";
import { useList, useFilter, PageToolbar } from "@/components/common";
import api, { today } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ArrowLeftRight, Info } from "lucide-react";
import { toast } from "sonner";

export default function Exchange() {
  const exchanges = useList("/exchanges");
  const customers = useList("/customers");
  const [settings, setSettings] = useState({ washed_loss: 2.5, unwashed_loss: 5 });
  const [q, setQ] = useState("");
  const filtered = useFilter(exchanges.items, q, ["customer_name", "date"]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: today(), customer_name: "", wheat_qty: "", washed: true, loss_percent: "2.5", atta_given: "" });

  useEffect(() => { api.get("/settings").then((r) => setSettings(r.data)).catch(() => {}); }, []);

  const autoAtta = (+f.wheat_qty || 0) * (1 - (+f.loss_percent || 0) / 100);
  const setWashed = (w) => setF({ ...f, washed: w, loss_percent: String(w ? settings.washed_loss : settings.unwashed_loss) });

  const save = async () => {
    if (!f.customer_name || !f.wheat_qty) return toast.error("Fill all fields");
    const atta = f.atta_given ? +f.atta_given : +autoAtta.toFixed(2);
    await api.post("/exchanges", { date: f.date, customer_name: f.customer_name, wheat_qty: +f.wheat_qty, washed: f.washed, loss_percent: +f.loss_percent, atta_given: atta });
    toast.success("Exchange recorded, inventory updated");
    setOpen(false);
    setF({ date: today(), customer_name: "", wheat_qty: "", washed: true, loss_percent: String(settings.washed_loss), atta_given: "" });
    exchanges.load();
  };

  return (
    <div>
      <PageToolbar
        title="Exchange" subtitle="Customer trades wheat crop for ready atta"
        search={q} setSearch={setQ} searchTestid="search-exchange"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" data-testid="add-exchange-btn"><Plus className="h-4 w-4 mr-1" /> New Exchange</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Record Exchange</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
                  <div><Label>Customer</Label>
                    <Select value={f.customer_name} onValueChange={(v) => setF({ ...f, customer_name: v })}>
                      <SelectTrigger className="h-11 mt-1" data-testid="exchange-customer"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>{customers.items.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                        {customers.items.length === 0 && <SelectItem value="Walk-in">Walk-in Customer</SelectItem>}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 p-3">
                  <Label>Wheat washed?</Label>
                  <Switch checked={f.washed} onCheckedChange={setWashed} data-testid="exchange-washed" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Wheat Crop (kg)</Label><Input type="number" value={f.wheat_qty} onChange={(e) => setF({ ...f, wheat_qty: e.target.value })} className="h-11 mt-1" data-testid="exchange-wheat" /></div>
                  <div><Label>Grinding Loss %</Label><Input type="number" value={f.loss_percent} onChange={(e) => setF({ ...f, loss_percent: e.target.value })} className="h-11 mt-1" data-testid="exchange-loss" /></div>
                </div>
                <div><Label>Atta Given (kg)</Label>
                  <Input type="number" value={f.atta_given} onChange={(e) => setF({ ...f, atta_given: e.target.value })} placeholder={autoAtta.toFixed(2)} className="h-11 mt-1" data-testid="exchange-atta" />
                  <p className="text-xs text-muted-foreground mt-1">Auto: {autoAtta.toFixed(2)} kg after {f.loss_percent}% loss. Override if needed.</p>
                </div>
              </div>
              <DialogFooter><Button onClick={save} data-testid="save-exchange-btn">Save Exchange</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3"><Info className="h-4 w-4" /> Shop <b className="mx-1">Wheat Crop</b> stock increases, <b className="mx-1">Atta</b> stock decreases.</div>
      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Washed</TableHead>
            <TableHead className="text-right">Wheat In (kg)</TableHead><TableHead className="text-right">Loss (kg)</TableHead>
            <TableHead className="text-right">Atta Given (kg)</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className="hover:bg-muted/50" data-testid={`exchange-row-${e.id}`}>
                <TableCell>{e.date}</TableCell><TableCell className="font-medium">{e.customer_name}</TableCell>
                <TableCell><Badge variant="outline">{e.washed ? "Washed" : "Unwashed"}</Badge></TableCell>
                <TableCell className="text-right">{e.wheat_qty}</TableCell><TableCell className="text-right text-destructive">{e.loss_kg}</TableCell>
                <TableCell className="text-right font-medium">{e.atta_given}</TableCell>
                <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => exchanges.remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No exchanges yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
