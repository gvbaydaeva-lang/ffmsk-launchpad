import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import BarcodeScannerDialog from "@/components/app/BarcodeScannerDialog";
import { applyScannedCodeToDemoState } from "@/services/scanWorkflow";
import type { ProductCatalogItem } from "@/types/domain";
import { updateMockProductCatalogItem } from "@/services/mockProductCatalog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ScannerContextValue = {
  openScanner: () => void;
};

const ScannerContext = React.createContext<ScannerContextValue | null>(null);

export function ScannerProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [productQuickId, setProductQuickId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState({ lengthCm: "", widthCm: "", heightCm: "", weightKg: "" });

  const handleDecoded = React.useCallback(
    async (text: string) => {
      try {
        const res = await applyScannedCodeToDemoState(text, qc);
        if (res.kind === "product_found") {
          const list = qc.getQueryData<ProductCatalogItem[]>(["wms", "product-catalog"]) ?? [];
          const p = list.find((x) => x.id === res.productId);
          if (p) {
            setProductQuickId(p.id);
            setDraft({
              lengthCm: String(p.lengthCm || ""),
              widthCm: String(p.widthCm || ""),
              heightCm: String(p.heightCm || ""),
              weightKg: String(p.weightKg || ""),
            });
          }
          toast.success("Сканирование", { description: res.message });
        } else if (res.kind === "unknown") {
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
  const productList = qc.getQueryData<ProductCatalogItem[]>(["wms", "product-catalog"]) ?? [];
  const currentProduct = productQuickId ? productList.find((x) => x.id === productQuickId) ?? null : null;

  const saveQuickProduct = () => {
    if (!currentProduct) return;
    const next = updateMockProductCatalogItem(productList, currentProduct.id, {
      lengthCm: Number(draft.lengthCm) || 0,
      widthCm: Number(draft.widthCm) || 0,
      heightCm: Number(draft.heightCm) || 0,
      weightKg: Number(draft.weightKg) || 0,
    });
    qc.setQueryData(["wms", "product-catalog"], next);
    toast.success("Карточка товара обновлена");
    setProductQuickId(null);
  };

  const onPhotoUpload = (file: File) => {
    if (!currentProduct) return;
    const url = URL.createObjectURL(file);
    const next = updateMockProductCatalogItem(productList, currentProduct.id, { photoUrl: url });
    qc.setQueryData(["wms", "product-catalog"], next);
    toast.success("Фото загружено");
  };

  return (
    <ScannerContext.Provider value={value}>
      {children}
      <BarcodeScannerDialog open={open} onOpenChange={setOpen} onDecoded={(text) => void handleDecoded(text)} />
      <Dialog open={Boolean(productQuickId)} onOpenChange={(v) => !v && setProductQuickId(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Быстрое редактирование товара</DialogTitle>
          </DialogHeader>
          {currentProduct ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-700">
                {currentProduct.brand} · {currentProduct.name} · <span className="font-mono">{currentProduct.barcode}</span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="grid gap-1">
                  <Label>Длина, см</Label>
                  <Input value={draft.lengthCm} onChange={(e) => setDraft((d) => ({ ...d, lengthCm: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Ширина, см</Label>
                  <Input value={draft.widthCm} onChange={(e) => setDraft((d) => ({ ...d, widthCm: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Высота, см</Label>
                  <Input value={draft.heightCm} onChange={(e) => setDraft((d) => ({ ...d, heightCm: e.target.value }))} />
                </div>
                <div className="grid gap-1">
                  <Label>Вес, кг</Label>
                  <Input value={draft.weightKg} onChange={(e) => setDraft((d) => ({ ...d, weightKg: e.target.value }))} />
                </div>
              </div>
              <div className="grid gap-1">
                <Label>Загрузить фото</Label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onPhotoUpload(file);
                  }}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProductQuickId(null)}>
              Закрыть
            </Button>
            <Button onClick={saveQuickProduct}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScannerContext.Provider>
  );
}

export function useScanner() {
  const ctx = React.useContext(ScannerContext);
  if (!ctx) throw new Error("useScanner must be used within ScannerProvider");
  return ctx;
}
