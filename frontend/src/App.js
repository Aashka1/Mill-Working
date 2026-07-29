import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { useAuth } from "@/context/AuthContext";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Inventory from "@/pages/Inventory";
import Sales from "@/pages/Sales";
import Grinding from "@/pages/Grinding";
import OilExtraction from "@/pages/OilExtraction";
import Production from "@/pages/Production";
import Exchange from "@/pages/Exchange";
import Expenses from "@/pages/Expenses";
import Customers from "@/pages/Customers";
import Suppliers from "@/pages/Suppliers";
import Invoices from "@/pages/Invoices";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null)
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  const { user } = useAuth();
  return (
    <div className="App">
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
          <Route
            path="/"
            element={<Protected><Layout /></Protected>}
          >
            <Route index element={<Dashboard />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="sales" element={<Sales />} />
            <Route path="grinding" element={<Grinding />} />
            <Route path="oil" element={<OilExtraction />} />
            <Route path="production" element={<Production />} />
            <Route path="exchange" element={<Exchange />} />
            <Route path="expenses" element={<Expenses />} />
            <Route path="customers" element={<Customers />} />
            <Route path="suppliers" element={<Suppliers />} />
            <Route path="invoices" element={<Invoices />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
