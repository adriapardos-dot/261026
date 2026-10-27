// Expone PostgREST bajo /rest/v1, como hace Supabase, para usar supabase-js.
// Uso: node tests/integracion/local/proxy.mjs  (escucha en http://127.0.0.1:54331)
import http from "node:http"

const DESTINO = "http://127.0.0.1:54330"
http
  .createServer((req, res) => {
    const ruta = req.url.startsWith("/rest/v1") ? req.url.slice(8) || "/" : req.url
    const salida = http.request(
      DESTINO + ruta,
      { method: req.method, headers: { ...req.headers, host: "127.0.0.1:54330" } },
      (r) => {
        res.writeHead(r.statusCode, r.headers)
        r.pipe(res)
      }
    )
    salida.on("error", (e) => {
      res.writeHead(502)
      res.end(String(e))
    })
    req.pipe(salida)
  })
  .listen(54331, "127.0.0.1", () => console.log("Proxy /rest/v1 → PostgREST en http://127.0.0.1:54331"))
