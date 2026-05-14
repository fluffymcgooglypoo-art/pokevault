import React from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";

const queryClient = new QueryClient();

// Placeholder components for pages we'll build fully soon
const Inventory = () => <div className="p-8">Inventory Page Placeholder</div>;
const CardDetail = () => <div className="p-8">Card Detail Page Placeholder</div>;
const NfcWorkflow = () => <div className="p-8">NFC Workflow Page Placeholder</div>;
const Settings = () => <div className="p-8">Settings Page Placeholder</div>;
const Overlay = () => <div className="p-8 text-white">Overlay View (OBS) Placeholder</div>;

function AppRouter() {
  return (
    <Switch>
      {/* OBS Overlay has no layout */}
      <Route path="/overlay/:shortCode" component={Overlay} />
      
      {/* App routes with layout */}
      <Route>
        <Layout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/inventory" component={Inventory} />
            <Route path="/inventory/:id" component={CardDetail} />
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
