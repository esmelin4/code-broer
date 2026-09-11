/**
 * scraper.js — Extrae temas e ideas de las 50 URLs fuente.
 * No copia contenido: solo extrae títulos, headings y keywords.
 */

import { readFileSync } from 'fs';
import * as cheerio from 'cheerio';
import { fetchWithRetry } from './retry.js';

function log(msg) { console.log(`  [scraper] ${msg}`); }

async function fetchPage(url) {
  try {
    const res = await fetchWithRetry(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HealthBot/1.0)' },
      signal: AbortSignal.timeout(10000),
    }, { retries: 2, baseDelayMs: 800, label: `scraper ${url}` });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function extractTopics(html, sourceUrl) {
  const $ = cheerio.load(html);
  const topics = [];

  // Extraer artículos del blog (títulos de posts)
  const selectors = [
    'article h1, article h2',
    '.post-title a, .entry-title a',
    'h2.title a, h3.title a',
    '.article-title, .post-header h2',
    'h2 a[href*="/20"], h3 a[href*="/20"]', // links con año en URL
  ];

  for (const sel of selectors) {
    $(sel).each((_, el) => {
      const title = $(el).text().trim();
      if (title.length < 15 || title.length > 120) return;
      // Extraer keywords del título
      const keywords = title
        .toLowerCase()
        .replace(/[^a-záéíóúñü\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 4);

      topics.push({ title, keywords: keywords.slice(0, 5), source: sourceUrl });
    });
    if (topics.length >= 10) break;
  }

  // Si no encontró nada con selectors específicos, buscar headings generales
  if (!topics.length) {
    $('h2, h3').each((_, el) => {
      const title = $(el).text().trim();
      if (title.length < 15 || title.length > 120) return;
      const keywords = title.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      topics.push({ title, keywords: keywords.slice(0, 5), source: sourceUrl });
    });
  }

  return topics.slice(0, 8); // máximo 8 temas por URL
}

export async function scrapeTopics(sourcesFile, usedTopics = []) {
  let urls = [];
  try {
    urls = JSON.parse(readFileSync(sourcesFile, 'utf8'));
  } catch {
    log('⚠️  No se encontró sources.json. Esperando que el usuario agregue las URLs.');
    return [];
  }

  log(`Analizando ${urls.length} fuentes...`);
  const allTopics = [];

  for (const url of urls) {
    const html = await fetchPage(url);
    if (!html) { log(`✗ Sin acceso: ${url}`); continue; }
    const topics = extractTopics(html, url);
    allTopics.push(...topics);
    log(`✓ ${topics.length} temas de ${url}`);
  }

  // Filtrar temas ya usados
  const usedSet = new Set(usedTopics.map(t => t.toLowerCase()));
  const fresh   = allTopics.filter(t => !usedSet.has(t.title.toLowerCase()));

  // Mezclar aleatoriamente para no repetir siempre las mismas fuentes primero
  fresh.sort(() => Math.random() - 0.5);

  log(`${fresh.length} temas nuevos disponibles (${allTopics.length - fresh.length} ya usados)`);
  return fresh;
}
