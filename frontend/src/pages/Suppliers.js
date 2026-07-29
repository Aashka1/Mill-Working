import { useState } from "react";
import { useList, useFilter, PageToolbar } from "@/components/common";
import { money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Phone, MapPin, History } from "lucide-react";
import { toast } from "sonner";
import { LedgerDialog } from "@/components/LedgerDialog";

export default function Suppliers() {
  const suppliers = useList("/suppliers");
  const [q, setQ] = useState("");
  const filtered = useFilter(suppliers.items, q, ["name", "phone", "address"]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ name: "", phone: "", address: "" });
  const [ledgerFor, setLedgerFor] = useState(null);

  const save = async () => {
    if (!f.name) return toast.error("Enter name");
    await suppliers.create(f);
    setOpen(false);
    setF({ name: "", phone: "", address: "" });
  };

  return (
    <div>
      <PageToolbar
        title="Suppliers" subtitle="Contacts, purchase history & dues"
        search={q} setSearch={setQ} searchTestid="search-suppliers"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" data-testid="add-supplier-btn"><Plus className="h-4 w-4 mr-1" /> Add Supplier</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11 mt-1" data-testid="supplier-name" /></div>
                <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="h-11 mt-1" data-testid="supplier-phone" /></div>
                <div><Label>Address</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className="h-11 mt-1" data-testid="supplier-address" /></div>
              </div>
              <DialogFooter><Button onClick={save} data-testid="save-supplier-btn">Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Address</TableHead>
            <TableHead className="text-right">Outstanding Payable</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((s) => (
              <TableRow key={s.id} className="hover:bg-muted/50" data-testid={`supplier-row-${s.id}`}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell><span className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3 text-muted-foreground" />{s.phone || "—"}</span></TableCell>
                <TableCell><span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3 w-3" />{s.address || "—"}</span></TableCell>
                <TableCell className="text-right">{s.outstanding > 0 ? <Badge variant="outline" className="text-destructive border-destructive/30">{money(s.outstanding)}</Badge> : <Badge variant="outline" className="text-secondary border-secondary/30">Clear</Badge>}</TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => setLedgerFor(s)} data-testid={`ledger-supplier-${s.id}`}><History className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => suppliers.remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No suppliers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
      <LedgerDialog open={!!ledgerFor} onOpenChange={(o) => !o && setLedgerFor(null)} entity={ledgerFor} partyType="supplier" onChanged={() => suppliers.load()} />
    </div>
  );
}
