import { useEffect, useState } from "react";
import api from "@/lib/api";
import { money } from "@/lib/api";
import { StatCard } from "@/components/common";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp, Wallet, ShoppingCart, Droplets, Wheat, Receipt,
  AlertTriangle, Package, Landmark, Users, CalendarCheck,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

const PIE_COLORS = ["hsl(var(--chart-1))", "hsl(var(--chart-2))", "hsl(var(--chart-3))"];

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [day, setDay] = useState(null);
  const dayDate = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    api.get("/dashboard").then((r) => setD(r.data)).catch(() => {});
    api.get(`/daybook?date=${dayDate}`).then((r) => setDay(r.data)).catch(() => {});
  }, []);

  if (!d) return <div className="text-muted-foreground">Loading dashboard...</div>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-heading font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Business overview at a glance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard testid="stat-total-income" label="Total Income" value={money(d.total_income)} icon={TrendingUp} accent="primary" sub={`Today: ${money(d.daily_income)}`} />
        <StatCard testid="stat-profit" label="Net Profit / Loss" value={money(d.profit)} icon={Wallet} accent="secondary" sub={`This month income: ${money(d.monthly_income)}`} />
        <StatCard testid="stat-pending" label="Pending Payments" value={money(d.pending_customer)} icon={Landmark} accent="destructive" sub="Customer dues" />
        <StatCard testid="stat-stock" label="Total Stock" value={`${d.total_stock} kg`} icon={Package} accent="primary" sub={`${d.inventory_count} products`} />
      </div>

      {day && (
        <Card className="p-6 border-border/60 mb-6" data-testid="daily-summary">
          <div className="flex items-center gap-2 mb-4">
            <CalendarCheck className="h-5 w-5 text-primary" />
            <h3 className="font-heading font-bold text-lg">Today's Summary — {day.date}</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
            <div><p className="text-muted-foreground">Income Billed</p><p className="font-heading font-bold text-lg">{money(day.income)}</p></div>
            <div><p className="text-muted-foreground">Collected</p><p className="font-heading font-bold text-lg text-secondary">{money(day.collected)}</p></div>
            <div><p className="text-muted-foreground">Pending</p><p className="font-heading font-bold text-lg text-destructive">{money(day.pending)}</p></div>
            <div><p className="text-muted-foreground">Expenses</p><p className="font-heading font-bold text-lg">{money(day.expenses)}</p></div>
            <div><p className="text-muted-foreground">Net Cash</p><p className="font-heading font-bold text-lg">{money(day.net)}</p></div>
            <div><p className="text-muted-foreground">Orders Today</p><p className="font-heading font-bold text-lg">{day.counts.sales + day.counts.grinding + day.counts.oil}</p></div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard testid="stat-sales" label="Product Sales" value={money(d.total_sales)} icon={ShoppingCart} accent="primary" />
        <StatCard testid="stat-grinding" label="Grinding Orders" value={d.grinding_orders} icon={Wheat} accent="secondary" />
        <StatCard testid="stat-oil" label="Oil Extraction Orders" value={d.oil_orders} icon={Droplets} accent="primary" />
        <StatCard testid="stat-expenses" label="Total Expenses" value={money(d.total_expenses)} icon={Receipt} accent="destructive" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="p-6 lg:col-span-2 border-border/60">
          <h3 className="font-heading font-bold text-lg mb-4">Income vs Expenses (6 months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={d.trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="income" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} name="Income" />
              <Bar dataKey="expense" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} name="Expense" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6 border-border/60">
          <h3 className="font-heading font-bold text-lg mb-4">Revenue Breakdown</h3>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={d.revenue_breakdown} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={85}>
                {d.revenue_breakdown.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => money(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-border/60" data-testid="low-stock-panel">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <h3 className="font-heading font-bold text-lg">Low Stock Alerts</h3>
          </div>
          {d.low_stock.length === 0 ? (
            <p className="text-sm text-muted-foreground">All products above threshold.</p>
          ) : (
            <div className="space-y-2">
              {d.low_stock.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <Badge variant="outline" className="text-destructive border-destructive/30">
                    {p.stock} {p.unit} left
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 border-border/60">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-primary" />
            <h3 className="font-heading font-bold text-lg">Dues Summary</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span>Customer pending payments</span>
              <span className="font-heading font-bold text-destructive">{money(d.pending_customer)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span>Supplier dues payable</span>
              <span className="font-heading font-bold">{money(d.supplier_dues)}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span>Service income (grinding + oil)</span>
              <span className="font-heading font-bold text-secondary">{money(d.service_income)}</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
