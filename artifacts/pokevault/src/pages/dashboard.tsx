import React from "react";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, DollarSign, Library, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();

  if (isLoading) {
    return <div className="p-8 text-muted-foreground">Loading dashboard...</div>;
  }

  if (!summary) {
    return <div className="p-8 text-destructive">Failed to load dashboard data.</div>;
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <h2 className="text-2xl font-bold tracking-tight">Portfolio Summary</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card rounded-none border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invested</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${summary.total_invested.toFixed(2)}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-card rounded-none border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Market Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">${summary.total_market_value.toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card className="bg-card rounded-none border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Cards</CardTitle>
            <Library className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary.total_cards}</div>
          </CardContent>
        </Card>

        <Card className="bg-card rounded-none border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Realized P&L</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.realized_profit_loss >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${summary.realized_profit_loss.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">{summary.cards_sold} cards sold</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
