#!/usr/bin/env node
/**
 * seo-wordpress.js
 * Optimiza SEO de todos los artículos existentes:
 *   - Instala RankMath SEO (si no está)
 *   - Mejora titles y meta descriptions
 *   - Detecta y reporta broken links
 *   - Limpia slugs
 *
 * Uso:
 *   $env:WP_URL="..."; $env:WP_USER="..."; $env:WP_PASS="..."; node seo-wordpress.js
 */

const BASE_URL = (process.env.WP_URL || '').replace(/\/$/, '');
const WP_USER  = process.env.WP_USER || '';
const WP_PASS  = process.env.WP_PASS || '';

if (!BASE_URL || !WP_USER || !WP_PASS) {
  console.error('Faltan variables. Uso: $env:WP_URL="..."; $env:WP_USER="..."; $env:WP_PASS="..."; node seo-wordpress.js');
  process.exit(1);
}

const AUTH    = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const HEADERS = { 'Authorization': `Basic ${AUTH}`, 'Content-Type': 'application/json' };

async function api(method, endpoint, body, base = `${BASE_URL}/wp-json/wp/v2`) {
  const url  = `${base}${endpoint}`;
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

// Palabras clave por categoría para enriquecer los títulos
const KEYWORDS_BY_CAT = {
  'recetas-saludables': ['receta saludable', 'fácil y nutritiva', 'en casa'],
  'recetas-keto':       ['receta keto', 'sin carbohidratos', 'cetogénica'],
  'dieta-keto':         ['dieta keto', 'cetogénica', 'bajar de peso'],
  'dieta-baja-en-carbohidratos': ['low carb', 'baja en carbohidratos', 'dieta saludable'],
  'ayuno-intermitente': ['ayuno intermitente', 'pérdida de peso', 'beneficios'],
  'saludybienestar':    ['salud y bienestar', 'vida saludable', 'consejos de salud'],
  'general':            ['salud', 'bienestar', 'nutrición'],
};

function buildSeoTitle(post, categorySlug) {
  const raw = post.title.rendered.replace(/<[^>]+>/g, '').trim();
  // Si ya tiene barra vertical o guión con nombre del sitio, lo dejamos
  if (raw.includes('|') || raw.includes(' - Secreto')) return raw;
  return `${raw} | Secreto de Salud y Bienestar`;
}

function buildMetaDescription(post, categorySlug) {
  // Extraer texto limpio del contenido
  const content = post.content?.rendered || '';
  const plain = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // Tomar las primeras 155 caracteres para la meta description
  let desc = plain.slice(0, 155);
  if (plain.length > 155) desc = desc.slice(0, desc.lastIndexOf(' ')) + '...';
  // Si el excerpt ya existe y es bueno, usarlo
  const excerpt = post.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim();
  if (excerpt && excerpt.length >= 50 && excerpt.length <= 160) return excerpt;
  return desc || `Descubre todo sobre ${post.title.rendered.replace(/<[^>]+>/g, '')} en Secreto de Salud y Bienestar.`;
}

function cleanSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

// Detectar links rotos dentro del HTML de un post
async function checkBrokenLinks(postId, content) {
  const urls = [...content.matchAll(/href="(https?:\/\/[^"]+)"/g)].map(m => m[1]);
  const broken = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      if (r.status >= 400) broken.push({ url, status: r.status });
    } catch {
      broken.push({ url, status: 'timeout/error' });
    }
  }
  return broken;
}

async function getAllPosts() {
  let allPosts = [], page = 1;
  while (true) {
    const posts = await api('GET', `/posts?per_page=100&page=${page}&status=publish&_fields=id,title,content,excerpt,slug,categories,link`);
    if (!posts.length) break;
    allPosts = allPosts.concat(posts);
    if (posts.length < 100) break;
    page++;
  }
  return allPosts;
}

async function getCategorySlug(catId) {
  try {
    const cat = await api('GET', `/categories/${catId}`);
    return cat.slug;
  } catch { return 'general'; }
}

