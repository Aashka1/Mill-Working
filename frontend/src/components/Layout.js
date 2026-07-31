import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Package, ShoppingCart, Wheat, Droplets, Receipt,
  Users, Truck, FileText, Sun, Moon, LogOut, Bell, Menu, X, Factory, ArrowLeftRight, Wrench, Calculator, BarChart3, Cog, Landmark, Search as SearchIcon
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/inventory", label: "Inventory", icon: Package },
  { to: "/sales", label: "Sales", icon: ShoppingCart },
  { to: "/grinding", label: "Wheat Grinding", icon: Wheat },
  { to: "/oil", label: "Oil Extraction", icon: Droplets },
  { to: "/production", label: "Production", icon: Factory },
  { to: "/exchange", label: "Exchange", icon: ArrowLeftRight },
  { to: "/expenses", label: "Expenses", icon: Receipt },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/banks", label: "Bank", icon: Landmark },
  { to: "/search", label: "Search", icon: SearchIcon },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/costing", label: "Costing", icon: Calculator },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/settings", label: "Settings", icon: Cog },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [notes, setNotes] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/notifications").then((r) => setNotes(r.data)).catch(() => {});
  }, []);

  const doLogout = async () => { await logout(); navigate("/login"); };

  const SidebarContent = () => (
    <>
      <div className="flex items-center gap-2 px-6 h-16 border-b border-border/60">
        <div className="h-9 w-9 rounded-lg bg-primary flex items-center justify-center">
          <Wheat className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <p className="font-heading font-bold leading-none">Gangotri Mill</p>
          <p className="text-[11px] text-muted-foreground">Flour &amp; Oil Mill</p>
        </div>
      </div>
      <nav className="p-3 space-y-1 overflow-y-auto">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
            onClick={() => setOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`
            }
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </>
  );

  return (
    <div className="min-h-screen flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col border-r border-border/60 bg-card fixed inset-y-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 flex flex-col bg-card border-r border-border/60">
            <SidebarContent />
          </aside>
        </div>
      )}

      <div className="flex-1 lg:ml-64 flex flex-col">
        <header className="h-16 border-b border-border/60 bg-background/80 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-4 md:px-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(!open)} data-testid="mobile-menu-btn">
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <p className="text-sm text-muted-foreground hidden sm:block">Welcome back, <span className="font-semibold text-foreground">{user?.name}</span></p>
          </div>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" data-testid="notifications-btn">
                  <Bell className="h-5 w-5" />
                  {notes.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-[10px] text-white flex items-center justify-center">
                      {notes.length > 9 ? "9+" : notes.length}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications ({notes.length})</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notes.length === 0 && <div className="px-2 py-4 text-sm text-muted-foreground text-center">All caught up 🎉</div>}
                {notes.slice(0, 12).map((n, i) => (
                  <DropdownMenuItem key={i} className="text-sm py-2 whitespace-normal" data-testid={`note-${i}`}>
                    <span className={n.level === "warning" ? "text-destructive" : ""}>{n.message}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" onClick={toggle} data-testid="theme-toggle">
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2" data-testid="user-menu-btn">
                  <div className="h-8 w-8 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-sm">
                    {user?.name?.[0]?.toUpperCase()}
                  </div>
                  <Badge variant="outline" className="hidden sm:inline-flex capitalize">{user?.role}</Badge>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user?.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={doLogout} data-testid="logout-btn">
                  <LogOut className="h-4 w-4 mr-2" /> Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8 max-w-[1600px] w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
