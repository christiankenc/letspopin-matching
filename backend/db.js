import "dotenv/config";
import mysql from "mysql2/promise";

// Fail fast on missing env (helps in CI and local)
for (const k of ["DB_HOST", "DB_USER", "DB_PASS", "DB_NAME"]) {
  if (!process.env[k]) throw new Error(`Missing env var: ${k}`);
}

export const pool = mysql.createPool({
  // basic connection settings
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "3306", 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,

  // ensure correct Unicode support (emojis, multi-byte chars)
  charset: "utf8mb4",

  // pool behavior
  waitForConnections: true, // callers wait rather than erroring when pool is busy
  connectionLimit: 10, // max concurrent connections held by the pool
  queueLimit: 0, // 0 = no limit; requests will queue up

  // keep TCP connections alive to reduce handshake overhead
  enableKeepAlive: true,
});

// simple helper when you don't need a dedicated connection
export const query = (sql, params = []) => pool.execute(sql, params);

// use the same connection for multiple statements (and auto-release)
export async function withConnection(fn) {
  const conn = await pool.getConnection();
  try {
    return await fn(conn);
  } finally {
    conn.release(); // return to the pool no matter what
  }
}

// transaction helper
export async function withTransaction(fn) {
  return withConnection(async (conn) => {
    await conn.beginTransaction();
    try {
      const result = await fn(conn); // run your unit of work
      await conn.commit(); // all good → persist
      return result;
    } catch (err) {
      await conn.rollback(); // error → revert all changes
      throw err; // bubble up to caller
    }
  });
}

// graceful shutdown
async function closePool() {
  try {
    await pool.end(); // waits for active connections to finish
    console.log("MySQL pool closed");
  } catch (e) {
    console.error("Error closing MySQL pool", e);
  }
}

process.on("SIGINT", closePool); // Ctrl+C
process.on("SIGTERM", closePool); // e.g., Docker/Kubernetes stop
