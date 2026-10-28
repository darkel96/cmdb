/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" im Build-Modus „pages“: Testmodus im Browser, kein Dienst */
  readonly VITE_TESTMODE?: string;
  /** "hash" = Router über „#/…“ */
  readonly VITE_ROUTER?: string;
}
