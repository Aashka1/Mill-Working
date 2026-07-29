import { useEffect, useState } from "react";
import api, { money, today } from "@/lib/api";
import { StatCard } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Wallet, CalendarDays, CalendarRange, Coins } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

export default function Reports() {
  const [a, setA] = useState(null);
  const [cb, setCb] = useState(null);

  useEffect(() => {
    api.get("/sales-analytics").then((r) => setA(r.data)).catch(() => {});
    api.get(`/cashbook?date=${today()}`).then((r) => setCb(r.data)).catch(() => {});
  }, []);

  if (!a) return <div className="text-muted-foreground">Loading reports...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold tracking-tight">Reports &amp; Analytics</h1>
        <p className="text-muted-foreground mt-1">Sales by product, revenue, profit &amp; daily cash book</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard testid="rep-today" label="Sales Today" value={money(a.today)} icon={CalendarDays} accent="primary" />
        <StatCard testid="rep-month" label="Sales This Month" value={money(a.month)} icon={CalendarRange} accent="secondary" />
        <StatCard testid="rep-year" label="Sales This Year" value={money(a.year)} icon={TrendingUp} accent="primary" />
        <StatCard testid="rep-profit" label="Total Profit" value={money(a.total_profit)} icon={Wallet} accent="secondary" />
      </div>

      {cb && (
        <Card className="p-6 border-border/60 mb-6" data-testid="cashbook-card">
          <div className="flex items-center gap-2 mb-4"><Coins className="h-5 w-5 text-secondary" /><h3 className="font-heading font-bold text-lg">Daily Cash Book — {cb.date}</h3></div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div><p className="text-muted-foreground">Opening Cash</p><p className="font-heading font-bold text-lg">{money(cb.opening)}</p></div>
            <div><p className="text-muted-foreground">+ Received</p><p className="font-heading font-bold text-lg text-secondary">{money(cb.payments_received)}</p></div>
            <div><p className="text-muted-foreground">− Supplier Paid</p><p className="font-heading font-bold text-lg text-destructive">{money(cb.supplier_payments)}</p></div>
            <div><p className="text-muted-foreground">− Expenses</p><p className="font-heading font-bold text-lg text-destructive">{money(cb.expenses)}</p></div>
            <div><p className="text-muted-foreground">= Closing Cash</p><p className="font-heading font-bold text-lg text-primary">{money(cb.closing)}</p></div>
          </div>
        </Card>
      )}

      <Card className="p-6 border-border/60 mb-6">
        <h3 className="font-heading font-bold text-lg mb-4">Revenue by Product</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={a.by_product.slice(0, 10)}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
            <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip formatter={(v) => money(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
            <Bar dataKey="revenue" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Revenue" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-border/60">
          <h3 className="font-heading font-bold text-lg mb-4">Top Selling Products</h3>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Profit</TableHead></TableRow></TableHeader>
            <TableBody>
              {a.top.map((r, i) => <TableRow key={i} data-testid={`top-${i}`}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right">{r.qty}</TableCell><TableCell className="text-right">{money(r.revenue)}</TableCell><TableCell className="text-right text-secondary">{money(r.profit)}</TableCell></TableRow>)}
              {a.top.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No sales yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
        <Card className="p-6 border-border/60">
          <h3 className="font-heading font-bold text-lg mb-4">Least Selling Products</h3>
          <Table>
            <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead><TableHead className="text-right">Revenue</TableHead></TableRow></TableHeader>
            <TableBody>
              {a.least.map((r, i) => <TableRow key={i} data-testid={`least-${i}`}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right">{r.qty}</TableCell><TableCell className="text-right">{money(r.revenue)}</TableCell></TableRow>)}
              {a.least.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">No sales yet.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
