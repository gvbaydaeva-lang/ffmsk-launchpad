import * as React from "react";
import { Html5Qrcode } from "html5-qrcode";
import { ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const REGION_ID = "ff-scanner-viewport";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDecoded: (text: string) => void;
};

const BarcodeScannerDialog = ({ open, onOpenChange, onDecoded }: Props) => {
  const [manual, setManual] = React.useState("");
  const onDecodedRef = React.useRef(onDecoded);
  const qrRef = React.useRef<Html5Qrcode | null>(null);
  const settledRef = React.useRef(false);
  onDecodedRef.current = onDecoded;

  React.useEffect(() => {
    settledRef.current = false;
    if (!open) {
      setManual("");
      if (qrRef.current) {
        void qrRef.current.stop().finally(() => {
          qrRef.current = null;
        });
      }
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      if (!document.getElementById(REGION_ID)) return;

      const qr = new Html5Qrcode(REGION_ID, { verbose: false });
      qrRef.current = qr;
      void qr
        .start(
          { facingMode: "environment" },
          { fps: 8, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
          (decodedText) => {
            if (cancelled || settledRef.current) return;
            settledRef.current = true;
            void qr
              .stop()
              .then(() => {
                qrRef.current = null;
                onDecodedRef.current(decodedText);
              })
              .catch(() => {
                qrRef.current = null;
                onDecodedRef.current(decodedText);
              });
          },
          () => {},
        )
        .catch((e) => {
          if (cancelled) return;
          const msg = e instanceof Error ? e.message : String(e);
          toast.error("Камера недоступна", { description: msg });
        });
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (qrRef.current) {
        void qrRef.current.stop().finally(() => {
          qrRef.current = null;
        });
      }
    };
  }, [open]);

  const applyManual = () => {
    const t = manual.trim();
    if (!t) {
      toast.error("Введите код");
      return;
    }
    settledRef.current = true;
    if (qrRef.current) {
      void qrRef.current.stop().finally(() => {
        qrRef.current = null;
        onDecodedRef.current(t);
      });
    } else {
      onDecodedRef.current(t);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5" />
            Сканер штрихкодов и QR
          </DialogTitle>
          <DialogDescription>
            Наведите камеру на этикетку. Для приёмки отсканируйте номер документа (ПТ-…), для склада — баркод позиции с
            этикетки ячейки.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div
            id={REGION_ID}
            className="mx-auto aspect-square w-full max-w-[280px] overflow-hidden rounded-lg bg-black/90"
          />
          <div className="grid gap-2">
            <Label htmlFor="manual-scan">Ручной ввод</Label>
            <div className="flex gap-2">
              <Input
                id="manual-scan"
                value={manual}
                onChange={(e) => setManual(e.target.value)}
                placeholder="ПТ-2026-0892 или баркод"
                className="font-mono text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyManual();
                }}
              />
              <Button type="button" variant="secondary" onClick={applyManual}>
                OK
              </Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Закрыть
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BarcodeScannerDialog;
