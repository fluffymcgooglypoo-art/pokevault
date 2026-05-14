import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Settings() {
  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h2 className="text-xl font-bold tracking-tight" data-testid="text-settings-title">Settings</h2>

      <Card className="bg-card border-border rounded-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">NFC Hardware</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-foreground">Web NFC API</span>
            {"NDEFReader" in window
              ? <Badge className="bg-green-500/10 text-green-400 border-green-500/30 rounded-none">Available</Badge>
              : <Badge className="bg-muted/30 text-muted-foreground border-border rounded-none">Not Available</Badge>}
          </div>
          <p className="text-xs text-muted-foreground">
            Web NFC requires Chrome on a device with NFC hardware. For ACR122U readers, use Chrome on a supported system.
          </p>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">NTAG213 Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Total user memory</span>
            <span className="font-mono text-foreground">144 bytes</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">NDEF URI overhead</span>
            <span className="font-mono text-foreground">7 bytes</span>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-2 mt-2">
            <span className="text-foreground font-medium">Usable for URL</span>
            <span className="font-mono text-primary font-bold">137 bytes</span>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border rounded-none">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">OBS Overlay</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>Add a browser source in OBS pointing to:</p>
          <code className="block bg-background border border-border px-3 py-2 text-xs font-mono text-primary break-all" data-testid="text-overlay-url-template">
            {window.location.origin}/overlay/[short-code]
          </code>
          <p className="text-xs">Recommended size: 400 × 150 px. Enable transparent background in browser source settings. The overlay auto-refreshes every 10 seconds.</p>
        </CardContent>
      </Card>
    </div>
  );
}
