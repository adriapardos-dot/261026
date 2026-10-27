// Genera un JWT HS256 con el rol indicado para el PostgREST local.
// Uso: node tests/integracion/local/jwt.mjs service_role
import { createHmac } from "node:crypto"

const SECRETO = "secreto-local-de-pruebas-con-mas-de-32-caracteres"
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url")
const cuerpo = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: process.argv[2] ?? "anon", exp: 4102444800 })}`
console.log(`${cuerpo}.${createHmac("sha256", SECRETO).update(cuerpo).digest("base64url")}`)
