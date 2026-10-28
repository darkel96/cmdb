import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, createHashRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { AdminOnly, AppShell } from "@/components/layout/AppShell";
import { AdminPage } from "@/pages/AdminPage";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { SectionPage } from "@/pages/SectionPage";
import { AreaDetailPage } from "@/pages/AreaPage";
import { AreaCreatePage } from "@/pages/AreaCreatePage";
import { ContractTypesPage } from "@/pages/ContractTypesPage";
import { StartPage } from "@/pages/StartPage";
import { AuthProvider } from "@/state/auth";
import "./index.css";

// GitHub Pages kennt keine SPA-Weiterleitung, dort laufen die Adressen über „#/…“
const createRouter = import.meta.env.VITE_ROUTER === "hash" ? createHashRouter : createBrowserRouter;

const router = createRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <AppShell />,
    children: [
      { path: "/", element: <StartPage /> },
      { path: "/bereich/:id", element: <SectionPage /> },
      { path: "/bereich/:id/neu", element: <AdminOnly><AreaCreatePage /></AdminOnly> },
      { path: "/bereich/:id/:itemId", element: <AreaDetailPage /> },
      { path: "/anlage-vertrag", element: <AdminOnly><ContractTypesPage /></AdminOnly> },
      { path: "/verwaltung", element: <AdminOnly><AdminPage /></AdminOnly> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
);
