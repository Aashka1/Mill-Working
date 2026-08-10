import { useCallback, useEffect, useState } from "react";
import { PageToolbar } from "@/components/common";
import api, { money, today, downloadFile, formatApiErrorDetail } from "@/lib/api";
import { PartySelect } from "@/components/PartySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Wheat, Download, Trash2, History, ArrowDownToLine, IndianRupee } from "lucide-react";
import { PaymentDialog } from "@/components/PaymentDialog";
import { toast } from "sonner";

const CASH = "Cash";
const FLOUR = "Flour Deduction";
const MATERIAL = "Material";

const blankDeposit = () => ({
  date: today(), customer_name: "", quantity_kg: "", quantity_quintal: "", grain: "Wheat", note: "",
  milling_payment: CASH, conversion_percent: "", pisai_rate: "",
  payment_mode: "Cash", bank_id: "", payment_status: "Paid",
});

const blankIssue = () => ({ date: today(), customer_name: "", flour_kg: "", flour_quintal: "", note: "" });
const blankWithdrawal = () => ({
  date: today(), customer_name: "", flour_kg: "", flour_quintal: "",
  grinding_type: CASH, deduction_percent: "", charge_per_kg: "",
  material_item: "", material_qty: "", material_value: "",
  payment_mode: "Cash", bank_id: "", payment_status: "Paid", note: "",
});

