import { useState } from "react";
import { useList, useFilter, PageToolbar } from "@/components/common";
import api, { today } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Wrench, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const empty = { machine: "", task: "", last_service_date: today(), interval_days: "30", notes: "" };

function dueStatus(nextDue) {
  const t = today();
  if (!nextDue) return { label: "—", cls: "text-muted-foreground border-border" };
  if (nextDue < t) return { label: "Overdue", cls: "text-destructive border-destructive/40" };
  const soon = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  if (nextDue <= soon) return { label: "Due soon", cls: "text-primary border-primary/40" };
  return { label: "Scheduled", cls: "text-secondary border-secondary/40" };
}

export default function Maintenance() {
  const maint = useList("/maintenance");
  const [q, setQ] = useState("");
  const filtered = useFilter(maint.items, q, ["machine", "task", "next_due_date"]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [f, setF] = useState(empty);

  const openNew = () => { setEditingId(null); setF(empty); setOpen(true); };
  const openEdit = (m) => {
    setEditingId(m.id);
    setF({ machine: m.machine, task: m.task, last_service_date: m.last_service_date, interval_days: String(m.interval_days), notes: m.notes || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!f.machine || !f.task) return toast.error("Enter machine and task");
    const body = { machine: f.machine, task: f.task, last_service_date: f.last_service_date, interval_days: +f.interval_days, notes: f.notes };
    if (editingId) { await api.put(`/maintenance/${editingId}`, body); toast.success("Schedule updated"); }
    else { await api.post("/maintenance", body); toast.success("Schedule added"); }
    setOpen(false); setEditingId(null); setF(empty);
    maint.load();
  };

  const serviced = async (m) => { await api.patch(`/maintenance/${m.id}/serviced`); toast.success("Marked serviced — next due recalculated"); maint.load(); };

  return (
    <div>
      <PageToolbar
        title="Maintenance Reminders" subtitle="Schedule machine servicing and get alerts before it's due"
        search={q} setSearch={setQ} searchTestid="search-maintenance"
        actions={<Button className="h-11 active:scale-95 transition-transform" onClick={openNew} data-testid="add-maintenance-btn"><Plus className="h-4 w-4 mr-1" /> Add Schedule</Button>}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "New"} Maintenance Schedule</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Machine</Label><Input value={f.machine} onChange={(e) => setF({ ...f, machine: e.target.value })} placeholder="e.g. Flour grinder / Oil expeller" className="h-11 mt-1" data-testid="maint-machine" /></div>
            <div><Label>Task</Label><Input value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })} placeholder="e.g. Belt & bearing check" className="h-11 mt-1" data-testid="maint-task" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Last Serviced</Label><Input type="date" value={f.last_service_date} onChange={(e) => setF({ ...f, last_service_date: e.target.value })} className="h-11 mt-1" data-testid="maint-last" /></div>
              <div><Label>Every (days)</Label><Input type="number" value={f.interval_days} onChange={(e) => setF({ ...f, interval_days: e.target.value })} className="h-11 mt-1" data-testid="maint-interval" /></div>
            </div>
            <div><Label>Notes</Label><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="mt-1" data-testid="maint-notes" /></div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="save-maintenance-btn">{editingId ? "Update" : "Save"} Schedule</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Machine</TableHead><TableHead>Task</TableHead><TableHead>Last Serviced</TableHead>
            <TableHead className="text-right">Interval</TableHead><TableHead>Next Due</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((m) => {
              const st = dueStatus(m.next_due_date);
              return (
                <TableRow key={m.id} className="hover:bg-muted/50" data-testid={`maintenance-row-${m.id}`}>
                  <TableCell className="font-medium flex items-center gap-2"><Wrench className="h-4 w-4 text-muted-foreground" />{m.machine}</TableCell>
                  <TableCell>{m.task}</TableCell><TableCell>{m.last_service_date}</TableCell>
                  <TableCell className="text-right">{m.interval_days} days</TableCell>
                  <TableCell className="font-medium">{m.next_due_date}</TableCell>
                  <TableCell><Badge variant="outline" className={st.cls}>{st.label}</Badge></TableCell>
                  <TableCell className="text-right flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => serviced(m)} title="Mark serviced" data-testid={`serviced-${m.id}`}><CheckCircle2 className="h-4 w-4 text-secondary" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(m)} data-testid={`edit-maintenance-${m.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => maint.remove(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No maintenance schedules yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
