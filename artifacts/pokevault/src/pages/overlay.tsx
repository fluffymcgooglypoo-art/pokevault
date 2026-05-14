import { useParams } from "wouter";
import { useGetOverlayData, getGetOverlayDataQueryKey } from "@workspace/api-client-react";

const CONDITIONS: Record<string, string> = {
  mint: "Mint",
  near_mint: "Near Mint",
  lightly_played: "Lightly Played",
  moderately_played: "Moderately Played",
  heavily_played: "Heavily Played",
  damaged: "Damaged",
};

export default function Overlay() {
  const { shortCode } = useParams<{ shortCode: string }>();

  const { data, isLoading, isError } = useGetOverlayData(shortCode, {
    query: {
      enabled: !!shortCode,
      queryKey: getGetOverlayDataQueryKey(shortCode),
      refetchInterval: 10000,
    },
  });

  if (isLoading) return null;
  if (isError || !data) return null;

  const pl = data.profit_loss ?? 0;
  const plPositive = pl >= 0;

  return (
    <div
      data-testid="overlay-root"
      style={{
        background: "transparent",
        fontFamily: "'Inter', sans-serif",
        padding: "16px",
        width: "400px",
        minHeight: "120px",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          background: "rgba(10, 10, 18, 0.92)",
          border: "1px solid rgba(0, 255, 255, 0.25)",
          padding: "14px 18px",
          display: "flex",
          flexDirection: "column",
          gap: "6px",
        }}
      >
        {/* Card name */}
        <div
          data-testid="text-overlay-name"
          style={{
            fontSize: "18px",
            fontWeight: 700,
            color: "#ffffff",
            lineHeight: 1.2,
            letterSpacing: "-0.02em",
          }}
        >
          {data.card_name}
        </div>

        {/* Set / number */}
        {(data.set_name || data.card_number) && (
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
            {data.set_name}
            {data.set_name && data.card_number ? " · " : ""}
            {data.card_number}
          </div>
        )}

        {/* Stats row */}
        <div style={{ display: "flex", gap: "16px", marginTop: "4px", alignItems: "center" }}>
          {/* Condition */}
          <div
            data-testid="text-overlay-condition"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#00ffff",
              border: "1px solid rgba(0,255,255,0.3)",
              padding: "2px 6px",
            }}
          >
            {CONDITIONS[data.condition] ?? data.condition}
          </div>

          {/* Market value */}
          {data.market_value != null && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Market</span>
              <span data-testid="text-overlay-market" style={{ fontSize: "15px", fontWeight: 700, color: "#00ffff", fontFamily: "monospace" }}>
                ${data.market_value.toFixed(2)}
              </span>
            </div>
          )}

          {/* P&L */}
          {data.profit_loss != null && (
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "0.06em" }}>P&amp;L</span>
              <span
                data-testid="text-overlay-pl"
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: plPositive ? "#22c55e" : "#ef4444",
                  fontFamily: "monospace",
                }}
              >
                {plPositive ? "+" : ""}${Math.abs(pl).toFixed(2)}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
