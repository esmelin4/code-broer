/**
 * writer.js — Genera artículos 100% originales usando Claude (Anthropic API).
 */

import Anthropic from '@anthropic-ai/sdk';
import { withRetry } from './retry.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2, timeout: 120000 });

const SITE_CONTEXT = `
Eres el redactor principal de "Secreto de Salud y Bienestar" (secretodesaludybienestar.com).
El blog cubre: alimentación saludable, dietas keto y low carb, ayuno intermitente, recetas nutritivas y bienestar general.
Escribís en español neutro latinoamericano, de forma clara, amigable y práctica.
Tu audiencia son adultos que buscan mejorar su alimentación sin complicaciones.
`;

const ARTICLE_PROMPT = (topic) => `
${SITE_CONTEXT}

Escribí un artículo de blog completamente original sobre el siguiente tema:
TEMA: ${topic.title}
PALABRAS CLAVE A INCLUIR: ${topic.keywords.join(', ')}

ESTRUCTURA REQUERIDA (devolvé el artículo en HTML limpio, listo para WordPress):

1. Un título H1 atractivo y con la keyword principal (diferente al tema dado, más SEO-friendly)
2. Introducción de 2 párrafos que enganchen al lector
3. Al menos 4 secciones con H2, cada una con 2-3 párrafos de contenido sustancioso
4. Lista de puntos clave o pasos donde sea apropiado (usa <ul> o <ol>)
5. Conclusión con call to action
6. Total: entre 900 y 1200 palabras

REGLAS:
- NO copies ni parafrasees contenido de otros sitios, escribí desde cero
- Incluí datos útiles, consejos prácticos y ejemplos concretos
- Mencioná las keywords de forma natural, sin forzar
- NO incluyas el título H1 en el HTML (WordPress lo pone automáticamente)
- Empezá directamente con el primer párrafo o una sección H2

Devolvé SOLO el HTML del contenido (sin <html>, <head> ni <body>).
Al final, en una línea separada por "---META---", devolvé:
TITULO_SEO: [título SEO de máximo 60 caracteres]
META_DESC: [meta description de 140-155 caracteres]
CATEGORIA: [una de estas: recetas-saludables, recetas-keto, dieta-keto, dieta-baja-en-carbohidratos, ayuno-intermitente, saludybienestar]
TAGS: [3-5 tags separados por coma]
`;

export async function writeArticle(topic) {
  const response = await withRetry(
    () => client.messages.create({
      model:      'claude-opus-4-7',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: ARTICLE_PROMPT(topic) }],
    }),
    { retries: 3, baseDelayMs: 2000, label: 'Anthropic writeArticle' }
  );

  const full    = response.content[0].text;
  const [html, metaRaw] = full.split('---META---');

  // Parsear metadatos
  const getMeta = (key) => {
    const match = metaRaw?.match(new RegExp(`${key}:\\s*(.+)`));
    return match ? match[1].trim() : '';
  };

  const seoTitle  = getMeta('TITULO_SEO') || topic.title;
  const metaDesc  = getMeta('META_DESC')  || '';
  const categoria = getMeta('CATEGORIA')  || 'saludybienestar';
  const tags      = getMeta('TAGS')?.split(',').map(t => t.trim()) || [];

  // Contar palabras aproximadas
  const wordCount = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;

  return { title: seoTitle, content: html.trim(), metaDesc, categoria, tags, wordCount, topic };
}
