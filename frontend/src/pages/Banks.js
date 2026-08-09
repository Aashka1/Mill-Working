import { useCallback, useEffect, useState } from "react";
import { PageToolbar } from "@/components/common";
import api, { money, today, formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, ArrowLeftRight, Landmark, CheckCircle2, Circle } from "lucide-react";
import { toast } from "sonner";

const ACCOUNT_TYPES = ["Savings", "Current", "Cash Credit"];
const BANK_MODES = ["Bank", "UPI", "NEFT", "RTGS", "IMPS", "Cheque"];

// Grouped so the form reads the way the money actually moves.
const TXN_TYPES = [
  { value: "Deposit", flow: "in" },
  { value: "Bank Receipt", flow: "in" },
  { value: "Interest Credit", flow: "in" },
  { value: "Withdrawal", flow: "out" },
  { value: "Bank Payment", flow: "out" },
  { value: "Bank Charges", flow: "out" },
];

const blankAccount = () => ({
  bank_name: "", branch: "", account_number: "", ifsc: "", holder_name: "",
  opening_balance: 0, account_type: "Current",
});

const blankTxn = () => ({
  bank_id: "", date: today(), txn_type: "Deposit", amount: "", mode: "Bank",
  party_name: "", reference: "", note: "",
});

const blankTransfer = () => ({ from_bank_id: "", to_bank_id: "", date: today(), amount: "", reference: "", note: "" });

export default function Banks() {
  const [accounts, setAccounts] = useState([]);
  const [txns, setTxns] = useState([]);
  const [filters, setFilters] = useState({ bank_id: "", start: "", end: "", mode: "" });

  const [accOpen, setAccOpen] = useState(false);
  const [editingAcc, setEditingAcc] = useState(null);
  const [af, setAf] = useState(blankAccount());

  const [txnOpen, setTxnOpen] = useState(false);
  const [tf, setTf] = useState(blankTxn());

  const [xferOpen, setXferOpen] = useState(false);
  const [xf, setXf] = useState(blankTransfer());

  const [reconBank, setReconBank] = useState("");
  const [statement, setStatement] = useState("");
  const [recon, setRecon] = useState(null);

  const loadAccounts = useCallback(async () => {
    try {
      const { data } = await api.get("/banks");
      setAccounts(data);
    } catch { /* toast already shown by the interceptor-free callers */ }
  }, []);

  const loadTxns = useCallback(async () => {
    const q = Object.entries(filters).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    try {
      const { data } = await api.get(`/bank-transactions${q ? `?${q}` : ""}`);
      setTxns(data);
    } catch { /* leave the previous rows in place */ }
  }, [filters]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadTxns(); }, [loadTxns]);

  const totalBalance = accounts
    .filter((a) => a.active !== false)
    .reduce((sum, a) => sum + (a.balance || 0), 0);

  const openNewAcc = () => { setEditingAcc(null); setAf(blankAccount()); setAccOpen(true); };
  const openEditAcc = (a) => {
    setEditingAcc(a.id);
    setAf({
      bank_name: a.bank_name || "", branch: a.branch || "", account_number: a.account_number || "",
      ifsc: a.ifsc || "", holder_name: a.holder_name || "",
      opening_balance: a.opening_balance ?? 0, account_type: a.account_type || "Current",
    });
    setAccOpen(true);
  };

  const saveAcc = async () => {
    if (!af.bank_name.trim()) return toast.error("Enter the bank name");
    const body = { ...af, opening_balance: +af.opening_balance || 0 };
    try {
      if (editingAcc) {
        await api.put(`/banks/${editingAcc}`, body);
        toast.success("Bank account updated");
      } else {
        await api.post("/banks", body);
        toast.success("Bank account added");
      }
    } catch (e) {
      return toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
    setAccOpen(false); setEditingAcc(null); setAf(blankAccount());
    loadAccounts(); loadTxns();
  };

  const removeAcc = async (a) => {
    try {
      const { data } = await api.delete(`/banks/${a.id}`);
      toast.success(data.detail || "Deleted");
    } catch (e) {
      return toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
    loadAccounts();
  };

  const openNewTxn = () => {
    setTf({ ...blankTxn(), bank_id: filters.bank_id || accounts[0]?.id || "" });
    setTxnOpen(true);
  };

  const saveTxn = async () => {
    if (!tf.bank_id) return toast.error("Choose an account");
    if (!(+tf.amount > 0)) return toast.error("Enter an amount greater than zero");
    try {
      await api.post("/bank-transactions", { ...tf, amount: +tf.amount });
      toast.success("Transaction recorded");
    } catch (e) {
      return toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
    setTxnOpen(false); setTf(blankTxn());
    loadAccounts(); loadTxns();
  };

  const saveTransfer = async () => {
    if (!xf.from_bank_id || !xf.to_bank_id) return toast.error("Choose both accounts");
    if (!(+xf.amount > 0)) return toast.error("Enter an amount greater than zero");
    try {
      await api.post("/bank-transactions/transfer", { ...xf, amount: +xf.amount });
      toast.success("Transfer recorded on both accounts");
    } catch (e) {
      return toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
    setXferOpen(false); setXf(blankTransfer());
    loadAccounts(); loadTxns();
  };

  const removeTxn = async (t) => {
    try {
      await api.delete(`/bank-transactions/${t.id}`);
      toast.success("Deleted");
    } catch (e) {
      return toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
    loadAccounts(); loadTxns();
  };

  const toggleReconciled = async (t) => {
    try {
      await api.patch(`/bank-transactions/${t.id}/reconcile`, { reconciled: !t.reconciled });
    } catch (e) {
      return toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
    loadTxns();
    if (recon) runRecon(reconBank);
  };

  const runRecon = async (bankId, stmt = statement) => {
    if (!bankId) return;
    const q = stmt !== "" && !Number.isNaN(+stmt) ? `&statement_balance=${+stmt}` : "";
    try {
      const { data } = await api.get(`/bank-reconciliation?bank_id=${bankId}${q}`);
      setRecon(data);
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    }
  };

  return (
    <div>
      <PageToolbar
        title="Bank Management" subtitle="Accounts, transactions and reconciliation"
        actions={
          <>
            <Button variant="outline" className="h-11" onClick={() => { setXf({ ...blankTransfer() }); setXferOpen(true); }} data-testid="bank-transfer-btn">
              <ArrowLeftRight className="h-4 w-4 mr-1" /> Transfer
            </Button>
            <Button variant="outline" className="h-11" onClick={openNewTxn} data-testid="add-bank-txn-btn">
              <Plus className="h-4 w-4 mr-1" /> Transaction
            </Button>
            <Button className="h-11 active:scale-95 transition-transform" onClick={openNewAcc} data-testid="add-bank-btn">
              <Plus className="h-4 w-4 mr-1" /> Add Bank
            </Button>
          </>
        }
      />

      <Card className="p-4 border-border/60 mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
          <span className="text-muted-foreground">Total across all accounts</span>
        </div>
        <span className="text-2xl font-bold font-heading" data-testid="bank-total">{money(totalBalance)}</span>
      </Card>

      <Tabs defaultValue="accounts">
        <TabsList className="mb-6">
          <TabsTrigger value="accounts" data-testid="tab-bank-accounts">Accounts</TabsTrigger>
          <TabsTrigger value="txns" data-testid="tab-bank-txns">Transactions</TabsTrigger>
          <TabsTrigger value="recon" data-testid="tab-bank-recon">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <Card className="border-border/60 scroll-x">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Bank</TableHead><TableHead>Account</TableHead><TableHead>IFSC</TableHead>
                <TableHead>Type</TableHead><TableHead className="text-right">Balance</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {accounts.map((a) => (
                  <TableRow key={a.id} className="hover:bg-muted/50" data-testid={`bank-row-${a.id}`}>
                    <TableCell>
                      <div className="font-medium">{a.bank_name}</div>
                      <div className="text-xs text-muted-foreground">{a.branch || "—"} · {a.holder_name || "—"}</div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.account_number || "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{a.ifsc || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.account_type}</Badge>
                      {a.active === false && <Badge variant="outline" className="ml-1 text-muted-foreground">Closed</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{money(a.balance)}</TableCell>
                    <TableCell className="text-right flex gap-1 justify-end">
                      <Button variant="ghost" size="icon" onClick={() => openEditAcc(a)} data-testid={`edit-bank-${a.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => removeAcc(a)} data-testid={`del-bank-${a.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
                {accounts.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No bank accounts yet. Add one to start recording bank payments.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="txns">
          <Card className="p-4 border-border/60 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div><Label>Account</Label>
                <Select value={filters.bank_id || "all"} onValueChange={(v) => setFilters({ ...filters, bank_id: v === "all" ? "" : v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="filter-bank"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All accounts</SelectItem>
                    {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.bank_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Mode</Label>
                <Select value={filters.mode || "all"} onValueChange={(v) => setFilters({ ...filters, mode: v === "all" ? "" : v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="filter-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modes</SelectItem>
                    {BANK_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>From</Label><Input type="date" value={filters.start} onChange={(e) => setFilters({ ...filters, start: e.target.value })} className="h-11 mt-1" data-testid="filter-start" /></div>
              <div><Label>To</Label><Input type="date" value={filters.end} onChange={(e) => setFilters({ ...filters, end: e.target.value })} className="h-11 mt-1" data-testid="filter-end" /></div>
            </div>
          </Card>

          <Card className="border-border/60 scroll-x">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Account</TableHead><TableHead>Type</TableHead>
                <TableHead>Mode</TableHead><TableHead>Party / Reference</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead>Reconciled</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {txns.map((t) => (
                  <TableRow key={t.id} className="hover:bg-muted/50" data-testid={`bank-txn-${t.id}`}>
                    <TableCell>{t.date}</TableCell>
                    <TableCell>{t.bank_name}</TableCell>
                    <TableCell>
                      {t.txn_type}
                      {t.source_kind && <Badge variant="outline" className="ml-1 text-[10px]">auto</Badge>}
                    </TableCell>
                    <TableCell><Badge variant="outline">{t.mode}</Badge></TableCell>
                    <TableCell className="text-sm">
                      {t.party_name || "—"}
                      {t.reference && <span className="text-muted-foreground font-mono text-xs"> · {t.reference}</span>}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${t.amount < 0 ? "text-destructive" : "text-secondary"}`}>
                      {t.amount < 0 ? "−" : "+"}{money(Math.abs(t.amount))}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" onClick={() => toggleReconciled(t)} data-testid={`recon-${t.id}`}>
                        {t.reconciled
                          ? <span className="flex items-center gap-1 text-secondary text-xs"><CheckCircle2 className="h-4 w-4" />{t.reconciled_date || "Yes"}</span>
                          : <span className="flex items-center gap-1 text-muted-foreground text-xs"><Circle className="h-4 w-4" />No</span>}
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      {!t.source_kind && <Button variant="ghost" size="icon" onClick={() => removeTxn(t)}><Trash2 className="h-4 w-4 text-destructive" /></Button>}
                    </TableCell>
                  </TableRow>
                ))}
                {txns.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">No transactions for this filter.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="recon">
          <Card className="p-4 border-border/60 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <div><Label>Account</Label>
                <Select value={reconBank} onValueChange={(v) => { setReconBank(v); runRecon(v); }}>
                  <SelectTrigger className="h-11 mt-1" data-testid="recon-bank"><SelectValue placeholder="Choose an account" /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.bank_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Balance on your statement</Label>
                <Input type="number" value={statement} onChange={(e) => setStatement(e.target.value)} className="h-11 mt-1" data-testid="recon-statement" />
              </div>
              <Button className="h-11" onClick={() => runRecon(reconBank)} data-testid="recon-run">Compare</Button>
            </div>
          </Card>

          {recon && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  ["Book balance", recon.book_balance],
                  ["Cleared balance", recon.cleared_balance],
                  ["Not yet cleared", recon.uncleared_total],
                  ["Statement", recon.statement_balance],
                ].map(([label, value]) => (
                  <Card key={label} className="p-4 border-border/60">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold font-heading mt-1">{value == null ? "—" : money(value)}</p>
                  </Card>
                ))}
              </div>

              {recon.statement_balance != null && (
                <Card className={`p-4 mb-4 border ${recon.matched ? "border-secondary/40 bg-secondary/10" : "border-destructive/40 bg-destructive/10"}`}>
                  <p className={`font-semibold ${recon.matched ? "text-secondary" : "text-destructive"}`} data-testid="recon-difference">
                    {recon.matched
                      ? "Reconciled — the statement matches the cleared balance."
                      : `Difference of ${money(Math.abs(recon.difference))} between the statement and the cleared balance.`}
                  </p>
                  {!recon.matched && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Tick off the entries below as you find them on the statement. Anything left is what explains the gap.
                    </p>
                  )}
                </Card>
              )}

              <Card className="border-border/60 scroll-x">
                <div className="p-4 pb-0 text-sm text-muted-foreground">
                  {recon.unreconciled_count} not yet reconciled · {recon.reconciled_count} reconciled
                </div>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Date</TableHead><TableHead>Type</TableHead><TableHead>Mode</TableHead>
                    <TableHead>Party / Reference</TableHead><TableHead className="text-right">Amount</TableHead><TableHead></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {recon.unreconciled.map((t) => (
                      <TableRow key={t.id} data-testid={`unrecon-${t.id}`}>
                        <TableCell>{t.date}</TableCell>
                        <TableCell>{t.txn_type}</TableCell>
                        <TableCell><Badge variant="outline">{t.mode}</Badge></TableCell>
                        <TableCell className="text-sm">{t.party_name || "—"}{t.reference && <span className="text-muted-foreground font-mono text-xs"> · {t.reference}</span>}</TableCell>
                        <TableCell className={`text-right font-medium ${t.amount < 0 ? "text-destructive" : "text-secondary"}`}>
                          {t.amount < 0 ? "−" : "+"}{money(Math.abs(t.amount))}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => toggleReconciled(t)} data-testid={`mark-recon-${t.id}`}>Mark reconciled</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {recon.unreconciled.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Everything is reconciled.</TableCell></TableRow>}
                  </TableBody>
                </Table>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Add / edit account */}
      <Dialog open={accOpen} onOpenChange={(o) => { setAccOpen(o); if (!o) setEditingAcc(null); }}>
        <DialogContent className="max-w-lg dialog-scroll">
          <DialogHeader><DialogTitle>{editingAcc ? "Edit" : "Add"} Bank Account</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1">
            <div><Label>Bank name</Label><Input value={af.bank_name} onChange={(e) => setAf({ ...af, bank_name: e.target.value })} className="h-11 mt-1" data-testid="bank-name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Branch</Label><Input value={af.branch} onChange={(e) => setAf({ ...af, branch: e.target.value })} className="h-11 mt-1" data-testid="bank-branch" /></div>
              <div><Label>Account number</Label><Input value={af.account_number} onChange={(e) => setAf({ ...af, account_number: e.target.value })} className="h-11 mt-1" data-testid="bank-account-number" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>IFSC code</Label><Input value={af.ifsc} onChange={(e) => setAf({ ...af, ifsc: e.target.value.toUpperCase() })} className="h-11 mt-1" data-testid="bank-ifsc" /></div>
              <div><Label>Account holder</Label><Input value={af.holder_name} onChange={(e) => setAf({ ...af, holder_name: e.target.value })} className="h-11 mt-1" data-testid="bank-holder" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Account type</Label>
                <Select value={af.account_type} onValueChange={(v) => setAf({ ...af, account_type: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="bank-type"><SelectValue /></SelectTrigger>
                  <SelectContent>{ACCOUNT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Opening balance ₹</Label>
                <Input type="number" value={af.opening_balance} onChange={(e) => setAf({ ...af, opening_balance: e.target.value })} className="h-11 mt-1" data-testid="bank-opening" />
                {editingAcc && <p className="text-xs text-muted-foreground mt-1">Changing this shifts every balance on this account.</p>}
              </div>
            </div>
          </div>
          <DialogFooter><Button onClick={saveAcc} data-testid="save-bank-btn">{editingAcc ? "Update" : "Save"} Account</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual transaction */}
      <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
        <DialogContent className="max-w-lg dialog-scroll">
          <DialogHeader><DialogTitle>Bank Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              For movements that are not already coming from a sale, purchase or payment — those post here on their own.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Account</Label>
                <Select value={tf.bank_id} onValueChange={(v) => setTf({ ...tf, bank_id: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="txn-bank"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.active !== false).map((a) => <SelectItem key={a.id} value={a.id}>{a.bank_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Date</Label><Input type="date" value={tf.date} onChange={(e) => setTf({ ...tf, date: e.target.value })} className="h-11 mt-1" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Type</Label>
                <Select value={tf.txn_type} onValueChange={(v) => setTf({ ...tf, txn_type: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="txn-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TXN_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.value} {t.flow === "in" ? "(money in)" : "(money out)"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Mode</Label>
                <Select value={tf.mode} onValueChange={(v) => setTf({ ...tf, mode: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="txn-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>{BANK_MODES.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Amount ₹</Label><Input type="number" value={tf.amount} onChange={(e) => setTf({ ...tf, amount: e.target.value })} className="h-11 mt-1" data-testid="txn-amount" /></div>
              <div><Label>Reference</Label><Input value={tf.reference} onChange={(e) => setTf({ ...tf, reference: e.target.value })} placeholder="Cheque no. / UTR" className="h-11 mt-1" data-testid="txn-reference" /></div>
            </div>
            <div><Label>Party</Label><Input value={tf.party_name} onChange={(e) => setTf({ ...tf, party_name: e.target.value })} className="h-11 mt-1" data-testid="txn-party" /></div>
            <div><Label>Note</Label><Input value={tf.note} onChange={(e) => setTf({ ...tf, note: e.target.value })} className="h-11 mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={saveTxn} data-testid="save-txn-btn">Save Transaction</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer */}
      <Dialog open={xferOpen} onOpenChange={setXferOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Transfer Between Accounts</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label>From</Label>
                <Select value={xf.from_bank_id} onValueChange={(v) => setXf({ ...xf, from_bank_id: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="xfer-from"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.active !== false).map((a) => <SelectItem key={a.id} value={a.id}>{a.bank_name} · {money(a.balance)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>To</Label>
                <Select value={xf.to_bank_id} onValueChange={(v) => setXf({ ...xf, to_bank_id: v })}>
                  <SelectTrigger className="h-11 mt-1" data-testid="xfer-to"><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{accounts.filter((a) => a.active !== false && a.id !== xf.from_bank_id).map((a) => <SelectItem key={a.id} value={a.id}>{a.bank_name} · {money(a.balance)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Date</Label><Input type="date" value={xf.date} onChange={(e) => setXf({ ...xf, date: e.target.value })} className="h-11 mt-1" /></div>
              <div><Label>Amount ₹</Label><Input type="number" value={xf.amount} onChange={(e) => setXf({ ...xf, amount: e.target.value })} className="h-11 mt-1" data-testid="xfer-amount" /></div>
            </div>
            <div><Label>Reference</Label><Input value={xf.reference} onChange={(e) => setXf({ ...xf, reference: e.target.value })} placeholder="UTR / cheque no." className="h-11 mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={saveTransfer} data-testid="save-xfer-btn">Record Transfer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