export default function Deposits() {
  const [summary, setSummary] = useState({ rows: [], total_remaining_kg: 0, depositors: 0 });
  const [settings, setSettings] = useState({});
  const [customers, setCustomers] = useState([]);
  const [banks, setBanks] = useState([]);

  const [depOpen, setDepOpen] = useState(false);
  const [df, setDf] = useState(blankDeposit());
  const [wdOpen, setWdOpen] = useState(false);
  const [wf, setWf] = useState(blankWithdrawal());
  const [statement, setStatement] = useState(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [isf, setIsf] = useState(blankIssue());
  const [payFor, setPayFor] = useState(null);

  const loadSummary = useCallback(async () => {
    try {
      const { data } = await api.get("/deposits/summary");
      setSummary(data);
    } catch { /* keep whatever is on screen */ }
  }, []);

  const loadCustomers = useCallback(async () => {
    try { setCustomers((await api.get("/customers")).data); } catch { /* non-fatal */ }
  }, []);

  useEffect(() => {
    loadSummary();
    loadCustomers();
    api.get("/settings").then((r) => setSettings(r.data)).catch(() => {});
    api.get("/banks").then((r) => setBanks(r.data)).catch(() => {});
  }, [loadSummary, loadCustomers]);

  const openStatement = async (name) => {
    try {
      const { data } = await api.get(`/deposits/${encodeURIComponent(name)}/statement`);
      setStatement(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const saveDeposit = async () => {
    if (!df.customer_name) return toast.error("Choose or add the depositor");
    try {
      const { data } = await api.post("/deposits", {
        ...df,
        quantity_kg: +df.quantity_kg || 0,
        quantity_quintal: +df.quantity_quintal || 0,
        conversion_percent: df.conversion_percent === "" ? null : +df.conversion_percent,
        pisai_rate: df.pisai_rate === "" ? null : +df.pisai_rate,
        bank_id: df.milling_payment === FLOUR ? null : (df.bank_id || null),
      });
      toast.success(`${data.quantity} kg wheat became ${data.flour_generated} kg flour · balance ${data.balance.remaining_kg} kg`);
      setDepOpen(false); setDf(blankDeposit());
      loadSummary();
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const openWithdrawal = (name = "") => {
    setWf({ ...blankWithdrawal(), customer_name: name });
    setWdOpen(true);
  };

  const saveWithdrawal = async () => {
    if (!wf.customer_name) return toast.error("Choose the depositor");
    const kind = wf.grinding_type;
    try {
      const { data } = await api.post("/withdrawals", {
        ...wf,
        flour_kg: +wf.flour_kg || 0,
        flour_quintal: +wf.flour_quintal || 0,
        deduction_percent: wf.deduction_percent === "" ? null : +wf.deduction_percent,
        charge_per_kg: wf.charge_per_kg === "" ? null : +wf.charge_per_kg,
        material_qty: wf.material_qty === "" ? null : +wf.material_qty,
        material_value: wf.material_value === "" ? null : +wf.material_value,
        bank_id: kind === CASH ? (wf.bank_id || null) : null,
      });
      toast.success(`${data.flour_delivered} kg flour delivered · ${data.balance.remaining_kg} kg still on deposit`);
      setWdOpen(false); setWf(blankWithdrawal());
      loadSummary();
      if (statement) openStatement(data.customer_name);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const openIssue = (name = "") => { setIsf({ ...blankIssue(), customer_name: name }); setIssueOpen(true); };

  const saveIssue = async () => {
    if (!isf.customer_name) return toast.error("Choose the customer");
    try {
      const { data } = await api.post("/issue-flour", {
        ...isf, flour_kg: +isf.flour_kg || 0, flour_quintal: +isf.flour_quintal || 0,
      });
      toast.success(`${data.flour_delivered} kg issued · ${data.balance.remaining_kg} kg left`);
      setIssueOpen(false); setIsf(blankIssue());
      loadSummary();
      if (statement) openStatement(data.customer_name);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  const removeEntry = async (entry) => {
    const path = entry.kind === "Deposit" ? "deposits" : "withdrawals";
    try {
      await api.delete(`/${path}/${entry.id}`);
      toast.success("Deleted");
      loadSummary();
      if (statement) openStatement(statement.balance.customer_name);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  // The conversion the deposit will apply, shown before it is saved.
  const depWheat = (+df.quantity_kg || 0) + (+df.quantity_quintal || 0) * 100;
  const depPctDefault = df.milling_payment === FLOUR
    ? (settings.deposit_flour_deduction_percent ?? 15)
    : (settings.cash_grinding_percent ?? 5);
  const depPct = df.conversion_percent === "" ? depPctDefault : +df.conversion_percent;
  const depWastage = +(depWheat * depPct / 100).toFixed(3);
  const depFlour = +(depWheat - depWastage).toFixed(3);
  const depRate = df.pisai_rate === "" ? (settings.grinding_rate ?? 2) : +df.pisai_rate;
  const depCharge = df.milling_payment === FLOUR ? 0 : +(depWheat * depRate).toFixed(2);
  const issueQty = (+isf.flour_kg || 0) + (+isf.flour_quintal || 0) * 100;
  const issueBal = summary.rows.find((r) => r.customer_name === isf.customer_name)?.remaining_kg ?? 0;

  // Mirrors the backend so the operator sees the outcome before saving.
  const flourAsked = (+wf.flour_kg || 0) + (+wf.flour_quintal || 0) * 100;
  const defaultPct = wf.grinding_type === FLOUR
    ? (settings.deposit_flour_deduction_percent ?? 15)
    : (settings.cash_grinding_percent ?? 5);
  const pct = wf.deduction_percent === "" ? defaultPct : +wf.deduction_percent;
  // Paying in flour takes the fee on top of what is handed over, so the
  // balance falls by both. Cash takes no flour at all.
  const deducted = wf.grinding_type === FLOUR ? +(flourAsked * pct / 100).toFixed(3) : 0;
  const flour = flourAsked;
  const drawn = +(flourAsked + deducted).toFixed(3);
  const rate = wf.charge_per_kg === "" ? (settings.grinding_rate ?? 2) : +wf.charge_per_kg;
  const charge = wf.grinding_type === FLOUR ? 0 : +(drawn * rate).toFixed(2);
  const materials = settings.materials?.length ? settings.materials : ["Wheat", "Rice", "Maize", "Mustard"];

  return (
    <div>
      <PageToolbar
        title="Deposit Wheat" subtitle="Wheat held for farmers, and flour drawn against it"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => openIssue()} data-testid="issue-flour-btn">
              <ArrowDownToLine className="h-4 w-4 mr-1" /> Give Flour
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => openWithdrawal()} data-testid="add-withdrawal-btn"
              title="For wheat deposited before it was ground on arrival — grinds and charges at collection">
              Grind on collection
            </Button>
            <Button className="h-11 active:scale-95 transition-transform" onClick={() => { setDf(blankDeposit()); setDepOpen(true); }} data-testid="add-deposit-btn">
              <Plus className="h-4 w-4 mr-1" /> New Deposit
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <Card className="p-4 border-border/60">
          <p className="text-xs text-muted-foreground">Depositors</p>
          <p className="text-2xl font-bold font-heading mt-1" data-testid="depositor-count">{summary.depositors}</p>
        </Card>
        <Card className="p-4 border-border/60">
          <p className="text-xs text-muted-foreground">Wheat on deposit</p>
          <p className="text-2xl font-bold font-heading mt-1" data-testid="total-on-deposit">{summary.total_remaining_kg} kg</p>
          <p className="text-xs text-muted-foreground">{(summary.total_remaining_kg / 100).toFixed(2)} quintals</p>
        </Card>
        <Card className="p-4 border-border/60">
          <p className="text-xs text-muted-foreground">Current deductions</p>
          <p className="text-sm font-medium mt-2">Cash grinding {settings.cash_grinding_percent ?? 5}%</p>
          <p className="text-sm font-medium">Flour deduction {settings.deposit_flour_deduction_percent ?? 15}%</p>
        </Card>
      </div>

      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Depositor</TableHead><TableHead>Mobile</TableHead>
            <TableHead className="text-right">Wheat deposited</TableHead>
            <TableHead className="text-right">Flour made</TableHead>
            <TableHead className="text-right">Conversion</TableHead>
            <TableHead className="text-right">Flour given</TableHead>
            <TableHead className="text-right">Pisai charge</TableHead>
            <TableHead className="text-right">Flour balance</TableHead>
            <TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {summary.rows.map((r) => (
              <TableRow key={r.customer_name} className="hover:bg-muted/50" data-testid={`deposit-row-${r.customer_name}`}>
                <TableCell className="font-medium">{r.customer_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{r.phone || "—"}</TableCell>
                <TableCell className="text-right">{r.wheat_deposited_kg} kg</TableCell>
                <TableCell className="text-right">{r.flour_generated} kg</TableCell>
                <TableCell className="text-right text-muted-foreground">−{r.wastage} kg</TableCell>
                <TableCell className="text-right">{r.flour_delivered} kg</TableCell>
                <TableCell className="text-right">{money(r.grinding_charges)}</TableCell>
                <TableCell className="text-right font-semibold">
                  {r.remaining_kg} kg
                  <div className="text-xs text-muted-foreground font-normal">{r.remaining_quintal} qt of flour</div>
                </TableCell>
                <TableCell className="text-right flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" title="Statement" onClick={() => openStatement(r.customer_name)} data-testid={`statement-${r.customer_name}`}>
                    <History className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Give flour" onClick={() => openIssue(r.customer_name)} data-testid={`withdraw-${r.customer_name}`}>
                    <ArrowDownToLine className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {summary.rows.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No wheat on deposit yet.
              </TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* New deposit */}
      <Dialog open={depOpen} onOpenChange={setDepOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Wheat Deposit</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={df.date} onChange={(e) => setDf({ ...df, date: e.target.value })} className="h-11 mt-1" /></div>
              <div><Label>Grain</Label><Input value={df.grain} onChange={(e) => setDf({ ...df, grain: e.target.value })} className="h-11 mt-1" data-testid="deposit-grain" /></div>
            </div>
            <div><Label>Depositor</Label>
              <PartySelect kind="customer" value={df.customer_name}
                onChange={(v) => setDf({ ...df, customer_name: v })}
                items={customers} onCreated={loadCustomers} testid="deposit-customer" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Quintals</Label><Input type="number" value={df.quantity_quintal} onChange={(e) => setDf({ ...df, quantity_quintal: e.target.value })} className="h-11 mt-1" data-testid="deposit-quintal" /></div>
              <div><Label>Plus kilograms</Label><Input type="number" value={df.quantity_kg} onChange={(e) => setDf({ ...df, quantity_kg: e.target.value })} className="h-11 mt-1" data-testid="deposit-kg" /></div>
            </div>
            <div><Label>Milling charge paid by</Label>
              <Select value={df.milling_payment} onValueChange={(v) => setDf({ ...df, milling_payment: v })}>
                <SelectTrigger className="h-11 mt-1" data-testid="deposit-milling"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CASH}>Cash / UPI / Bank — charged separately</SelectItem>
                  <SelectItem value={FLOUR}>Deducted from the flour</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Conversion %</Label>
                <Input type="number" value={df.conversion_percent} onChange={(e) => setDf({ ...df, conversion_percent: e.target.value })}
                  placeholder={String(depPctDefault)} className="h-11 mt-1" data-testid="deposit-conversion" />
                <p className="text-xs text-muted-foreground mt-1">Blank uses the {depPctDefault}% in Settings.</p>
              </div>
              {df.milling_payment !== FLOUR && (
                <div><Label>Pisai rate ₹/kg</Label>
                  <Input type="number" value={df.pisai_rate} onChange={(e) => setDf({ ...df, pisai_rate: e.target.value })}
                    placeholder={String(settings.grinding_rate ?? 2)} className="h-11 mt-1" data-testid="deposit-rate" />
                </div>
              )}
            </div>

            {df.milling_payment !== FLOUR && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Payment</Label>
                  <Select value={df.payment_status === "Pending" ? "Credit" : df.payment_mode}
                    onValueChange={(v) => setDf({ ...df, payment_status: v === "Credit" ? "Pending" : "Paid", payment_mode: v === "Credit" ? "Cash" : v })}>
                    <SelectTrigger className="h-11 mt-1" data-testid="deposit-payment"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Cash", "UPI", "Bank", "NEFT", "RTGS", "IMPS", "Cheque"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      <SelectItem value="Credit">Credit (udhar)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {df.payment_status !== "Pending" && df.payment_mode !== "Cash" && (
                  <div><Label>Into which account</Label>
                    <Select value={df.bank_id} onValueChange={(v) => setDf({ ...df, bank_id: v })}>
                      <SelectTrigger className="h-11 mt-1" data-testid="deposit-bank"><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1" data-testid="deposit-preview">
              <div className="flex justify-between"><span className="text-muted-foreground">Wheat deposited</span><span>{depWheat.toFixed(2)} kg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Conversion at {depPct}%</span><span className="text-destructive">−{depWastage} kg</span></div>
              <div className="flex justify-between font-semibold border-t border-border/60 pt-1 mt-1">
                <span>Flour credited to the customer</span><span>{depFlour} kg</span>
              </div>
              <div className="flex justify-between"><span className="text-muted-foreground">Milling charge</span>
                <span>{df.milling_payment === FLOUR ? "taken in flour" : money(depCharge)}</span></div>
            </div>
            <p className="text-xs text-muted-foreground">
              The customer&apos;s flour is theirs — it is never counted as the mill&apos;s saleable stock.
            </p>
            <div><Label>Note</Label><Input value={df.note} onChange={(e) => setDf({ ...df, note: e.target.value })} className="h-11 mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={saveDeposit} data-testid="save-deposit-btn">Save Deposit</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw flour */}
      <Dialog open={wdOpen} onOpenChange={setWdOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Withdraw Flour</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={wf.date} onChange={(e) => setWf({ ...wf, date: e.target.value })} className="h-11 mt-1" /></div>
              <div><Label>Depositor</Label>
                <PartySelect kind="customer" value={wf.customer_name}
                  onChange={(v) => setWf({ ...wf, customer_name: v })}
                  items={customers} onCreated={loadCustomers} testid="withdraw-customer" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Flour delivered (kg)</Label><Input type="number" value={wf.flour_kg} onChange={(e) => setWf({ ...wf, flour_kg: e.target.value })} className="h-11 mt-1" data-testid="withdraw-kg" /></div>
              <div><Label>Plus quintals</Label><Input type="number" value={wf.flour_quintal} onChange={(e) => setWf({ ...wf, flour_quintal: e.target.value })} className="h-11 mt-1" data-testid="withdraw-quintal" /></div>
            </div>

            <div><Label>Grinding type</Label>
              <Select value={wf.grinding_type} onValueChange={(v) => setWf({ ...wf, grinding_type: v })}>
                <SelectTrigger className="h-11 mt-1" data-testid="withdraw-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={CASH}>Cash grinding — charge paid in money</SelectItem>
                  <SelectItem value={FLOUR}>Flour deduction — paid in flour</SelectItem>
                  <SelectItem value={MATERIAL}>Grain / material — paid in kind</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Deduction %</Label>
                <Input type="number" value={wf.deduction_percent} onChange={(e) => setWf({ ...wf, deduction_percent: e.target.value })}
                  placeholder={String(defaultPct)} className="h-11 mt-1" data-testid="withdraw-percent" />
                <p className="text-xs text-muted-foreground mt-1">Blank uses the {defaultPct}% in Settings.</p>
              </div>
              {wf.grinding_type !== FLOUR && (
                <div><Label>Charge ₹/kg</Label>
                  <Input type="number" value={wf.charge_per_kg} onChange={(e) => setWf({ ...wf, charge_per_kg: e.target.value })}
                    placeholder={String(settings.grinding_rate ?? 2)} className="h-11 mt-1" data-testid="withdraw-rate" />
                </div>
              )}
            </div>

            {wf.grinding_type === MATERIAL && (
              <div className="rounded-lg border border-border/60 p-3 grid grid-cols-3 gap-3" data-testid="withdraw-material">
                <div><Label>Material</Label>
                  <Select value={wf.material_item} onValueChange={(v) => setWf({ ...wf, material_item: v })}>
                    <SelectTrigger className="h-11 mt-1" data-testid="withdraw-material-item"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>{materials.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Quantity (kg)</Label><Input type="number" value={wf.material_qty} onChange={(e) => setWf({ ...wf, material_qty: e.target.value })} className="h-11 mt-1" data-testid="withdraw-material-qty" /></div>
                <div><Label>Value ₹</Label><Input type="number" value={wf.material_value} onChange={(e) => setWf({ ...wf, material_value: e.target.value })} className="h-11 mt-1" /></div>
              </div>
            )}

            {wf.grinding_type === CASH && (
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Payment</Label>
                  <Select value={wf.payment_status === "Pending" ? "Credit" : wf.payment_mode}
                    onValueChange={(v) => setWf({ ...wf, payment_status: v === "Credit" ? "Pending" : "Paid", payment_mode: v === "Credit" ? "Cash" : v })}>
                    <SelectTrigger className="h-11 mt-1" data-testid="withdraw-payment"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Cash", "UPI", "Bank", "NEFT", "RTGS", "IMPS", "Cheque"].map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      <SelectItem value="Credit">Credit (due)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {wf.payment_status !== "Pending" && wf.payment_mode !== "Cash" && (
                  <div><Label>Into which account</Label>
                    <Select value={wf.bank_id} onValueChange={(v) => setWf({ ...wf, bank_id: v })}>
                      <SelectTrigger className="h-11 mt-1" data-testid="withdraw-bank"><SelectValue placeholder="Choose" /></SelectTrigger>
                      <SelectContent>{banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.bank_name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1" data-testid="withdraw-preview">
              <div className="flex justify-between font-semibold"><span>Flour delivered</span><span>{flour.toFixed(2)} kg</span></div>
              {deducted > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">Kept as fee at {pct}%</span><span className="text-destructive">−{deducted} kg</span></div>
              )}
              <div className="flex justify-between border-t border-border/60 pt-1 mt-1">
                <span className="text-muted-foreground">Comes off the deposit</span><span>{drawn.toFixed(2)} kg</span>
              </div>
              <div className="flex justify-between border-t border-border/60 pt-1 mt-1">
                <span className="text-muted-foreground">Grinding charge</span>
                <span>{wf.grinding_type === FLOUR ? "paid in flour" : money(charge)}</span>
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveWithdrawal} data-testid="save-withdrawal-btn">Save Withdrawal</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <PaymentDialog open={!!payFor} onOpenChange={(o) => !o && setPayFor(null)} record={payFor}
        path="withdrawals" totalField="charge"
        onDone={() => { loadSummary(); if (statement) openStatement(statement.balance.customer_name); }} />

      {/* Give flour from the customer's balance */}
      <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Give Flour to Customer</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={isf.date} onChange={(e) => setIsf({ ...isf, date: e.target.value })} className="h-11 mt-1" /></div>
              <div><Label>Customer</Label>
                <PartySelect kind="customer" value={isf.customer_name}
                  onChange={(v) => setIsf({ ...isf, customer_name: v })}
                  items={customers} onCreated={loadCustomers} testid="issue-customer" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Flour given (kg)</Label><Input type="number" value={isf.flour_kg} onChange={(e) => setIsf({ ...isf, flour_kg: e.target.value })} className="h-11 mt-1" data-testid="issue-kg" /></div>
              <div><Label>Plus quintals</Label><Input type="number" value={isf.flour_quintal} onChange={(e) => setIsf({ ...isf, flour_quintal: e.target.value })} className="h-11 mt-1" data-testid="issue-quintal" /></div>
            </div>
            <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1" data-testid="issue-preview">
              <div className="flex justify-between"><span className="text-muted-foreground">Flour on account</span><span>{issueBal} kg</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Giving</span><span className="text-destructive">−{issueQty.toFixed(2)} kg</span></div>
              <div className="flex justify-between font-semibold border-t border-border/60 pt-1 mt-1">
                <span>Balance after</span>
                <span className={issueQty > issueBal ? "text-destructive" : ""}>
                  {(issueBal - issueQty).toFixed(2)} kg{issueQty > issueBal && " — more than they have"}
                </span>
              </div>
            </div>
            <div><Label>Note</Label><Input value={isf.note} onChange={(e) => setIsf({ ...isf, note: e.target.value })} className="h-11 mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={saveIssue} data-testid="save-issue-btn">Give Flour</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Statement */}
      <Dialog open={!!statement} onOpenChange={(o) => !o && setStatement(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>
            {statement?.balance?.customer_name} — {statement?.balance?.remaining_kg} kg on deposit
          </DialogTitle></DialogHeader>
          <div className="overflow-y-auto scroll-x pr-1">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Entry</TableHead>
                <TableHead className="text-right">In</TableHead><TableHead className="text-right">Out</TableHead>
                <TableHead>Type</TableHead><TableHead className="text-right">Deducted</TableHead>
                <TableHead className="text-right">Flour</TableHead><TableHead className="text-right">Charge</TableHead>
                <TableHead className="text-right">Balance</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {statement?.entries?.map((e) => (
                  <TableRow key={e.id} data-testid={`statement-row-${e.id}`}>
                    <TableCell>{e.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{e.kind}</Badge>
                      {e.note && <div className="text-xs text-muted-foreground mt-1">{e.note}</div>}
                    </TableCell>
                    <TableCell className="text-right text-secondary">{e.wheat_in || ""}</TableCell>
                    <TableCell className="text-right text-destructive">{e.wheat_out || ""}</TableCell>
                    <TableCell className="text-sm">{e.grinding_type}{e.percent !== "" && e.percent != null ? ` · ${e.percent}%` : ""}</TableCell>
                    <TableCell className="text-right">{e.deducted || ""}</TableCell>
                    <TableCell className="text-right">{e.flour || ""}</TableCell>
                    <TableCell className="text-right">{e.charge ? money(e.charge) : ""}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">{e.balance} kg</TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      {/* A charge left on credit can be settled from here, the
                          same as any other bill. */}
                      {e.kind === "Withdrawal" && e.charge > 0 && e.payment_status !== "Paid" && (
                        <Button variant="ghost" size="icon" title="Record a payment"
                          onClick={() => setPayFor({ id: e.id, charge: e.charge, amount_paid: e.amount_paid || 0, date: e.date })}
                          data-testid={`pay-withdrawal-${e.id}`}>
                          <IndianRupee className="h-4 w-4 text-secondary" />
                        </Button>
                      )}
                      {e.invoice_number && (
                        <Button variant="ghost" size="icon" title="Invoice"
                          onClick={() => downloadFile(`/invoices/${e.id}/pdf`, `${e.invoice_number}.pdf`)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => removeEntry(e)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!statement?.entries?.length && (
                  <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No entries yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-auto">
              <Wheat className="h-4 w-4" />
              {statement?.balance?.flour_delivered} kg flour delivered so far ·
              {" "}{statement?.balance?.flour_deducted} kg kept as fees
            </div>
            <Button variant="outline" onClick={() => setStatement(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