// ─── INSTALAR RANK MATH ───────────────────────────────────────────────────────
async function instalarRankMath() {
  console.log('\n🔍 PLUGIN SEO (Rank Math)');
  try {
    const plugins = await api('GET', '/plugins', null, `${BASE_URL}/wp-json/wp/v2`);
    const rm = plugins.find(p => p.plugin?.includes('seo-by-rank-math'));
    if (rm) {
      if (rm.status === 'active') { console.log('  ✓ Rank Math ya activo'); return; }
      await api('POST', `/plugins/${encodeURIComponent(rm.plugin)}`, { status: 'active' }, `${BASE_URL}/wp-json/wp/v2`);
      console.log('  ✓ Rank Math activado');
      return;
    }
    await api('POST', '/plugins', { slug: 'seo-by-rank-math', status: 'active' }, `${BASE_URL}/wp-json/wp/v2`);
    console.log('  ✓ Rank Math instalado y activado');
  } catch (e) {
    console.log('  ⚠️  No se pudo instalar Rank Math automáticamente:', e.message.slice(0, 80));
    console.log('  → Instalalo manualmente: Plugins → Añadir nuevo → "Rank Math SEO" → Instalar → Activar');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 Conectando a ${BASE_URL}...`);
  const me = await api('GET', '/users/me');
  console.log(`✓ Autenticado como: ${me.name}`);

  await instalarRankMath();

  console.log('\n🔎 OPTIMIZACIÓN SEO DE ARTÍCULOS');
  const posts = await getAllPosts();
  console.log(`  ${posts.length} artículos encontrados\n`);

  const brokenReport = [];

  for (const post of posts) {
    const catId      = post.categories?.[0];
    const catSlug    = catId ? await getCategorySlug(catId) : 'general';
    const seoTitle   = buildSeoTitle(post, catSlug);
    const metaDesc   = buildMetaDescription(post, catSlug);
    const titleRaw   = post.title.rendered.replace(/<[^>]+>/g, '').trim();
    const betterSlug = cleanSlug(titleRaw);

    // Actualizar excerpt (meta description) y slug si están vacíos o son malos
    const updates = {};
    if (!post.excerpt?.rendered?.trim() || post.excerpt.rendered.replace(/<[^>]+>/g, '').trim().length < 50) {
      updates.excerpt = metaDesc;
    }
    if (post.slug !== betterSlug && betterSlug.length > 5) {
      // Solo cambiar slug si es claramente mejor (más corto y limpio)
      if (betterSlug.length < post.slug.length - 5) updates.slug = betterSlug;
    }

    if (Object.keys(updates).length) {
      try {
        await api('POST', `/posts/${post.id}`, updates);
        console.log(`  ✓ SEO actualizado: "${titleRaw}"`);
      } catch (e) {
        console.log(`  ✗ Error en "${titleRaw}": ${e.message.slice(0, 60)}`);
      }
    } else {
      console.log(`  ✓ OK: "${titleRaw}"`);
    }

    // Verificar broken links
    const broken = await checkBrokenLinks(post.id, post.content?.rendered || '');
    if (broken.length) {
      brokenReport.push({ post: titleRaw, url: post.link, links: broken });
    }
  }

  // Reporte de broken links
  console.log('\n🔗 REPORTE DE LINKS ROTOS');
  if (!brokenReport.length) {
    console.log('  ✓ No se encontraron links rotos');
  } else {
    for (const r of brokenReport) {
      console.log(`\n  Artículo: "${r.post}"`);
      for (const l of r.links) console.log(`    ✗ ${l.url} → ${l.status}`);
    }
    // Guardar reporte en archivo
    const fs = await import('fs');
    fs.writeFileSync('broken-links-report.json', JSON.stringify(brokenReport, null, 2));
    console.log('\n  Reporte guardado en broken-links-report.json');
  }

  console.log('\n✅ SEO COMPLETADO.');
  console.log('  Recordá configurar Rank Math desde el admin de WordPress para afinar keywords por artículo.');
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });
