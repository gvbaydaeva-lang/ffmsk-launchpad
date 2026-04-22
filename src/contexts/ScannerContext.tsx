import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BarcodeScannerDialog from "@/components/app/BarcodeScannerDialog";
import { applyScannedCodeToDemoState } from "@/services/scanWorkflow";

type ScannerContextValue = {
  openScanner: () => void;
};

const ScannerContext = React.createContext<ScannerContextValue | null>(null);

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);

  const handleDecoded = React.useCallback(
    async (text: string) => {
      try {
        const res = await applyScannedCodeToDemoState(text, qc);
        if (res.kind === "unknown") {
          toast.message("Сканирование", { description: res.message });
        } else {
          toast.success("Сканирование", { description: res.message });
        }
      } catch {
        toast.error("Не удалось обработать код");
      } finally {
        setOpen(false);
      }
    },
    [qc],
  );

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo(() => ({ openScanner: () => setOpen(true) }), []);

  return (
    <ScannerContext.Provider value={value}>
      {children}
      <BarcodeScannerDialog open={open} onOpenChange={setOpen} onDecoded={(text) => void handleDecoded(text)} />
    </ScannerContext.Provider>
  );
}

export function useScanner() {
  const ctx = React.useContext(ScannerContext);
  if (!ctx) throw new Error("useScanner must be used within ScannerProvider");
  return ctx;
}
