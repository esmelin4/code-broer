#!/usr/bin/env node
/**
 * autopublisher/index.js
 * Daemon que corre 24/7 y publica un artículo original cada 5 horas.
 *
 * Cómo correrlo:
 *   node autopublisher/index.js
 *
 * Variables de entorno requeridas (.env):
 *   WP_URL=https://secretodesaludybienestar.com
 *   WP_USER=manager
 *   WP_PASS=pdbk LhTG DXgv Dqy9 hgvi 4My1
 *   ANTHROPIC_API_KEY=sk-ant-...        <- de console.anthropic.com
 *   PEXELS_API_KEY=...                  <- de pexels.com/api (gratis)
 *
 * Instalar dependencias primero:
 *   npm install dotenv @anthropic-ai/sdk node-cron cheerio
 */

import 'dotenv/config';
import cron      from 'node-cron';
import Anthropic from '@anthropic-ai/sdk';
import { scrapeTopics }    from './scraper.js';
import { writeArticle }    from './writer.js';
import { fetchImage }      from './images.js';
import { publishToWP }     from './publisher.js';
import { loadState, saveState } from './state.js';

const INTERVAL_HOURS = 5;
const SOURCES_FILE   = './autopublisher/sources.json'; // las 50 URLs

function log(msg) {
  const ts = new Date().toLocaleString('es-ES');
  console.log(`[${ts}] ${msg}`);
}

async function runCycle() {
  log('──────────────────────────────────────');
  log('Iniciando ciclo de publicación...');

  try {
    const state   = loadState();
    const topics  = await scrapeTopics(SOURCES_FILE, state.usedTopics || []);

    if (!topics.length) {
      log('⚠️  Sin temas nuevos disponibles. Esperando próximo ciclo.');
      return;
    }

    const topic = topics[0];
    log(`📝 Tema elegido: "${topic.title}" (fuente: ${topic.source})`);

    // Escribir artículo original con Claude
    const article = await writeArticle(topic);
    log(`✓ Artículo generado: ${article.title} (${article.wordCount} palabras)`);

    // Buscar imagen sin derechos de autor
    const image = await fetchImage(topic.keywords[0] || topic.title);
    if (image) log(`✓ Imagen: ${image.url}`);
    else        log('⚠️  Sin imagen (se publicará sin foto destacada)');

    // Publicar en WordPress
    const postId = await publishToWP(article, image);
    log(`✅ Publicado! ID WordPress: ${postId}`);

    // Guardar estado para no repetir temas
    state.usedTopics = [...(state.usedTopics || []), topic.title];
    state.lastPublished = new Date().toISOString();
    state.totalPublished = (state.totalPublished || 0) + 1;
    saveState(state);

    log(`Total publicados hasta ahora: ${state.totalPublished}`);
  } catch (err) {
    log(`✗ Error en ciclo: ${err.message}`);
  }
}

async function main() {
  log('🚀 Auto-publisher iniciado');
  log(`Publicará un artículo cada ${INTERVAL_HOURS} horas`);

  // Verificar variables de entorno
  const required = ['WP_URL', 'WP_USER', 'WP_PASS', 'ANTHROPIC_API_KEY', 'PEXELS_API_KEY'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`✗ Faltan variables de entorno: ${missing.join(', ')}`);
    console.error('Creá el archivo .env con esas variables y volvé a correr.');
    process.exit(1);
  }

  // Primer ciclo inmediato
  await runCycle();

  // Cron: cada 5 horas
  cron.schedule(`0 */${INTERVAL_HOURS} * * *`, runCycle);
  log(`⏰ Próxima publicación en ${INTERVAL_HOURS} horas. Dejá esta ventana abierta.`);
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1); });
