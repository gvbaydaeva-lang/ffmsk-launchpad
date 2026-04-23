type FinanceClientRow = {
  legalEntityName: string;
  storageAccruedRub: number;
  serviceAccruedRub: number;
  totalDueRub: number;
  paymentStatus: string;
  periodLabel: string;
};

function withBom(content: string) {
  return `\uFEFF${content}`;
}

function download(filename: string, mime: string, body: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportFinanceClientReport(row: FinanceClientRow) {
  const header = [
    "Клиент",
    "Период",
    "Начислено за хранение, ₽",
    "Услуги (приёмка/упаковка), ₽",
    "Итого к оплате, ₽",
    "Статус оплаты",
  ];
  const values = [
    row.legalEntityName,
    row.periodLabel,
    String(row.storageAccruedRub),
    String(row.serviceAccruedRub),
    String(row.totalDueRub),
    row.paymentStatus,
  ];
  const csv = withBom([header.join(";"), values.join(";")].join("\n"));
  const safeName = row.legalEntityName.replace(/[^\p{L}\p{N}_-]+/gu, "_");
  download(`finance_${safeName}.csv`, "text/csv;charset=utf-8", csv);
}
