import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import CardDetail from "@/pages/card-detail";
import NfcWorkflow from "@/pages/nfc-workflow";
import Overlay from "@/pages/overlay";
import Sales from "@/pages/sales";
import Settings from "@/pages/settings";

const queryClient = new QueryClient();

function AppRouter() {
  return (
    <Switch>
      {/* OBS Overlay — no layout, transparent background */}
      <Route path="/overlay/:shortCode" component={Overlay} />

      {/* App routes with sidebar layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/inventory" component={Inventory} />
            <Route path="/inventory/:id" component={CardDetail} />
            <Route path="/sales" component={Sales} />
            <Route path="/nfc" component={NfcWorkflow} />
            <Route path="/settings" component={Settings} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
