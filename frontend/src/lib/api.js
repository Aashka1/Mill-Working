import axios from "axios";

// Empty/unset means same-origin: the FastAPI server also serves this build.
const API = `${process.env.REACT_APP_BACKEND_URL || ""}/api`;

const api = axios.create({ baseURL: API, withCredentials: true });

export const money = (n) =>
  `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export const today = () => new Date().toISOString().slice(0, 10);

export function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).filter(Boolean).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const downloadFile = async (path, filename) => {
  const res = await api.get(path, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};

// Opens the PDF in a hidden frame and brings up the browser's print dialog,
// so a bill can be printed without saving it first. If the browser will not
// print from a frame, the PDF opens in a new tab to print from there.
export const printFile = async (path) => {
  const res = await api.get(path, { responseType: "blob" });
  const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  frame.src = url;
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch {
      window.open(url, "_blank");
    }
    // Long enough for the print dialog to have read the document.
    setTimeout(() => { frame.remove(); window.URL.revokeObjectURL(url); }, 60000);
  };
  document.body.appendChild(frame);
};

// Invoice paper size, remembered on this device. A6 is a quarter of A4.
export const INVOICE_SIZES = [
  { value: "a6", label: "A4 ÷ 4 (A6)" },
  { value: "a4", label: "Full A4" },
];
export const getInvoiceSize = () => localStorage.getItem("invoiceSize") || "a6";
export const setInvoiceSize = (v) => localStorage.setItem("invoiceSize", v);
export const invoicePath = (refId, { inline = false, size = getInvoiceSize() } = {}) =>
  `/invoices/${refId}/pdf?size=${size}${inline ? "&inline=true" : ""}`;

export { API };
export default api;
