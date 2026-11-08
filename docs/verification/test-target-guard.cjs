const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function assertDisposableTestTarget(baseUrl, environment = process.env) {
  let target;
  try {
    target = new URL(baseUrl);
  } catch {
    throw new Error('Refusing browser verification: BASE_URL must be a local http(s) origin.');
  }

  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!['http:', 'https:'].includes(target.protocol)
      || target.username !== ''
      || target.password !== ''
      || !LOOPBACK_HOSTS.has(hostname)
      || target.pathname !== '/'
      || target.search !== ''
      || target.hash !== '') {
    throw new Error('Refusing browser verification: BASE_URL must be an exact localhost, 127.0.0.1, or [::1] origin without credentials or a path.');
  }

  if (environment.DISPOSABLE_TEST_SERVER !== '1') {
    throw new Error('Refusing browser verification: start your own local server with DATABASE_PATH=:memory:, then set DISPOSABLE_TEST_SERVER=1. These scripts create guest sessions and may create rooms or delete the test account.');
  }

  return target;
}

function getSameOriginRequestUrl(requestUrl, allowedOrigin) {
  let target;
  try {
    target = new URL(requestUrl);
  } catch {
    return null;
  }

  if (target.username !== '' || target.password !== '') return null;
  if (target.protocol === 'ws:') target.protocol = 'http:';
  if (target.protocol === 'wss:') target.protocol = 'https:';
  if (!['http:', 'https:'].includes(target.protocol) || target.origin !== allowedOrigin) return null;
  return target;
}

function isRedirectStatus(status) {
  return status >= 300 && status < 400;
}

function connectPolicyFor(origin) {
  const target = new URL(origin);
  const webSocketProtocol = target.protocol === 'https:' ? 'wss:' : 'ws:';
  return `connect-src ${target.origin} ${webSocketProtocol}//${target.host}`;
}

function mergeConnectPolicy(existingPolicy, connectPolicy) {
  return existingPolicy ? `${existingPolicy}, ${connectPolicy}` : connectPolicy;
}

async function installBrowserRequestGuard(context, baseUrl, { onOffOriginWebSocket = () => {} } = {}) {
  const allowedOrigin = assertDisposableTestTarget(baseUrl).origin;
  const connectPolicy = connectPolicyFor(allowedOrigin);

  await context.grantPermissions(['local-network-access'], { origin: allowedOrigin });
  await context.route('**/*', async (route) => {
    if (!getSameOriginRequestUrl(route.request().url(), allowedOrigin)) {
      return route.abort('blockedbyclient');
    }

    try {
      const response = await route.fetch({ maxRedirects: 0 });
      if (isRedirectStatus(response.status())) {
        await response.dispose();
        return route.abort('blockedbyclient');
      }
      const existingPolicy = response.headers()['content-security-policy'];
      return route.fulfill({
        response,
        headers: {
          ...response.headers(),
          'content-security-policy': mergeConnectPolicy(existingPolicy, connectPolicy),
        },
      });
    } catch {
      return route.abort('failed');
    }
  });

  await context.routeWebSocket(
    url => !getSameOriginRequestUrl(url.href, allowedOrigin),
    webSocketRoute => {
      onOffOriginWebSocket();
      return webSocketRoute.close({ code: 1008, reason: 'Blocked off-origin WebSocket' });
    },
  );

  await context.addInitScript((expectedOrigin) => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = new Proxy(NativeWebSocket, {
      construct(target, args, newTarget) {
        let socketUrl;
        try {
          socketUrl = new URL(args[0], window.location.href);
        } catch {
          throw new DOMException('WebSocket URL is outside the configured local origin.', 'SecurityError');
        }
        if (socketUrl.protocol === 'ws:') socketUrl.protocol = 'http:';
        if (socketUrl.protocol === 'wss:') socketUrl.protocol = 'https:';
        if (!['http:', 'https:'].includes(socketUrl.protocol)
            || socketUrl.origin !== expectedOrigin
            || window.location.origin !== expectedOrigin) {
          throw new DOMException('WebSocket URL is outside the configured local origin.', 'SecurityError');
        }
        return Reflect.construct(target, args, newTarget);
      },
    });
  }, allowedOrigin);

  return allowedOrigin;
}

async function requestWithoutRedirects(apiRequestContext, method, requestUrl, baseUrl, options = {}) {
  const allowedOrigin = assertDisposableTestTarget(baseUrl).origin;
  if (!getSameOriginRequestUrl(requestUrl, allowedOrigin)) {
    throw new Error('Refusing browser verification: API requests must use the configured local origin.');
  }

  const response = await apiRequestContext[method](requestUrl, { ...options, maxRedirects: 0 });
  if (isRedirectStatus(response.status())) {
    await response.dispose();
    throw new Error('Refusing browser verification: API redirects are disabled.');
  }
  return response;
}

async function fetchRouteWithoutRedirects(route, baseUrl, options = {}) {
  const allowedOrigin = assertDisposableTestTarget(baseUrl).origin;
  if (!getSameOriginRequestUrl(route.request().url(), allowedOrigin)) {
    await route.abort('blockedbyclient');
    throw new Error('Refusing browser verification: intercepted requests must use the configured local origin.');
  }

  let response;
  try {
    response = await route.fetch({ ...options, maxRedirects: 0 });
  } catch {
    await route.abort('failed');
    throw new Error('Refusing browser verification: intercepted request failed without following redirects.');
  }

  if (isRedirectStatus(response.status())) {
    await response.dispose();
    await route.abort('blockedbyclient');
    throw new Error('Refusing browser verification: intercepted request redirects are disabled.');
  }
  return response;
}

module.exports = {
  assertDisposableTestTarget,
  fetchRouteWithoutRedirects,
  getSameOriginRequestUrl,
  installBrowserRequestGuard,
  requestWithoutRedirects,
};
