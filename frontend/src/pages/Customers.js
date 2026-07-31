import { useState } from "react";
import { useList, useFilter, PageToolbar } from "@/components/common";
import api, { money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, History, Phone, MapPin, Pencil } from "lucide-react";
import { toast } from "sonner";
import { LedgerDialog } from "@/components/LedgerDialog";

const BLANK = { name: "", phone: "", address: "", gstin: "", pan_aadhaar: "", opening_balance: "", credit_limit: "" };

export default function Customers() {
  const customers = useList("/customers");
  const [q, setQ] = useState("");
  const filtered = useFilter(customers.items, q, ["name", "phone", "address"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(BLANK);
  const [ledgerFor, setLedgerFor] = useState(null);

  const openNew = () => { setEditingId(null); setF(BLANK); setOpen(true); };
  const openEdit = (c) => {
    setEditingId(c.id);
    setF({ name: c.name || "", phone: c.phone || "", address: c.address || "",
           gstin: c.gstin || "", pan_aadhaar: c.pan_aadhaar || "",
           opening_balance: c.opening_balance ?? "", credit_limit: c.credit_limit ?? "" });
    setOpen(true);
  };

  const save = async () => {
    if (!f.name) return toast.error("Enter name");
    if (editingId) {
      await api.put(`/customers/${editingId}`, { ...f, opening_balance: +f.opening_balance || 0, credit_limit: +f.credit_limit || 0 });
      toast.success("Customer updated");
      customers.load();
    } else {
      await customers.create({ ...f, opening_balance: +f.opening_balance || 0, credit_limit: +f.credit_limit || 0 });
    }
    setOpen(false);
    setEditingId(null);
    setF(BLANK);
  };

  return (
    <div>
      <PageToolbar
        title="Customers" subtitle="Profiles, history & outstanding balances"
        search={q} setSearch={setQ} searchTestid="search-customers"
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingId(null); }}>
            <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-customer-btn"><Plus className="h-4 w-4 mr-1" /> Add Customer</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Customer</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Name</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11 mt-1" data-testid="customer-name" /></div>
                <div><Label>Phone</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="h-11 mt-1" data-testid="customer-phone" /></div>
                <div><Label>Address</Label><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className="h-11 mt-1" data-testid="customer-address" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>GSTIN <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} className="h-11 mt-1" data-testid="customer-gstin" /></div>
                  <div><Label>Aadhaar / PAN <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input value={f.pan_aadhaar} onChange={(e) => setF({ ...f, pan_aadhaar: e.target.value.toUpperCase() })} className="h-11 mt-1" data-testid="customer-pan" /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Opening balance ₹</Label>
                    <Input type="number" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} className="h-11 mt-1" data-testid="customer-opening" />
                    <p className="text-xs text-muted-foreground mt-1">What they already owed before today.</p></div>
                  <div><Label>Credit limit ₹ <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input type="number" value={f.credit_limit} onChange={(e) => setF({ ...f, credit_limit: e.target.value })} className="h-11 mt-1" data-testid="customer-limit" /></div>
                </div>
              </div>
              <DialogFooter><Button onClick={save} data-testid="save-customer-btn">Save</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <Card className="border-border/60">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Phone</TableHead><TableHead>Address</TableHead>
            <TableHead className="text-right">Outstanding</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id} className="hover:bg-muted/50" data-testid={`customer-row-${c.id}`}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell><span className="flex items-center gap-1 text-sm"><Phone className="h-3 w-3 text-muted-foreground" />{c.phone || "—"}</span></TableCell>
                <TableCell><span className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3 w-3" />{c.address || "—"}</span></TableCell>
                <TableCell className="text-right">{c.outstanding > 0 ? <Badge variant="outline" className="text-destructive border-destructive/30">{money(c.outstanding)}</Badge> : <Badge variant="outline" className="text-secondary border-secondary/30">Clear</Badge>}</TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => setLedgerFor(c)} data-testid={`ledger-customer-${c.id}`}><History className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} data-testid={`edit-customer-${c.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => customers.remove(c.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No customers yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <LedgerDialog open={!!ledgerFor} onOpenChange={(o) => !o && setLedgerFor(null)} entity={ledgerFor} partyType="customer" onChanged={() => customers.load()} />
    </div>
  );
}
