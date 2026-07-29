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

const SEEDS = ["Mustard", "Groundnut", "Sesame", "Coconut", "Sunflower", "Other"];

export default function OilExtraction() {
  const oil = useList("/oil");
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(oil.items, q, ["customer_name", "seed_type", "invoice_number", "payment_status", "date"]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: today(), customer_name: "", seed_type: "Mustard", quantity_received: "", oil_extracted: "", charge: "", payment_status: "Pending" });

  const save = async () => {
    if (!f.customer_name || !f.quantity_received || !f.charge) return toast.error("Fill all fields");
    await api.post("/oil", { ...f, quantity_received: +f.quantity_received, oil_extracted: +f.oil_extracted, charge: +f.charge });
    toast.success("Oil extraction order recorded");
    setOpen(false);
    setF({ date: today(), customer_name: "", seed_type: "Mustard", quantity_received: "", oil_extracted: "", charge: "", payment_status: "Pending" });
    oil.load();
  };

  return (
    <div>
      <PageToolbar
        title="Oil Extraction Service" subtitle="Customers bring their own seeds — tracked separately from inventory"
        search={q} setSearch={setQ} searchTestid="search-oil"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => downloadFile("/export/oil", "oil_report.xlsx")} data-testid="export-oil-btn"><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" data-testid="add-oil-btn"><Plus className="h-4 w-4 mr-1" /> New Order</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Oil Extraction Order</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
                    <div><Label>Customer</Label>
                      <Select value={f.customer_name} onValueChange={(v) => setF({ ...f, customer_name: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="oil-customer"><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{customers.items.map((c) => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                          {customers.items.length === 0 && <SelectItem value="Walk-in">Walk-in Customer</SelectItem>}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Seed Type</Label>
                    <Select value={f.seed_type} onValueChange={(v) => setF({ ...f, seed_type: v })}>
                      <SelectTrigger className="h-11 mt-1" data-testid="oil-seed"><SelectValue /></SelectTrigger>
                      <SelectContent>{SEEDS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Seeds Received (kg)</Label><Input type="number" value={f.quantity_received} onChange={(e) => setF({ ...f, quantity_received: e.target.value })} className="h-11 mt-1" data-testid="oil-qty" /></div>
                    <div><Label>Oil Extracted (L)</Label><Input type="number" value={f.oil_extracted} onChange={(e) => setF({ ...f, oil_extracted: e.target.value })} className="h-11 mt-1" data-testid="oil-extracted" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Extraction Charge ₹</Label><Input type="number" value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value })} className="h-11 mt-1" data-testid="oil-charge" /></div>
                    <div><Label>Payment</Label>
                      <Select value={f.payment_status} onValueChange={(v) => setF({ ...f, payment_status: v })}>
                        <SelectTrigger className="h-11 mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent><SelectItem value="Paid">Paid</SelectItem><SelectItem value="Pending">Pending</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter><Button onClick={save} data-testid="save-oil-btn">Save Order</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4 bg-muted/50 rounded-lg p-3"><Info className="h-4 w-4" /> Customer-owned seeds — does not affect shop inventory.</div>
      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice</TableHead><TableHead>Date</TableHead><TableHead>Customer</TableHead><TableHead>Seed</TableHead>
            <TableHead className="text-right">Received</TableHead><TableHead className="text-right">Oil (L)</TableHead>
            <TableHead className="text-right">Charge</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((o) => (
              <TableRow key={o.id} className="hover:bg-muted/50" data-testid={`oil-row-${o.id}`}>
                <TableCell className="font-mono text-xs">{o.invoice_number}</TableCell><TableCell>{o.date}</TableCell>
                <TableCell className="font-medium">{o.customer_name}</TableCell><TableCell>{o.seed_type}</TableCell>
                <TableCell className="text-right">{o.quantity_received} kg</TableCell><TableCell className="text-right">{o.oil_extracted} L</TableCell>
                <TableCell className="text-right font-medium">{money(o.charge)}</TableCell><TableCell><StatusBadge status={o.payment_status} /></TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => downloadFile(`/invoices/${o.id}/pdf`, `${o.invoice_number}.pdf`)} data-testid={`pdf-oil-${o.id}`}><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => oil.remove(o.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No oil extraction orders yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
