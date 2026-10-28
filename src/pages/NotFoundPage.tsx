import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex flex-col items-start gap-2">
      <h1 className="text-2xl font-semibold">Seite nicht gefunden</h1>
      <Link to="/" className="text-sm underline underline-offset-4">Zur Übersicht</Link>
    </div>
  );
}
