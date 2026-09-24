#!/usr/bin/env node
"use strict";

// 本地静态服务器：同时提供 HTTP 与 HTTPS
// HTTP 用于最省事的访问；HTTPS 用于让浏览器认可安全上下文，从而允许屏幕唤醒锁

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = __dirname;
const HTTP_PORT = Number(process.env.PORT || 8080);
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 8443);
const PFX = path.join(ROOT, "cert.pfx");
const PFX_PASS = process.env.PFX_PASS || "dsh";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".txt": "text/plain; charset=utf-8"
};

function listIPv4() {
  const out = [];
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === "IPv4" && !info.internal) {
        out.push({ name, address: info.address });
      }
    }
  }
  // 优先显示常见局域网网段
  out.sort((a, b) => {
    const rank = s => (/^192\.168\./.test(s) ? 0 : /^10\./.test(s) ? 1 : /^172\./.test(s) ? 2 : 3);
    return rank(a.address) - rank(b.address);
  });
  return out;
}

function serve(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://placeholder").pathname);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("bad request");
    return;
  }
  if (urlPath === "/") urlPath = "/index.html";

  const target = path.join(ROOT, urlPath);
  const rel = path.relative(ROOT, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found: " + urlPath);
      return;
    }
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
}

const ips = listIPv4();

const httpServer = http.createServer(serve);
httpServer.on("error", err => {
  console.log("[HTTP] 启动失败: " + err.message);
});
httpServer.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log("");
  console.log("=== HTTP 服务已启动（端口 " + HTTP_PORT + "）===");
  console.log("本机: http://localhost:" + HTTP_PORT);
  for (const ip of ips) {
    console.log("手机: http://" + ip.address + ":" + HTTP_PORT + "   [" + ip.name + "]");
  }
});

let httpsServer = null;
if (fs.existsSync(PFX)) {
  try {
    httpsServer = https.createServer(
      { pfx: fs.readFileSync(PFX), passphrase: PFX_PASS },
      serve
    );
    httpsServer.on("error", err => {
      console.log("[HTTPS] 启动失败: " + err.message);
    });
    httpsServer.listen(HTTPS_PORT, "0.0.0.0", () => {
      console.log("");
      console.log("=== HTTPS 服务已启动（端口 " + HTTPS_PORT + "）===");
      console.log("本机: https://localhost:" + HTTPS_PORT);
      for (const ip of ips) {
        console.log("手机: https://" + ip.address + ":" + HTTPS_PORT + "   [" + ip.name + "]");
      }
      console.log("");
      console.log("提示: 自签名证书，手机浏览器会提示不安全，");
      console.log("      点 高级 -> 继续前往 即可。之后屏幕唤醒锁才能生效。");
    });
  } catch (e) {
    console.log("[HTTPS] 证书读取失败: " + e.message);
  }
} else {
  console.log("");
  console.log("[HTTPS] 未找到 cert.pfx，只提供 HTTP。");
  console.log("        HTTP 下浏览器不允许网页阻止屏幕熄灭。");
}

console.log("");
console.log("按 Ctrl+C 停止服务。");
console.log("");
