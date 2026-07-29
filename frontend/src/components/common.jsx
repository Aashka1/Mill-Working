import { useCallback, useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Search } from "lucide-react";

export function useList(path) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(path);
      setItems(data);
    } catch (e) {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [path]);
  useEffect(() => { load(); }, [load]);

  const create = async (body) => {
    await api.post(path, body);
    toast.success("Saved successfully");
    await load();
  };
  const remove = async (id) => {
    try {
      await api.delete(`${path}/${id}`);
      toast.success("Deleted");
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Delete failed (admin only)");
    }
  };
  return { items, loading, load, create, remove, setItems };
}

const STATUS_STYLES = {
  Paid: "bg-secondary/15 text-secondary border-secondary/30 hover:bg-secondary/15",
  // Amber: part paid is neither settled nor untouched.
  Partial: "bg-amber-500/15 text-amber-600 border-amber-500/30 hover:bg-amber-500/15 dark:text-amber-400",
  Pending: "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/10",
};

export function StatusBadge({ status, balance }) {
  return (
    <Badge
      data-testid={`status-${status}`}
      className={STATUS_STYLES[status] || STATUS_STYLES.Pending}
      variant="outline"
    >
      {status === "Partial" && balance != null ? `Partial · ₹${Number(balance).toLocaleString("en-IN")} due` : status}
    </Badge>
  );
}

export function StatCard({ label, value, icon: Icon, accent = "primary", sub, testid }) {
  return (
    <Card data-testid={testid} className="p-6 border-border/60 h-full flex flex-col justify-between animate-fade-in">
      <div className="flex items-start justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon && (
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center bg-${accent}/10`}>
            <Icon className={`h-5 w-5 text-${accent}`} />
          </div>
        )}
      </div>
      <div className="mt-4">
        <p className="text-3xl font-heading font-bold tracking-tight">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </div>
    </Card>
  );
}

export function PageToolbar({ title, subtitle, search, setSearch, actions, searchTestid }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-8">
      <div>
        <h1 className="text-3xl font-heading font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">
        {setSearch && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              data-testid={searchTestid}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="h-11 pl-9 w-full md:w-64"
            />
          </div>
        )}
        {actions}
      </div>
    </div>
  );
}

export function useFilter(items, query, fields) {
  return useMemo(() => {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter((it) => fields.some((f) => String(it[f] ?? "").toLowerCase().includes(q)));
  }, [items, query, fields]);
}

export { Button, Input };
