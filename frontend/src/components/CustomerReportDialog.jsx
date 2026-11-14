import { useCallback, useEffect, useState } from "react";
import api, { money, downloadFile, formatApiErrorDetail } from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileSpreadsheet, FileDown } from "lucide-react";
import { toast } from "sonner";

const qty = (v) => (v === "" || v == null ? "" : `${v}`);

/**
 * A customer's complete account: sales, wheat brought, atta given (including
 * advance atta), grinding charges, payments by mode, and the money and atta
 * balances — for any date range, with Excel export.
 */
export function CustomerReportDialog({ open, onOpenChange, customer }) {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState(null);

  const params = useCallback((from = start, to = end) => {
    const p = new URLSearchParams({ party: customer?.name || "" });
    if (from) p.set("start", from);
    if (to) p.set("end", to);
    return p;
  }, [customer, start, end]);

  const load = useCallback((from = start, to = end) => {
    if (!customer) return;
    api.get(`/reports/customer-statement?${params(from, to)}`)
      .then((r) => setData(r.data))
      .catch((e) => toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message));
  }, [customer, params, start, end]);

  useEffect(() => {
    if (open) { setData(null); setStart(""); setEnd(""); load("", ""); }
  }, [open, customer]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportAs = (format) => {
    const p = params();
    p.set("format", format);
    const safe = (customer?.name || "customer").replace(/[^\wऀ-ॿ-]+/g, "_");
    downloadFile(`/reports/customer-statement/export?${p}`, `${safe}_statement.${format}`)
      .catch(() => toast.error("Download failed"));
  };

  const s = Object.fromEntries((data?.summary || []).map((x) => [x.label, x]));
  const due = s["Balance due"] || s["Advance with us"];
  const attaBal = s["Atta balance (kg)"] || s["Advance atta owed (kg)"];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader><DialogTitle>Customer Report — {customer?.name}</DialogTitle></DialogHeader>
        <div className="overflow-y-auto pr-1 space-y-4">
          <div className="text-sm text-muted-foreground">
            {customer?.phone || "No mobile"} · {customer?.address || "No address"}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 mt-1" data-testid="cust-report-start" /></div>
            <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 mt-1" data-testid="cust-report-end" /></div>
            <Button variant="outline" className="h-10" onClick={() => load()} data-testid="cust-report-apply">Show</Button>
            {(start || end) && <Button variant="ghost" className="h-10" onClick={() => { setStart(""); setEnd(""); load("", ""); }}>All dates</Button>}
            <div className="ml-auto flex gap-2">
              <Button className="h-10" onClick={() => exportAs("xlsx")} data-testid="cust-report-excel"><FileSpreadsheet className="h-4 w-4 mr-1" /> Export to Excel</Button>
              <Button variant="outline" className="h-10" onClick={() => exportAs("pdf")}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
            </div>
          </div>

          {data && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Total sales & charges</p><p className="font-bold text-lg">{money(s["Total sales & charges"]?.value)}</p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Total paid</p><p className="font-bold text-lg text-secondary">{money(s["Total paid"]?.value)}</p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">{due?.label}</p><p className={`font-bold text-lg ${due?.value > 0 ? "text-destructive" : "text-secondary"}`} data-testid="cust-report-due">{money(Math.abs(due?.value || 0))}</p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">Wheat brought / atta given</p><p className="font-bold text-lg">{s["Wheat brought (kg)"]?.value} / {s["Atta given (kg)"]?.value} kg</p></div>
                <div className="rounded-lg bg-muted/50 p-3"><p className="text-muted-foreground">{attaBal?.label}</p><p className={`font-bold text-lg ${attaBal?.value < 0 ? "text-destructive" : ""}`}>{Math.abs(attaBal?.value || 0)} kg</p></div>
              </div>
              <div className="max-h-[50vh] overflow-y-auto scroll-x rounded-lg border border-border/60">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Particulars</TableHead>
                    <TableHead className="text-right">Wheat in</TableHead><TableHead className="text-right">Atta given</TableHead>
                    <TableHead className="text-right">Atta balance</TableHead>
                    <TableHead className="text-right">Sale / charge</TableHead><TableHead className="text-right">Payment</TableHead>
                    <TableHead>Mode</TableHead><TableHead className="text-right">Balance due</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {data.rows.map((r, i) => (
                      <TableRow key={i} data-testid={`cust-report-row-${i}`}>
                        <TableCell className="text-xs whitespace-nowrap">{r.date}</TableCell>
                        <TableCell className="text-sm">{r.particulars}</TableCell>
                        <TableCell className="text-right">{qty(r.wheat_in)}</TableCell>
                        <TableCell className="text-right">{qty(r.atta_given)}</TableCell>
                        <TableCell className={`text-right ${r.atta_balance < 0 ? "text-destructive" : ""}`}>{r.atta_balance}</TableCell>
                        <TableCell className="text-right">{r.debit ? money(r.debit) : ""}</TableCell>
                        <TableCell className="text-right text-secondary">{r.credit ? money(r.credit) : ""}</TableCell>
                        <TableCell className="text-xs">{r.mode}</TableCell>
                        <TableCell className="text-right font-medium">{money(r.balance)}</TableCell>
                      </TableRow>
                    ))}
                    {data.rows.length <= 1 && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-6">No transactions in this period.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
