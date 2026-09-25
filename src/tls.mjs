import tls from 'node:tls';

export async function inspectTls(rawUrl, { timeoutMs = 15000, warnDays = 14 } = {}) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') {
    return {
      checked: false,
      ok: true,
      authorized: null,
      authorizationError: null,
      validFrom: null,
      validTo: null,
      daysRemaining: null,
      warning: null,
      error: null
    };
  }

  const port = Number(url.port || 443);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const socket = tls.connect({
      host: url.hostname,
      port,
      servername: url.hostname,
      rejectUnauthorized: false
    });

    const timer = setTimeout(() => {
      socket.destroy();
      finish({
        checked: true,
        ok: false,
        authorized: false,
        authorizationError: 'TLS connection timed out',
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        warning: null,
        error: 'TLS connection timed out'
      });
    }, timeoutMs);

    socket.once('secureConnect', () => {
      clearTimeout(timer);
      const cert = socket.getPeerCertificate();
      const validFrom = cert?.valid_from || null;
      const validTo = cert?.valid_to || null;
      const expiresAt = validTo ? Date.parse(validTo) : NaN;
      const daysRemaining = Number.isFinite(expiresAt)
        ? Math.ceil((expiresAt - Date.now()) / 86400000)
        : null;
      const authorized = Boolean(socket.authorized);
      const expired = daysRemaining !== null && daysRemaining < 0;
      const warning = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= warnDays
        ? `TLS 证书将在 ${daysRemaining} 天内到期`
        : null;

      socket.end();
      finish({
        checked: true,
        ok: authorized && !expired,
        authorized,
        authorizationError: socket.authorizationError || null,
        validFrom,
        validTo,
        daysRemaining,
        warning,
        error: null
      });
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      finish({
        checked: true,
        ok: false,
        authorized: false,
        authorizationError: error?.code || null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        warning: null,
        error: error?.message || String(error)
      });
    });
  });
}
