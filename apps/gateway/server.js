import { spawn } from 'child_process';
import http from 'http';
import net from 'net';

const PORT = process.env.PORT || 3000;
const OPENCLAW_PORT = 18789;

// Health check state
let openclawHealthy = false;
let openclawProcess = null;

// Start OpenClaw gateway as child process
function startOpenClaw() {
  console.log('Starting OpenClaw gateway...');
  
  const args = [
    'openclaw', 'gateway',
    '--port', String(OPENCLAW_PORT),
    '--bind', 'lan',
    '--allow-unconfigured'
  ];

  // Add token if configured
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    args.push('--token', process.env.OPENCLAW_GATEWAY_TOKEN);
  }

  openclawProcess = spawn('npx', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      // Increase Node heap size to prevent OOM crashes
      NODE_OPTIONS: '--max-old-space-size=2048',
      // Pass through API keys for supported providers
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    }
  });

  openclawProcess.stdout.on('data', (data) => {
    console.log(`[openclaw] ${data.toString().trim()}`);
    // Mark healthy when gateway starts
    if (data.toString().includes('listening') || data.toString().includes('started')) {
      openclawHealthy = true;
    }
  });

  openclawProcess.stderr.on('data', (data) => {
    console.error(`[openclaw] ${data.toString().trim()}`);
  });

  openclawProcess.on('close', (code) => {
    console.log(`OpenClaw exited with code ${code}`);
    openclawHealthy = false;
    // Restart after delay
    setTimeout(startOpenClaw, 5000);
  });

  // Mark healthy after startup delay
  setTimeout(() => {
    openclawHealthy = true;
  }, 3000);
}

// Proxy HTTP request to OpenClaw
function proxyRequest(req, res) {
  const options = {
    hostname: 'localhost',
    port: OPENCLAW_PORT,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      host: `localhost:${OPENCLAW_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`Proxy error: ${err.message}`);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: 'OpenClaw not available' }));
  });

  req.pipe(proxyReq);
}

// HTTP server with reverse proxy
const server = http.createServer((req, res) => {
  // Health check endpoint for Railway
  if (req.url === '/health') {
    if (openclawHealthy) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        status: 'ok', 
        openclaw: 'running',
        wsPort: OPENCLAW_PORT 
      }));
    } else {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'starting' }));
    }
    return;
  }

  // Proxy all other requests to OpenClaw
  proxyRequest(req, res);
});

// Handle WebSocket upgrades - proxy to OpenClaw
server.on('upgrade', (req, socket, head) => {
  // Create TCP connection to OpenClaw
  const proxySocket = net.connect(OPENCLAW_PORT, 'localhost', () => {
    // Reconstruct the HTTP upgrade request
    const headers = Object.entries(req.headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\r\n');
    
    const upgradeRequest = [
      `${req.method} ${req.url} HTTP/1.1`,
      headers,
      '',
      ''
    ].join('\r\n');

    // Send the upgrade request to OpenClaw
    proxySocket.write(upgradeRequest);
    
    // Send any initial data (head)
    if (head && head.length > 0) {
      proxySocket.write(head);
    }

    // Pipe data bidirectionally
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });

  proxySocket.on('error', (err) => {
    console.error(`WebSocket proxy error: ${err.message}`);
    socket.end();
  });

  socket.on('error', (err) => {
    console.error(`Client socket error: ${err.message}`);
    proxySocket.end();
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down...');
  if (openclawProcess) {
    openclawProcess.kill('SIGTERM');
  }
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('Received SIGINT, shutting down...');
  if (openclawProcess) {
    openclawProcess.kill('SIGTERM');
  }
  server.close(() => process.exit(0));
});

// Start
startOpenClaw();
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy server listening on port ${PORT}`);
  console.log(`OpenClaw gateway will run on port ${OPENCLAW_PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
