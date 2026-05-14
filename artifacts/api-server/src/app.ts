import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import { createReadStream, existsSync } from "fs";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// ── Electron production: serve the built React app as static files ───────────
//
// When the Electron main process starts the API server it sets ELECTRON=1 and
// RENDERER_PATH to the directory containing the built React app.  All non-API
// requests are served from that directory so the renderer can load from
// http://localhost:<port>/.
if (process.env["ELECTRON"] === "1") {
  const rendererPath = process.env["RENDERER_PATH"];
  if (rendererPath && existsSync(rendererPath)) {
    app.use(express.static(rendererPath));

    // SPA fallback — hand every unmatched GET to index.html
    app.get("*", (_req, res) => {
      const indexPath = path.join(rendererPath, "index.html");
      const stream = createReadStream(indexPath);
      stream.on("error", () => res.status(404).send("Not found"));
      res.setHeader("Content-Type", "text/html");
      stream.pipe(res);
    });
  } else {
    logger.warn(
      { rendererPath },
      "ELECTRON=1 but RENDERER_PATH is missing or does not exist",
    );
  }
}

export default app;
