import { useState } from "react";
import { InvoiceActions, InvoiceSizeSelect } from "@/components/InvoiceActions";
import { useList, useFilter, PageToolbar, StatusBadge } from "@/components/common";
import { money } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function Invoices() {
  const invoices = useList("/invoices");
  const [q, setQ] = useState("");
  const filtered = useFilter(invoices.items, q, ["invoice_number", "customer_name", "type", "payment_status", "date"]);

  const typeColor = (t) => t === "Sale" ? "text-primary border-primary/30" : t === "Grinding" ? "text-secondary border-secondary/30" : "text-chart-3 border-chart-3/30";

  return (
    <div>
      <PageToolbar
        title="Invoices" subtitle="All generated bills — download or print"
        search={q} setSearch={setQ} searchTestid="search-invoices"
        actions={<InvoiceSizeSelect />}
      />
      <Card className="border-border/60 scroll-x">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Invoice No.</TableHead><TableHead>Type</TableHead><TableHead>Date</TableHead>
            <TableHead>Customer</TableHead><TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Invoice</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {filtered.map((i) => (
              <TableRow key={i.id} className="hover:bg-muted/50" data-testid={`invoice-row-${i.ref_id}`}>
                <TableCell className="font-mono text-xs">{i.invoice_number}</TableCell>
                <TableCell><Badge variant="outline" className={typeColor(i.type)}>{i.type}</Badge></TableCell>
                <TableCell>{i.date}</TableCell>
                <TableCell className="font-medium">{i.customer_name}</TableCell>
                <TableCell className="text-right font-medium">{money(i.total)}</TableCell>
                <TableCell><StatusBadge status={i.payment_status} /></TableCell>
                <TableCell className="text-right">
                  <span className="inline-flex"><InvoiceActions refId={i.ref_id} invoiceNumber={i.invoice_number} /></span>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No invoices yet. Create a sale, grinding or oil order.</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
