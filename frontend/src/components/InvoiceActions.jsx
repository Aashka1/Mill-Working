import { useState } from "react";
import { downloadFile, printFile, invoicePath, INVOICE_SIZES, getInvoiceSize, setInvoiceSize } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";

/** Download and Print buttons for one invoice, at the chosen paper size. */
export function InvoiceActions({ refId, invoiceNumber, testid = refId }) {
  const download = () => downloadFile(invoicePath(refId), `${invoiceNumber || "invoice"}.pdf`)
    .catch(() => toast.error("Could not download the invoice"));
  const print = () => printFile(invoicePath(refId, { inline: true }))
    .catch(() => toast.error("Could not open the invoice for printing"));
  return (
    <>
      <Button variant="ghost" size="icon" title="Download invoice" onClick={download} data-testid={`download-invoice-${testid}`}>
        <Download className="h-4 w-4" />
      </Button>
      <Button variant="ghost" size="icon" title="Print invoice" onClick={print} data-testid={`print-invoice-${testid}`}>
        <Printer className="h-4 w-4" />
      </Button>
    </>
  );
}

/** Paper size picker; the choice is remembered on this device. */
export function InvoiceSizeSelect() {
  const [size, setSize] = useState(getInvoiceSize());
  return (
    <Select value={size} onValueChange={(v) => { setSize(v); setInvoiceSize(v); }}>
      <SelectTrigger className="h-11 w-44" data-testid="invoice-size" title="Invoice paper size"><SelectValue /></SelectTrigger>
      <SelectContent>{INVOICE_SIZES.map((s) => <SelectItem key={s.value} value={s.value}>Invoice: {s.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}
