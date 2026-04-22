import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Props = { title: string };

/** Временная страница раздела — позже заменим на полный функционал */
const SectionPlaceholderPage = ({ title }: Props) => {
  return (
    <Card className="max-w-xl border-border/80 shadow-elegant">
      <CardHeader>
        <CardTitle className="font-display text-xl tracking-tight">{title}</CardTitle>
        <CardDescription>Раздел в подготовке — здесь будет рабочий интерфейс.</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Используйте боковое меню для перехода между разделами.
      </CardContent>
    </Card>
  );
};

export default SectionPlaceholderPage;
