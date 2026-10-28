/** Protokoll auf stdout (im Container: docker logs). Nie Passwörter, Cookies oder Anfrageinhalte ausgeben. */
export function log(message: string): void {
  console.log(`${new Date().toISOString()} ${message}`);
}
