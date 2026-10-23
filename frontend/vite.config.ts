import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The front-end is a static bundle; in development it proxies /api to the
// FastAPI service, in Docker nginx does the same, and on Vercel a rewrite
// routes /api/* to the serverless function.  The client therefore always
// uses relative URLs.
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        host: true,
        proxy: {
            "/api": {
                target: process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000",
                changeOrigin: true,
            },
        },
    },
    build: {
        outDir: "dist",
        sourcemap: false,
        chunkSizeWarningLimit: 1200,
    },
});
