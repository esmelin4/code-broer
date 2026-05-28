/**
 * publisher.js — Publica artículos en WordPress via REST API.
 */

import { uploadImageToWP } from './images.js';

const BASE_URL = () => (process.env.WP_URL || '').replace(/\/$/, '');
const AUTH     = () => Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

async function wpPost(method, endpoint, body) {
  const res = await fetch(`${BASE_URL()}/wp-json/wp/v2${endpoint}`, {
    method,
    headers: { 'Authorization': `Basic ${AUTH()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`WP ${method} ${endpoint}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// Obtener o crear una categoría por slug
const catCache = {};
async function getOrCreateCategory(slug) {
  if (catCache[slug]) return catCache[slug];
  const cats = await wpPost('GET', `/categories?slug=${slug}`);
  if (cats.length) { catCache[slug] = cats[0].id; return cats[0].id; }
  const nameMap = {
    'recetas-saludables':          'Recetas Saludables',
    'recetas-keto':                'Recetas Keto',
    'dieta-keto':                  'Dieta Keto',
    'dieta-baja-en-carbohidratos': 'Dieta Baja en Carbohidratos',
    'ayuno-intermitente':          'Ayuno Intermitente',
    'saludybienestar':             'Salud y Bienestar',
  };
  const cat = await wpPost('POST', '/categories', { name: nameMap[slug] || slug, slug });
  catCache[slug] = cat.id;
  return cat.id;
}

// Obtener o crear tags
async function getOrCreateTags(tagNames) {
  const ids = [];
  for (const name of tagNames) {
    const slug = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    try {
      const existing = await wpPost('GET', `/tags?slug=${slug}`);
      if (existing.length) { ids.push(existing[0].id); continue; }
      const tag = await wpPost('POST', '/tags', { name, slug });
      ids.push(tag.id);
    } catch { /* ignorar error de tag individual */ }
  }
  return ids;
}

export async function publishToWP(article, image) {
  // Subir imagen si existe
  let featuredMediaId = null;
  if (image) {
    featuredMediaId = await uploadImageToWP(image, article.title);
  }

  // Obtener IDs de categoría y tags
  const categoryId = await getOrCreateCategory(article.categoria);
  const tagIds     = await getOrCreateTags(article.tags || []);

  // Obtener ID del usuario actual (para asignar autor)
  const me = await wpPost('GET', '/users/me');

  // Publicar el post
  const postData = {
    title:          article.title,
    content:        article.content,
    status:         'publish',
    author:         me.id,
    categories:     [categoryId],
    tags:           tagIds,
    excerpt:        article.metaDesc,
  };

  if (featuredMediaId) postData.featured_media = featuredMediaId;

  const post = await wpPost('POST', '/posts', postData);
  console.log(`  [publisher] ✓ Post publicado: ${post.link}`);

  return post.id;
}
