/**
 * 本地代理服务器
 * 用于绕过 CORS 和 SSL 问题,将浏览器请求转发到官方 API
 *
 * 启动方法: node proxy-server.js
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// 配置
const LOCAL_PORT = 30777;
const TARGET_BASE = 'https://dip.aishu.cn:443';

// 创建本地代理服务器
const server = http.createServer((req, res) => {
  console.log('\n' + '='.repeat(80));
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // 允许 CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24小时

  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    console.log('✓ CORS preflight request handled');
    res.writeHead(204);
    res.end();
    return;
  }

  // 构建目标 URL
  const targetUrl = `${TARGET_BASE}${req.url}`;
  console.log(`→ Proxying to: ${targetUrl}`);

  // 解析目标 URL
  const parsedUrl = new URL(targetUrl);

  // 收集请求体数据
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    // 打印请求详情
    if (body) {
      console.log('→ Request Body:');
      try {
        const jsonBody = JSON.parse(body);
        console.log(JSON.stringify(jsonBody, null, 2));
      } catch (e) {
        console.log(body);
      }
    }

    // 准备代理请求
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 443,
      path: parsedUrl.pathname + parsedUrl.search,
      method: req.method,
      headers: {
        ...req.headers,
        'host': parsedUrl.hostname,
      },
      // 重要: 忽略 SSL 证书验证 (仅用于开发环境)
      rejectUnauthorized: false,
    };

    // 删除可能导致问题的 headers
    delete options.headers['host'];
    delete options.headers['connection'];

    console.log('→ Request Headers:');
    console.log(JSON.stringify(options.headers, null, 2));

    // 发送代理请求
    const proxyReq = https.request(options, (proxyRes) => {
      console.log(`← Response Status: ${proxyRes.statusCode}`);
      console.log('← Response Headers:');
      console.log(JSON.stringify(proxyRes.headers, null, 2));

      // 设置响应头
      res.writeHead(proxyRes.statusCode, {
        ...proxyRes.headers,
        'Access-Control-Allow-Origin': '*',
      });

      // 如果是 SSE 流式响应
      if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
        console.log('← Streaming response (SSE)');

        proxyRes.on('data', chunk => {
          const data = chunk.toString();
          process.stdout.write('← '); // 前缀
          process.stdout.write(data);
          res.write(chunk);
        });

        proxyRes.on('end', () => {
          console.log('\n✓ Stream ended');
          res.end();
        });
      } else {
        // 普通响应
        let responseBody = '';

        proxyRes.on('data', chunk => {
          responseBody += chunk.toString();
          res.write(chunk);
        });

        proxyRes.on('end', () => {
          console.log('← Response Body:');
          try {
            const jsonResponse = JSON.parse(responseBody);
            console.log(JSON.stringify(jsonResponse, null, 2));
          } catch (e) {
            console.log(responseBody.substring(0, 500));
          }
          console.log('✓ Request completed');
          res.end();
        });
      }
    });

    // 错误处理
    proxyReq.on('error', (error) => {
      console.error('✗ Proxy Error:', error.message);
      console.error(error);

      res.writeHead(500, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({
        error: 'Proxy Error',
        message: error.message,
        details: error.toString(),
      }));
    });

    // 发送请求体
    if (body) {
      proxyReq.write(body);
    }

    proxyReq.end();
  });

  req.on('error', (error) => {
    console.error('✗ Request Error:', error.message);
    res.writeHead(500, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify({
      error: 'Request Error',
      message: error.message,
    }));
  });
});

// 启动服务器
server.listen(LOCAL_PORT, '127.0.0.1', () => {
  console.log('='.repeat(80));
  console.log('🚀 代理服务器已启动!');
  console.log('='.repeat(80));
  console.log('');
  console.log('📋 配置信息:');
  console.log(`  本地地址: http://127.0.0.1:${LOCAL_PORT}`);
  console.log(`  目标地址: ${TARGET_BASE}`);
  console.log('');
  console.log('✅ 功能:');
  console.log('  ✓ CORS 跨域支持');
  console.log('  ✓ HTTPS 转发');
  console.log('  ✓ SSL 证书忽略 (开发环境)');
  console.log('  ✓ SSE 流式响应支持');
  console.log('  ✓ 详细日志输出');
  console.log('');
  console.log('📝 使用方法:');
  console.log('  1. 保持此代理服务器运行');
  console.log('  2. 在 .env.local 中设置:');
  console.log(`     VITE_AGENT_API_BASE_URL=http://127.0.0.1:${LOCAL_PORT}/api/agent-app/v1`);
  console.log('  3. 重启前端开发服务器 (npm run dev)');
  console.log('');
  console.log('⏳ 等待请求...');
  console.log('='.repeat(80));
});

server.on('error', (error) => {
  console.error('✗ 服务器错误:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.error(`端口 ${LOCAL_PORT} 已被占用，请关闭其他使用该端口的程序或修改 LOCAL_PORT`);
  }
  process.exit(1);
});
