import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  // Path relative to the compiled index.cjs in the dist folder
  const distPath = path.resolve(__dirname, "public");
  
  // Debug logging for Render logs
  console.log(`[Static] Checking for production assets at: ${distPath}`);

  if (!fs.existsSync(distPath)) {
    // Fail-safe: Check if index.html is actually in the root of dist
    const rootDistPath = path.resolve(__dirname);
    if (fs.existsSync(path.join(rootDistPath, "index.html"))) {
      console.log("[Static] index.html found in dist root. Using fallback.");
      app.use(express.static(rootDistPath));
      app.use("*", (_req, res) => {
        res.sendFile(path.resolve(rootDistPath, "index.html"));
      });
      return;
    }
    
    throw new Error(
      `Fatal: Static directory not found. 
       Expected: ${distPath}
       Current Dir: ${__dirname}
       Contents: ${fs.readdirSync(__dirname).join(", ")}`
    );
  }

  // Standard serving
  app.use(express.static(distPath));

  // Catch-all route for Single Page App (React)
  app.use("*", (req, res, next) => {
    // If it's an API call, don't serve index.html, let it 404
    if (req.path.startsWith("/api")) {
      return next();
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}