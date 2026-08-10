import { useState } from "react";
import api, { formatApiErrorDetail } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

// Sentinel for the "add new" row. A real name could never collide with it.
const ADD_NEW = "__add_party__";

const blank = () => ({
  name: "", phone: "", address: "", gstin: "", pan_aadhaar: "",
  opening_balance: "", credit_limit: "",
});

/**
 * Party picker with inline creation.
 *
 * The point is that a bill in progress is never interrupted: if the customer
 * is not in the list, they are added from here and selected straight away,
 * without leaving the screen or losing what has already been typed.
 *
 * `kind` is "customer" or "supplier"; `onCreated` should refresh the caller's
 * list so the new party is present in it too.
 */
export function PartySelect({
  kind = "customer",
  value,
  onChange,
  items = [],
  onCreated,
  testid,
  placeholder = "Select",
}) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank());
  const [saving, setSaving] = useState(false);

  const label = kind === "supplier" ? "Supplier" : "Customer";
  const path = kind === "supplier" ? "/suppliers" : "/customers";

  const pick = (v) => {
    if (v === ADD_NEW) {
      setF(blank());
      setOpen(true);
      return;
    }
    onChange(v);
  };

  const save = async () => {
    const name = f.name.trim();
    if (!name) return toast.error(`Enter the ${kind} name`);
    setSaving(true);
    try {
      const { data } = await api.post(path, {
        name,
        phone: f.phone,
        address: f.address,
        gstin: f.gstin,
        pan_aadhaar: f.pan_aadhaar,
        opening_balance: +f.opening_balance || 0,
        credit_limit: +f.credit_limit || 0,
      });
      // The backend returns the existing party rather than erroring, so a name
      // typed twice selects the original instead of blocking the bill.
      toast.success(data.existing ? `${data.name} was already on file — selected` : `${data.name} added`);
      await onCreated?.();
      onChange(data.name);
      setOpen(false);
      setF(blank());
    } catch (e) {
      toast.error(formatApiErrorDetail(e.response?.data?.detail) || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Select value={value} onValueChange={pick}>
        <SelectTrigger className="h-11 mt-1" data-testid={testid}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent>
          {items.map((p) => (
            <SelectItem key={p.id} value={p.name}>
              {p.name}{p.phone ? ` · ${p.phone}` : ""}
            </SelectItem>
          ))}
          {items.length === 0 && (
            <SelectItem value={kind === "supplier" ? "Walk-in" : "Walk-in Customer"}>
              {kind === "supplier" ? "Walk-in Supplier" : "Walk-in Customer"}
            </SelectItem>
          )}
          {/* Last, so the parties someone actually uses stay at the top. */}
          <SelectItem value={ADD_NEW}>＋ Add new {kind}…</SelectItem>
        </SelectContent>
      </Select>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add {label}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto pr-1">
            <p className="text-xs text-muted-foreground">
              Saved to the {kind} master and selected here, so you can carry on with this entry.
            </p>
            <div><Label>Name</Label>
              <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="h-11 mt-1" data-testid={`new-${kind}-name`} autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Mobile number</Label>
                <Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="h-11 mt-1" data-testid={`new-${kind}-phone`} />
              </div>
              <div><Label>Address</Label>
                <Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className="h-11 mt-1" data-testid={`new-${kind}-address`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>GSTIN <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value.toUpperCase() })} className="h-11 mt-1" data-testid={`new-${kind}-gstin`} />
              </div>
              <div><Label>Aadhaar / PAN <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={f.pan_aadhaar} onChange={(e) => setF({ ...f, pan_aadhaar: e.target.value.toUpperCase() })} className="h-11 mt-1" data-testid={`new-${kind}-pan`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>Opening balance ₹</Label>
                <Input type="number" value={f.opening_balance} onChange={(e) => setF({ ...f, opening_balance: e.target.value })} className="h-11 mt-1" data-testid={`new-${kind}-opening`} />
                <p className="text-xs text-muted-foreground mt-1">What they already owed before today.</p>
              </div>
              <div><Label>Credit limit ₹ <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input type="number" value={f.credit_limit} onChange={(e) => setF({ ...f, credit_limit: e.target.value })} className="h-11 mt-1" data-testid={`new-${kind}-limit`} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} disabled={saving} data-testid={`save-new-${kind}`}>Save &amp; Select</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
