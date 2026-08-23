/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Optional cookie-less analytics endpoint; tracking is off when unset. */
    readonly VITE_ANALYTICS_URL?: string;
    readonly VITE_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
