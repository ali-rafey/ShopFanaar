import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /admin/* is served from admin.html (installable app manifest + icons);
// everything else from index.html. Mirrors the rewrites in vercel.json.
const adminEntry = {
  name: "admin-entry",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const path = req.url.split("?")[0];
      if ((path === "/admin" || path.startsWith("/admin/")) && !path.includes(".")) {
        req.url = "/admin.html";
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), adminEntry],
  server: { port: 5173, open: true },
  build: {
    rollupOptions: {
      input: { main: "index.html", admin: "admin.html" },
    },
  },
});
