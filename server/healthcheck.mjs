// Healthcheck im Container: GET /api/health über HTTP bzw. HTTPS (eigenes Zertifikat, daher ohne Prüfung der Kette)
import { request as http } from "node:http";
import { request as https } from "node:https";

const tls = Boolean(process.env.CMDB_TLS_CERT);
const req = (tls ? https : http)(
  { host: "127.0.0.1", port: Number(process.env.CMDB_PORT) || 8790, path: "/api/health", timeout: 4000, rejectUnauthorized: false },
  (res) => process.exit(res.statusCode === 200 ? 0 : 1),
);
req.on("error", () => process.exit(1));
req.on("timeout", () => process.exit(1));
req.end();
