import { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Save, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const [s, setS] = useState({ washed_loss: 2.5, unwashed_loss: 5, starting_cash: 0 });
  const [audit, setAudit] = useState([]);

  useEffect(() => {
    api.get("/settings").then((r) => setS(r.data)).catch(() => {});
    api.get("/audit").then((r) => setAudit(r.data)).catch(() => {});
  }, []);

  const save = async () => {
    await api.put("/settings", { washed_loss: +s.washed_loss, unwashed_loss: +s.unwashed_loss, starting_cash: +s.starting_cash });
    toast.success("Settings saved");
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Business defaults &amp; audit trail</p>
      </div>

      <Card className="p-6 border-border/60 mb-6 max-w-2xl">
        <h3 className="font-heading font-bold text-lg mb-4">Grinding Loss &amp; Cash Defaults</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><Label>Washed Loss %</Label><Input type="number" value={s.washed_loss} onChange={(e) => setS({ ...s, washed_loss: e.target.value })} className="h-11 mt-1" data-testid="set-washed" /></div>
          <div><Label>Unwashed Loss %</Label><Input type="number" value={s.unwashed_loss} onChange={(e) => setS({ ...s, unwashed_loss: e.target.value })} className="h-11 mt-1" data-testid="set-unwashed" /></div>
          <div><Label>Starting Cash ₹</Label><Input type="number" value={s.starting_cash} onChange={(e) => setS({ ...s, starting_cash: e.target.value })} className="h-11 mt-1" data-testid="set-cash" /></div>
        </div>
        <Button className="mt-4 h-11" onClick={save} data-testid="save-settings-btn"><Save className="h-4 w-4 mr-1" /> Save Settings</Button>
      </Card>

      <Card className="p-6 border-border/60">
        <div className="flex items-center gap-2 mb-4"><ShieldCheck className="h-5 w-5 text-primary" /><h3 className="font-heading font-bold text-lg">Audit Log</h3></div>
        <Table>
          <TableHeader><TableRow><TableHead>Time</TableHead><TableHead>User</TableHead><TableHead>Action</TableHead><TableHead>Detail</TableHead></TableRow></TableHeader>
          <TableBody>
            {audit.map((r) => (
              <TableRow key={r.id} data-testid={`audit-row-${r.id}`}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(r.at).toLocaleString()}</TableCell>
                <TableCell><span className="font-medium">{r.user}</span> <Badge variant="outline" className="ml-1 capitalize text-[10px]">{r.role}</Badge></TableCell>
                <TableCell>{r.action}</TableCell><TableCell className="text-muted-foreground">{r.detail}</TableCell>
              </TableRow>
            ))}
            {audit.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No activity logged yet.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
