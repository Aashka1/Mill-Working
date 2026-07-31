import { useCallback, useEffect, useMemo, useState } from "react";
import api, { money } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileDown, Printer, FileText, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const PRESETS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This week" },
  { value: "this-month", label: "This month" },
  { value: "financial-year", label: "Financial year" },
  { value: "custom", label: "Custom range" },
];

// A Select cannot hold an empty string as a value, so "no filter" needs its own.
const ALL = "__all__";

const fmt = (value, type) => {
  if (value === null || value === undefined || value === "") return "";
  if (type === "money" && typeof value === "number") return money(value);
  if (type === "qty" && typeof value === "number") return `${+value.toFixed(3)}`;
  return String(value);
};

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [key, setKey] = useState("daily-summary");
  const [preset, setPreset] = useState("this-month");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [party, setParty] = useState("");
  const [item, setItem] = useState("");
  const [bankId, setBankId] = useState("");

  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [banks, setBanks] = useState([]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  // The backend says which filters each report accepts, so this page does not
  // keep its own copy of that table and drift out of step with it.
  const spec = useMemo(() => reports.find((r) => r.key === key), [reports, key]);

  useEffect(() => {
    api.get("/reports").then((r) => setReports(r.data)).catch(() => toast.error("Could not load the report list"));
    api.get("/customers").then((r) => setCustomers(r.data)).catch(() => {});
    api.get("/suppliers").then((r) => setSuppliers(r.data)).catch(() => {});
    api.get("/products").then((r) => setProducts(r.data)).catch(() => {});
    api.get("/banks").then((r) => setBanks(r.data)).catch(() => {});
  }, []);

  // A filter that no longer applies would otherwise keep silently narrowing
  // the next report you pick.
  useEffect(() => {
    if (!spec) return;
    if (!spec.party) setParty("");
    if (!spec.item) setItem("");
    if (!spec.bank) setBankId("");
  }, [spec]);

  const query = useCallback(() => {
    const p = new URLSearchParams();
    if (preset === "custom") {
      if (start) p.set("start", start);
      if (end) p.set("end", end);
    } else {
      p.set("preset", preset);
    }
    if (party) p.set("party", party);
    if (item) p.set("item", item);
    if (bankId) p.set("bank_id", bankId);
    return p.toString();
  }, [preset, start, end, party, item, bankId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/reports/${key}?${query()}`);
      setData(d);
    } catch {
      toast.error("Could not run that report");
    } finally {
      setLoading(false);
    }
  }, [key, query]);

  useEffect(() => { load(); }, [load]);

  const download = (format) => {
    // Opened in a new tab so the browser saves the file; the session cookie
    // rides along, which is why the export endpoint checks it directly.
    window.open(`${api.defaults.baseURL}/reports/${key}/export?format=${format}&${query()}`, "_blank");
  };

  const grouped = useMemo(() => {
    const g = {};
    reports.forEach((r) => { (g[r.group] = g[r.group] || []).push(r); });
    return g;
  }, [reports]);

  const partyList = spec?.party === "supplier" ? suppliers : customers;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground mt-1">Every report, filtered by date and ready to print or export</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={load} disabled={loading} data-testid="report-refresh">
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" className="h-11" onClick={() => window.print()} data-testid="report-print">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" className="h-11" onClick={() => download("pdf")} data-testid="report-pdf">
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" className="h-11" onClick={() => download("xlsx")} data-testid="report-excel">
            <FileDown className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      <Card className="p-4 border-border/60 mb-6 print:hidden">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <Label>Report</Label>
            <Select value={key} onValueChange={setKey}>
              <SelectTrigger className="h-11 mt-1" data-testid="report-picker"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(grouped).map(([group, list]) => (
                  <div key={group}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group}</div>
                    {list.map((r) => <SelectItem key={r.key} value={r.key}>{r.title}</SelectItem>)}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Period</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-11 mt-1" data-testid="report-preset"><SelectValue /></SelectTrigger>
              <SelectContent>{PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {preset === "custom" ? (
            <>
              <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-11 mt-1" data-testid="report-start" /></div>
              <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11 mt-1" data-testid="report-end" /></div>
            </>
          ) : (
            <div className="lg:col-span-2 flex items-end pb-2 text-sm text-muted-foreground">
              {data && <span data-testid="report-range">Showing {data.start} to {data.end}</span>}
            </div>
          )}

          {spec?.party && (
            <div>
              <Label>{spec.party === "supplier" ? "Supplier" : "Customer"}</Label>
              <Select value={party || ALL} onValueChange={(v) => setParty(v === ALL ? "" : v)}>
                <SelectTrigger className="h-11 mt-1" data-testid="report-party"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All</SelectItem>
                  {partyList.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {spec?.item && (
            <div>
              <Label>Item</Label>
              <Select value={item || ALL} onValueChange={(v) => setItem(v === ALL ? "" : v)}>
                <SelectTrigger className="h-11 mt-1" data-testid="report-item"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All items</SelectItem>
                  {products.map((p) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {spec?.bank && (
            <div>
              <Label>Bank account</Label>
              <Select value={bankId || ALL} onValueChange={(v) => setBankId(v === ALL ? "" : v)}>
                <SelectTrigger className="h-11 mt-1" data-testid="report-bank"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All accounts</SelectItem>
                  {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </Card>

      {data && (
        <>
          {/* Only shown on paper, where the on-screen header is hidden. */}
          <div className="hidden print:block mb-4">
            <h2 className="text-xl font-bold">Gangotri Flour &amp; Oil Mill</h2>
            <p className="text-sm">{data.title} · {data.start} to {data.end}</p>
          </div>

          {data.summary?.length > 0 && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {data.summary.map((s) => (
                <Card key={s.label} className="p-4 border-border/60">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold font-heading mt-1" data-testid={`summary-${s.label}`}>
                    {s.type === "money" ? money(s.value) : s.value}
                  </p>
                </Card>
              ))}
            </div>
          )}

          <Card className="border-border/60 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {data.columns.map((c) => (
                    <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((row, i) => (
                  <TableRow key={i} className="hover:bg-muted/50" data-testid={`report-row-${i}`}>
                    {data.columns.map((c) => (
                      <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums" : ""}>
                        {fmt(row[c.key], c.type)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
                {data.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={data.columns.length} className="text-center text-muted-foreground py-8">
                      Nothing recorded in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>

          {data.note && <p className="text-xs text-muted-foreground mt-3">{data.note}</p>}
        </>
      )}
    </div>
  );
}
