import { useState, useMemo } from "react";
import { useList, useFilter, PageToolbar, StatCard } from "@/components/common";
import api, { money, today, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, FileDown, Receipt, CalendarDays, CalendarRange, Pencil } from "lucide-react";
import { toast } from "sonner";

const CATS = ["Electricity", "Labour", "Machine Maintenance", "Transportation", "Packaging", "Miscellaneous"];

const blank = () => ({ date: today(), category: "Electricity", description: "", amount: "" });

export default function Expenses() {
  const expenses = useList("/expenses");
  const [q, setQ] = useState("");
  const filtered = useFilter(expenses.items, q, ["category", "description", "date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(blank());

  const summary = useMemo(() => {
    const now = new Date();
    const t = today();
    const weekAgo = new Date(now.getTime() - 7 * 864e5).toISOString().slice(0, 10);
    const month = t.slice(0, 7);
    let daily = 0, weekly = 0, monthly = 0;
    expenses.items.forEach((e) => {
      if (e.date === t) daily += e.amount;
      if (e.date >= weekAgo) weekly += e.amount;
      if (String(e.date).startsWith(month)) monthly += e.amount;
    });
    return { daily, weekly, monthly };
  }, [expenses.items]);

  const openNew = () => { setEditingId(null); setF(blank()); setOpen(true); };
  const openEdit = (e) => {
    setEditingId(e.id);
    setF({ date: e.date, category: e.category, description: e.description || "", amount: String(e.amount) });
    setOpen(true);
  };

  const save = async () => {
    if (!f.amount) return toast.error("Enter amount");
    const body = { ...f, amount: +f.amount };
    if (editingId) {
      await api.put(`/expenses/${editingId}`, body);
      toast.success("Expense updated");
      expenses.load();
    } else {
      await expenses.create(body);
    }
    setOpen(false);
    setEditingId(null);
    setF(blank());
  };

  return (
    <div>
      <PageToolbar
        title="Expense Management" subtitle="Daily operating costs"
        search={q} setSearch={setQ} searchTestid="search-expenses"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => downloadFile("/export/expenses", "expenses_report.xlsx")} data-testid="export-expenses-btn"><FileDown className="h-4 w-4 mr-1" /> Excel</Button>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditingId(null); }}>
              <DialogTrigger asChild><Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-expense-btn"><Plus className="h-4 w-4 mr-1" /> Add Expense</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingId ? "Edit" : "Add"} Expense</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div><Label>Date</Label><Input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="h-11 mt-1" /></div>
                    <div><Label>Category</Label>
                      <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
                        <SelectTrigger className="h-11 mt-1" data-testid="expense-category"><SelectValue /></SelectTrigger>
                        <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Description</Label><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="h-11 mt-1" data-testid="expense-desc" /></div>
                  <div><Label>Amount ₹</Label><Input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} className="h-11 mt-1" data-testid="expense-amount" /></div>
                </div>
                <DialogFooter><Button onClick={save} data-testid="save-expense-btn">Save</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-6">
        <StatCard label="Today" value={money(summary.daily)} icon={Receipt} accent="destructive" />
        <StatCard label="This Week" value={money(summary.weekly)} icon={CalendarDays} accent="primary" />
        <StatCard label="This Month" value={money(summary.monthly)} icon={CalendarRange} accent="secondary" />
      </div>
      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Date</TableHead><TableHead>Category</TableHead><TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className="hover:bg-muted/50" data-testid={`expense-row-${e.id}`}>
                <TableCell>{e.date}</TableCell><TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                <TableCell>{e.description || "—"}</TableCell><TableCell className="text-right font-medium">{money(e.amount)}</TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(e)} data-testid={`edit-expense-${e.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => expenses.remove(e.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No expenses yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
