import express from "express";
import path from "path";

const app = express();

// Headers necesarios (por si usas FFmpeg / SharedArrayBuffer)
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

// Servir archivos estáticos
app.use(express.static(path.join(process.cwd(), "public")));

// Export obligatorio para Vercel
export default app;
