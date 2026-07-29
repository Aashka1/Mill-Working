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
import { Plus, Trash2, Download, FileDown, Info } from "lucide-react";
import { toast } from "sonner";

export default function Grinding() {
  const grinding = useList("/grinding");
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(grinding.items, q, ["customer_name", "invoice_number", "payment_status", "date"]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: today(), customer_name: "", wheat_weight: "", charge_per_kg: "2", payment_status: "Pending" });

  const save = async () => {
    if (!f.customer_name || !f.wheat_weight || !f.charge_per_kg) return toast.error("Fill all fields");
    await api.post("/grinding", { ...f, wheat_weight: +f.wheat_weight, charge_per_kg: +f.charge_per_kg });
    toast.success("Grinding order recorded");
    setOpen(false);
    setF({ date: today(), customer_name: "", wheat_weight: "", charge_per_kg: "2", payment_status: "Pending" });
    grinding.load();
  };

  return (
    <div>
      <PageToolbar
        title="Wheat Grinding Service" subtitle="Customers bring their own wheat — tracked separately from inventory"
        search={q} setSearch={setQ} searchTestid="search-grinding"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => downloadFile("/export/grinding", "grinding_report.xlsx")} data-testid="export-grinding-btn"><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" data-testid="add-grinding-btn"><Plus className="h-4 w-4 mr-1" /> New Order</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Wheat Grinding Order</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
                    <div><Label>Customer</Label>
                      <Select value={f.customer_name} onValueChange={(v) => setF({ ...f, customer_name: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="grinding-customer"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{customers.items.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                          {customers.items.length === 0 && <SelectItem value="Walk-in">Walk-in Customer</SelectItem>}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Wheat Weight (kg)</Label><Input type="number" value={f.wheat_weight} onChange={(e) => setF({ ...f, wheat_weight: e.target.value })} className="h-11 mt-1" data-testid="grinding-weight" /></div>
                    <div><Label>Charge ₹/kg</Label><Input type="number" value={f.charge_per_kg} onChange={(e) => setF({ ...f, charge_per_kg: e.target.value })} className="h-11 mt-1" data-testid="grinding-charge" /></div>
                  </div>
                  <div><Label>Payment</Label>
                    <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}>
                      <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Pending">Pending</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">Total grinding charge: <span className="font-bold text-foreground">{money((+f.wheat_weight || 0) * (+f.charge_per_kg || 0))}</span></p>
                </div>
                <DialogFooter><Button onClick={save} data-testid="save-grinding-btn">Save Order</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3"><Info className="h-4 w-4" /> Customer-owned wheat — does not affect shop inventory.</div>
      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead>
            <TableHead className="text-right">Wheat (kg)</TableHead><TableHead className="text-right">Rate/kg</TableHead>
            <TableHead className="text-right">Charge</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((g) => (
              <TableRow key={g.id} className="hover:bg-muted/50" data-testid={`grinding-row-${g.id}`}>
                <TableCell className="font-mono text-xs">{g.invoice_number}</TableCell><TableCell>{g.date}</TableCell>
                <TableCell className="font-medium">{g.customer_name}</TableCell><TableCell className="text-right">{g.wheat_weight}</TableCell>
                <TableCell className="text-right">{money(g.charge_per_kg)}</TableCell><TableCell className="text-right font-medium">{money(g.total_charge)}</TableCell>
                <TableCell><StatusBadge status={g.payment_status} /></TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => downloadFile(`/invoices/${g.id}/pdf`, `${g.invoice_number}.pdf`)} data-testid={`pdf-grinding-${g.id}`}><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => grinding.remove(g.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No grinding orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
