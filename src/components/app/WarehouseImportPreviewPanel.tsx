import { Button } from "@/components/ui/button";
import type { WarehouseImportInspectionResult } from "@/lib/warehouseImportPaste";

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
      {canApply && onApply ? (
        <Button type="button" size="sm" className="h-8 w-full sm:w-auto" disabled={disabled} onClick={() => onApply()}>
          Применить импорт
        </Button>
      ) : null}
    </div>
  );
}
