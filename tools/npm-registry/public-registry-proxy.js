#!/usr/bin/env node
/**
 * Minimal HTTP CONNECT proxy that resolves one chosen hostname through public DNS.
 *
 * Why this exists: on some corporate networks the local resolver pins
 * registry.npmjs.org to an internal npm mirror, so `npm login` and `npm publish`
 * silently talk to that mirror instead of the public registry. The mirror answers
 * for the official hostname and even hands back its own login URL, so nothing in
 * npm's config can fix it.
 *
 * This proxy keeps the request untouched (same hostname, same TLS/SNI, so the
 * official certificate still validates) and only changes which IP the connection
 * goes to. Every other hostname resolves normally.
 *
 *   node tools/public-registry-proxy.js [--host=registry.npmjs.org]
 *                                       [--dns=1.1.1.1,8.8.8.8]
 *                                       [--port=0]
 *
 * It prints the listening port as the first line of stdout, so a caller can
 * capture it, then sets HTTPS_PROXY to http://127.0.0.1:<port> for npm.
 *
 * Used by tools/npm-registry/registry-common.sh when an internal mirror answers for the
 * registry hostname (npm-login.sh / npm-publish.sh).
 */
const dns = require("dns");
const http = require("http");
const net = require("net");
const { URL } = require("url");

const argv = process.argv.slice(2);
const option = (name, fallback) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : fallback;
};

const targetHost = option("host", "registry.npmjs.org");
const nameServers = option("dns", "1.1.1.1,8.8.8.8")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
const listenPort = Number(option("port", "0"));

const resolver = new dns.Resolver();
resolver.setServers(nameServers);

const log = (...parts) =>
    process.stderr.write(`[registry-proxy] ${parts.join(" ")}\n`);

const resolveAddress = (host) =>
    new Promise((resolve, reject) => {
        if (host !== targetHost) {
            dns.lookup(host, (error, address) =>
                error ? reject(error) : resolve(address),
            );
            return;
        }
        resolver.resolve4(host, (error, addresses) => {
            if (error || !addresses?.length) {
                log(
                    `public DNS lookup failed for ${host} (${error?.code ?? "empty"}); using system DNS`,
                );
                dns.lookup(host, (fallbackError, address) =>
                    fallbackError ? reject(fallbackError) : resolve(address),
                );
                return;
            }
            log(`${host} -> ${addresses[0]} (via ${nameServers.join(",")})`);
            resolve(addresses[0]);
        });
    });

const splitAuthority = (authority) => {
    const [host, port] = authority.split(":");
    return { host, port: Number(port) || 443 };
};

const server = http.createServer((request, response) => {
    // npm tunnels https through CONNECT; plain http is forwarded here.
    let target;
    try {
        target = new URL(request.url);
    } catch {
        response.writeHead(400);
        response.end("absolute-URI required");
        return;
    }
    resolveAddress(target.hostname)
        .then((address) => {
            const upstream = http.request(
                {
                    host: address,
                    port: Number(target.port) || 80,
                    path: target.pathname + target.search,
                    method: request.method,
                    headers: request.headers,
                },
                (upstreamResponse) => {
                    response.writeHead(
                        upstreamResponse.statusCode,
                        upstreamResponse.headers,
                    );
                    upstreamResponse.pipe(response);
                },
            );
            upstream.on("error", (error) => {
                log(`http upstream error ${target.hostname}: ${error.message}`);
                if (!response.headersSent) response.writeHead(502);
                response.end();
            });
            request.pipe(upstream);
        })
        .catch((error) => {
            log(`http resolve failed ${target.hostname}: ${error.message}`);
            response.writeHead(502);
            response.end();
        });
});

server.on("connect", (request, clientSocket, head) => {
    const { host, port } = splitAuthority(request.url);
    resolveAddress(host)
        .then((address) => {
            const upstream = net.connect(port, address, () => {
                clientSocket.write(
                    "HTTP/1.1 200 Connection Established\r\n\r\n",
                );
                if (head?.length) upstream.write(head);
                upstream.pipe(clientSocket);
                clientSocket.pipe(upstream);
            });
            upstream.on("error", (error) => {
                log(`tunnel error ${host}: ${error.message}`);
                clientSocket.destroy();
            });
            clientSocket.on("error", () => upstream.destroy());
        })
        .catch((error) => {
            log(`resolve failed for ${host}: ${error.message}`);
            clientSocket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n");
        });
});

server.listen(listenPort, "127.0.0.1", () => {
    process.stdout.write(`${server.address().port}\n`);
    log(
        `listening on 127.0.0.1:${server.address().port} — ${targetHost} resolved via ${nameServers.join(", ")}`,
    );
});
