// Lokales Admin-Konto der CMDB setzen: fragt das Passwort verdeckt ab und schreibt nur den scrypt-Hash in die .env.
// Aufruf (im Terminal auf charlestown, Passwort nie in den Chat):
//   docker run --rm -it -v /root/cmdb/server:/s node:24-bookworm-slim node /s/tools/lokaler-admin.mjs admin
// Danach: docker compose -p cmdb-dev up -d   (Dienst liest die .env beim Start)
import { randomBytes, scryptSync } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const file = "/s/.env";
const user = (process.argv[2] ?? "admin").trim().toLowerCase();
if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(user)) throw new Error("Ungültiger Name.");

function ask(prompt) {
  return new Promise((done) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const onData = (buf) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return done(value);
        }
        if (ch === "\u0003") process.exit(1);
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

const password = await ask(`Neues Passwort für „${user}“: `);
if (password.length < 12) {
  console.error("Mindestens 12 Zeichen.");
  process.exit(1);
}
if ((await ask("Noch einmal: ")) !== password) {
  console.error("Die Eingaben stimmen nicht überein.");
  process.exit(1);
}

const N = 32768, r = 8, p = 1;
const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64, { N, r, p, maxmem: 256 * N * r });
const line = `scrypt:${N}:${r}:${p}:${salt.toString("base64")}:${hash.toString("base64")}`;

let env = readFileSync(file, "utf8");
const set = (key, value) => {
  const re = new RegExp(`^${key}=.*$`, "m");
  env = re.test(env) ? env.replace(re, `${key}=${value}`) : `${env.replace(/\n?$/, "\n")}${key}=${value}\n`;
};
set("CMDB_LOCAL_ADMIN_USER", user);
set("CMDB_LOCAL_ADMIN_HASH", line);
writeFileSync(file, env, { mode: 0o600 });
console.log(`Lokales Konto „${user}“ gesetzt (nur der Hash steht in server/.env). Jetzt den Dienst neu starten.`);
