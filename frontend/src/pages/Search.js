import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { money, downloadFile, formatApiErrorDetail } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search as SearchIcon, FileDown, FileText, Printer, Download, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const PRESETS = [
  { value: "any", label: "Any date" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this-week", label: "This week" },
  { value: "this-month", label: "This month" },
  { value: "financial-year", label: "Financial year" },
  { value: "custom", label: "Custom range" },
];

const MODES = ["Cash", "UPI", "Bank", "NEFT", "RTGS", "IMPS", "Cheque", "Flour Deduction", "Grain Deduction"];
const STATUSES = [{ value: "Paid", label: "Paid" }, { value: "Due", label: "Due (pending or part paid)" }];
const ALL = "__all__";

const fmt = (value, type) => {
  if (value === null || value === undefined || value === "") return "";
  if (type === "money" && typeof value === "number") return money(value);
  if (type === "qty" && typeof value === "number") return `${+value.toFixed(3)}`;
  return String(value);
};

export default function Search() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const [scopes, setScopes] = useState([]);
  const [q, setQ] = useState("");
  const [scope, setScope] = useState("");
  const [preset, setPreset] = useState("any");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get("/search/scopes").then((r) => setScopes(r.data)).catch(() => {});
  }, []);

  const query = useCallback(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (scope) p.set("scope", scope);
    if (preset === "custom") {
      if (start) p.set("start", start);
      if (end) p.set("end", end);
    } else if (preset !== "any") {
      p.set("preset", preset);
    }
    if (mode) p.set("mode", mode);
    if (status) p.set("status", status);
    return p.toString();
  }, [q, scope, preset, start, end, mode, status]);

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const { data: d } = await api.get(`/search?${query()}`);
      setData(d);
    } catch {
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  }, [query]);

  // Re-runs as filters change; typing is debounced so each keystroke is not a
  // request of its own.
  useEffect(() => {
    const t = setTimeout(run, 250);
    return () => clearTimeout(t);
  }, [run]);

  const remove = async (row) => {
    try {
      await api.delete(`/${row._scope}/${row.id}`);
      toast.success("Deleted");
      run();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const anyResults = useMemo(() => (data?.groups?.length || 0) > 0, [data]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-heading font-bold tracking-tight">Search</h1>
          <p className="text-muted-foreground mt-1">Across sales, purchases, parties, payments, bank and stock</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-11" onClick={() => window.print()} data-testid="search-print">
            <Printer className="h-4 w-4 mr-1" /> Print
          </Button>
          <Button variant="outline" className="h-11" onClick={() => window.open(`${api.defaults.baseURL}/search/export?format=pdf&${query()}`, "_blank")} data-testid="search-pdf">
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="outline" className="h-11" onClick={() => window.open(`${api.defaults.baseURL}/search/export?format=xlsx&${query()}`, "_blank")} data-testid="search-excel">
            <FileDown className="h-4 w-4 mr-1" /> Excel
          </Button>
        </div>
      </div>

      <Card className="p-4 border-border/60 mb-6 print:hidden">
        <div className="relative mb-3">
          <SearchIcon className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Invoice number, customer, supplier, mobile, item…"
            className="h-12 pl-9"
            data-testid="search-input"
            autoFocus
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div><Label>Module</Label>
            <Select value={scope || ALL} onValueChange={(v) => setScope(v === ALL ? "" : v)}>
              <SelectTrigger className="h-11 mt-1" data-testid="search-scope"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Everything</SelectItem>
                {scopes.map((s) => <SelectItem key={s.key} value={s.key}>{s.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div><Label>Period</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger className="h-11 mt-1" data-testid="search-preset"><SelectValue /></SelectTrigger>
              <SelectContent>{PRESETS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>

          {preset === "custom" ? (
            <>
              <div><Label>From</Label><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-11 mt-1" data-testid="search-start" /></div>
              <div><Label>To</Label><Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-11 mt-1" data-testid="search-end" /></div>
            </>
          ) : (
            <>
              <div><Label>Payment mode</Label>
                <Select value={mode || ALL} onValueChange={(v) => setMode(v === ALL ? "" : v)}>
                  <SelectTrigger className="h-11 mt-1" data-testid="search-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any mode</SelectItem>
                    {MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Status</Label>
                <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? "" : v)}>
                  <SelectTrigger className="h-11 mt-1" data-testid="search-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Any status</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex items-end pb-1 text-sm text-muted-foreground">
            {loading ? "Searching…" : data && <span data-testid="search-count">{data.total} match{data.total === 1 ? "" : "es"}</span>}
          </div>
        </div>
      </Card>

      {data && !anyResults && (
        <Card className="p-10 border-border/60 text-center text-muted-foreground" data-testid="search-empty">
          Nothing matched. Try a different spelling, or widen the period.
        </Card>
      )}

      {data?.groups?.map((group) => (
        <Card key={group.scope} className="border-border/60 mb-6 overflow-x-auto" data-testid={`search-group-${group.scope}`}>
          <div className="p-4 pb-2 flex items-center gap-2">
            <h3 className="font-heading font-bold text-lg">{group.title}</h3>
            <Badge variant="outline">{group.count}</Badge>
            {group.shown < group.count && (
              <span className="text-xs text-muted-foreground">showing the first {group.shown}</span>
            )}
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                {group.columns.map((c) => (
                  <TableHead key={c.key} className={c.align === "right" ? "text-right" : ""}>{c.label}</TableHead>
                ))}
                <TableHead className="text-right print:hidden">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.rows.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/50" data-testid={`search-row-${row.id}`}>
                  {group.columns.map((c) => (
                    <TableCell key={c.key} className={c.align === "right" ? "text-right tabular-nums" : ""}>
                      {fmt(row[c.key], c.type)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right print:hidden">
                    <div className="flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" title="Open in its module"
                        onClick={() => navigate(row._route)} data-testid={`open-${row.id}`}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      {row._invoice && (
                        <Button variant="ghost" size="icon" title="Download the invoice"
                          onClick={() => downloadFile(`/invoices/${row.id}/pdf`, `${row.invoice_number}.pdf`)}
                          data-testid={`print-${row.id}`}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Deleting a record is an admin action everywhere else,
                          so it is one here too rather than a shortcut around that. */}
                      {isAdmin && !["customers", "suppliers", "inventory", "payments"].includes(row._scope) && (
                        <Button variant="ghost" size="icon" title="Delete"
                          onClick={() => remove(row)} data-testid={`del-${row.id}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ))}
    </div>
  );
}
