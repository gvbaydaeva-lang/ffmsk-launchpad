import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type PlaceholderPageProps = {
  title: string;
  description?: string;
};

const PlaceholderPage = ({ title, description = "Раздел в разработке — здесь появится функциональность WMS." }: PlaceholderPageProps) => {
  return (
    <Card className="max-w-2xl border-border/80 shadow-elegant">
      <CardHeader>
        <CardTitle className="font-display text-xl tracking-tight">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        Используйте боковое меню для перехода к Dashboard с демо-аналитикой.
      </CardContent>
    </Card>
  );
};

export default PlaceholderPage;
