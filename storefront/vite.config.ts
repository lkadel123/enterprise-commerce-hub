import { defineConfig, searchForWorkspaceRoot } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const storefrontRoot = fileURLToPath(new URL(".", import.meta.url));

const sharedRepoRoot = resolve(storefrontRoot, "..");

export default defineConfig({
  server: {
    port: 8090,
    fs: {
      allow: [searchForWorkspaceRoot(process.cwd()), storefrontRoot, sharedRepoRoot],
    },
  },

  resolve: {
    tsconfigPaths: true,
    // The repo root (admin workspace) also installs @tanstack/react-query and
    // react. Without dedupe, framework-generated TanStack Start modules could
    // resolve a second copy, splitting the QueryClient context: queries fetch
    // successfully but observers subscribed via the other copy never update
    // (pages stuck on loading skeletons). Dedupe forces one shared copy.
    dedupe: ["react", "react-dom", "@tanstack/react-query", "@tanstack/react-query-devtools"],
  },

  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
      router: {
        routesDirectory: "routes",
      },
    }),
    viteReact(),
    nitro(),
  ],
});
