/**
 * retry.js — Reintentos con backoff exponencial para llamadas a APIs externas.
 * Usado por scraper, writer, images y publisher para que fallos transitorios
 * (red, rate limits, 5xx) no tiren todo el ciclo del autopublisher.
 */

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 522, 524, 529]);
const RETRYABLE_CODES  = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EPIPE']);

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function isRetryableError(err) {
  if (!err) return false;
  if (err.status && RETRYABLE_STATUS.has(err.status)) return true;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  const code = err.code || err.cause?.code;
  if (code && RETRYABLE_CODES.has(code)) return true;
  if (err instanceof TypeError && /fetch/i.test(err.message)) return true; // fallo de red del fetch
  return false;
}

/**
 * Reintenta `fn` con backoff exponencial + jitter.
 * `fn` recibe el número de intento (1-based) y puede lanzar para reintentar.
 */
export async function withRetry(fn, opts = {}) {
  const {
    retries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 20000,
    label = 'operación',
    shouldRetry = isRetryableError,
    onRetry,
  } = opts;

  const totalAttempts = retries + 1;
  let lastErr;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const attemptsLeft = totalAttempts - attempt;
      if (attemptsLeft <= 0 || !shouldRetry(err)) throw err;

      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)) + Math.floor(Math.random() * 250);
      if (onRetry) {
        onRetry(err, attempt, delay);
      } else {
        console.log(`  [retry] ${label}: intento ${attempt}/${totalAttempts} falló (${err.message}). Reintentando en ${delay}ms...`);
      }
      await sleep(delay);
    }
  }

  throw lastErr;
}

/**
 * fetch() con reintentos automáticos ante errores de red o status HTTP
 * retryables (429, 5xx, etc). Devuelve el Response tal cual para que el
 * caller decida qué hacer con status no-retryables (401, 404, ...).
 */
export async function fetchWithRetry(url, init = {}, opts = {}) {
  const { label = String(url), ...rest } = opts;

  return withRetry(async () => {
    const res = await fetch(url, init);
    if (!res.ok && RETRYABLE_STATUS.has(res.status)) {
      const body = await res.text().catch(() => '');
      const err = new Error(`HTTP ${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
      err.status = res.status;
      throw err;
    }
    return res;
  }, { label, ...rest });
}
