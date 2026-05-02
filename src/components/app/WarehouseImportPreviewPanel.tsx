import { Button } from "@/components/ui/button";
import type { WarehouseImportInspectionResult } from "@/lib/warehouseImportPaste";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Props = {
  preview: WarehouseImportInspectionResult | null;
  disabled?: boolean;
  onApply?: () => void;
};

export default function WarehouseImportPreviewPanel({ preview, disabled, onApply }: Props) {
  if (!preview) return null;

  const hasBlockingErrors = preview.errors.length > 0;
  const canApply = !hasBlockingErrors && preview.resolvedRows.length > 0;

  const formatIssue = (lineNumber: number, message: string) =>
    lineNumber > 0 ? `Строка ${lineNumber}: ${message}` : message;

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-medium text-slate-800">Результат проверки</p>
      <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-700">
        <li>
          Строк данных распознано (формат «код, количество»):{" "}
          <span className="tabular-nums font-medium text-slate-900">{preview.recognizedStructuralLines}</span>
        </li>
        <li>
          Товаров найдено в каталоге:{" "}
          <span className="tabular-nums font-medium text-slate-900">{preview.matchedProductsCount}</span>
        </li>
        <li>
          Ошибок: <span className="tabular-nums font-medium text-slate-900">{preview.errors.length}</span>
        </li>
      </ul>
      {preview.errors.length > 0 ? (
        <div className="rounded border border-red-100 bg-red-50/80 px-2 py-1.5">
          <p className="mb-1 text-[11px] font-medium text-red-900">Ошибки</p>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-[11px] text-red-900/95">
            {preview.errors.map((e, idx) => (
              <li key={`${e.lineNumber}-${idx}`} className="break-words pl-2">
                {formatIssue(e.lineNumber, e.message)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {preview.outboundStockPreviewRows && preview.outboundStockPreviewRows.length > 0 ? (
        <div className="overflow-x-auto rounded border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-8 min-w-[140px] text-[11px]">Товар</TableHead>
                <TableHead className="h-8 w-[88px] text-right text-[11px]">План из файла</TableHead>
                <TableHead className="h-8 w-[88px] text-right text-[11px]">Доступно</TableHead>
                <TableHead className="h-8 w-[88px] text-right text-[11px]">Не хватает</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.outboundStockPreviewRows.map((r) => (
                <TableRow key={r.productId} className="text-[11px]">
                  <TableCell className="max-w-[220px] break-words py-1.5">{r.label}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">{r.planFromFile.toLocaleString("ru-RU")}</TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums">
                    {r.availableForShipment.toLocaleString("ru-RU")}
                  </TableCell>
                  <TableCell className="py-1.5 text-right tabular-nums text-red-800">
                    {r.shortage > 0 ? r.shortage.toLocaleString("ru-RU") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
      {canApply && onApply ? (
        <Button type="button" size="sm" className="h-8 w-full sm:w-auto" disabled={disabled} onClick={() => onApply()}>
          Применить импорт
        </Button>
      ) : null}
    </div>
  );
}
