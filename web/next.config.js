/** @type {import('next').NextConfig} */

const BACKEND =
  process.env.DEEPTUTOR_API || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

const nextConfig = {
  // Proxy /api and /ws to the FastAPI backend so the browser sees one origin —
  // required for cookie-scoped WS/fetch identity in local dev.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/ws",         destination: `${BACKEND}/api/v1/ws` },
    ];
  },

  // Standalone output: self-contained server.js + minimal node_modules
  // This eliminates the need to copy the full node_modules into Docker production images
  output: "standalone",

  // Move dev indicator to bottom-right corner
  devIndicators: {
    position: "bottom-right",
  },

  // Transpile mermaid and related packages for proper ESM handling
  transpilePackages: ["mermaid"],

  // Turbopack configuration (used when running `npm run dev:turbo`)
  turbopack: {
    resolveAlias: {
      // Fix for mermaid's cytoscape dependency - use CJS version
      cytoscape: "cytoscape/dist/cytoscape.cjs.js",
    },
  },

  // Webpack configuration (used for production builds - next build)
  webpack: (config) => {
    const path = require("path");
    config.resolve.alias = {
      ...config.resolve.alias,
      cytoscape: path.resolve(
        __dirname,
        "node_modules/cytoscape/dist/cytoscape.cjs.js",
      ),
    };
    return config;
  },
};

module.exports = nextConfig;
