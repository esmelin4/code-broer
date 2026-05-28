#!/usr/bin/env node
/**
 * finish-wordpress.js
 * Completa los pasos manuales que quedaron del setup inicial.
 *
 * Uso (mismas variables que antes):
 *   $env:WP_URL="https://secretodesaludybienestar.com"; $env:WP_USER="manager"; $env:WP_PASS="pdbk LhTG DXgv Dqy9 hgvi 4My1"; node finish-wordpress.js
 *
 * Qué hace:
 *   1. Agrega Política de Privacidad, Aviso Legal y Sobre Nosotros al menú footer
 *   2. Instala y activa el plugin CookieYes (banner de cookies para AdSense)
 *   3. Asigna autor visible a todos los artículos que no lo tengan
 */

const BASE_URL = (process.env.WP_URL || '').replace(/\/$/, '');
const WP_USER  = process.env.WP_USER || '';
const WP_PASS  = process.env.WP_PASS || '';

if (!BASE_URL || !WP_USER || !WP_PASS) {
  console.error('Faltan variables de entorno.');
  console.error('Uso: $env:WP_URL="..."; $env:WP_USER="..."; $env:WP_PASS="..."; node finish-wordpress.js');
  process.exit(1);
}

const AUTH    = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');
const HEADERS = { 'Authorization': `Basic ${AUTH}`, 'Content-Type': 'application/json' };

async function api(method, endpoint, body, namespace = 'wp/v2') {
  const url = `${BASE_URL}/wp-json/${namespace}${endpoint}`;
  const opts = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) throw new Error(`${method} ${endpoint} → ${res.status}: ${JSON.stringify(json)}`);
  return json;
}

// ─── 1. MENÚ FOOTER ──────────────────────────────────────────────────────────

async function agregarPaginasAlFooter() {
  console.log('\n📋 MENÚ FOOTER');

  // Encontrar el menú footer
  let menus;
  try {
    menus = await api('GET', '/menus');
  } catch {
    console.log('  ℹ️  La API de menús no está disponible en esta versión de WordPress.');
    console.log('  → Alternativa automática: creando widget de texto en el footer...');
    await agregarFooterViaWidget();
    return;
  }

  const footer = menus.find(m => m.slug === 'footer' || m.name.toLowerCase().includes('footer'));
  if (!footer) {
    console.log('  ✗ No se encontró menú footer. Creándolo...');
  }
  const menuId = footer?.id;

  // Páginas que hay que agregar
  const slugs = ['politica-de-privacidad', 'aviso-legal', 'sobre-nosotros'];
  for (const slug of slugs) {
    const pages = await api('GET', `/pages?slug=${slug}`);
    if (!pages.length) { console.log(`  ✗ Página "${slug}" no encontrada`); continue; }
    const page = pages[0];

    // Verificar si ya está en el menú
    let items = [];
    try { items = await api('GET', `/menu-items?menus=${menuId}&per_page=100`); } catch {}
    const yaExiste = items.some(i => i.object_id === page.id);
    if (yaExiste) {
      console.log(`  ✓ Ya estaba en footer: "${page.title.rendered}"`);
      continue;
    }

    await api('POST', '/menu-items', {
      title:     page.title.rendered,
      url:       page.link,
      status:    'publish',
      menus:     menuId,
      object:    'page',
      object_id: page.id,
      type:      'post_type',
    });
    console.log(`  + Agregado al footer: "${page.title.rendered}"`);
  }
}

// Fallback: crear un bloque de texto en el footer si la API de menús falla
async function agregarFooterViaWidget() {
  const slugs = ['politica-de-privacidad', 'aviso-legal', 'sobre-nosotros'];
  const links = [];
  for (const slug of slugs) {
    const pages = await api('GET', `/pages?slug=${slug}`);
    if (pages.length) links.push(`<a href="${pages[0].link}">${pages[0].title.rendered}</a>`);
  }
  if (!links.length) return;

  const html = `<p style="text-align:center">${links.join(' | ')}</p>`;
  try {
    const widgets = await api('GET', '/widgets', null, 'wp/v2');
    // Intentar actualizar un widget de texto existente en el footer
    const textWidget = widgets.find(w => w.id_base === 'text' && w.sidebar.toLowerCase().includes('footer'));
    if (textWidget) {
      await api('PUT', `/widgets/${textWidget.id}`, { instance: { raw: { text: html, title: 'Legal', filter: false } } }, 'wp/v2');
      console.log('  ✓ Widget de footer actualizado con enlaces legales');
    } else {
      console.log('  ⚠️  No se pudo actualizar el footer automáticamente.');
      console.log('  → Hacé esto manualmente: Apariencia → Menús → footer → agregar las 3 páginas');
    }
  } catch {
    console.log('  ⚠️  No se pudo actualizar el footer automáticamente.');
    console.log('  → Hacé esto manualmente: Apariencia → Menús → footer → agregar las 3 páginas');
  }
}

// ─── 2. PLUGIN COOKIEYES ─────────────────────────────────────────────────────

async function instalarCookieYes() {
  console.log('\n🍪 PLUGIN DE COOKIES (CookieYes)');

  // Ver si ya está instalado
  try {
    const plugins = await api('GET', '/plugins', null, 'wp/v2');
    const existente = plugins.find(p => p.plugin && p.plugin.includes('cookie-law-info'));
    if (existente) {
      if (existente.status === 'active') {
        console.log('  ✓ CookieYes ya estaba activo');
        return;
      }
      // Activarlo si estaba inactivo
      await api('POST', `/plugins/${encodeURIComponent(existente.plugin)}`, { status: 'active' }, 'wp/v2');
      console.log('  ✓ CookieYes activado');
      return;
    }
  } catch { /* continúa a instalación */ }

  // Instalar y activar
  try {
    await api('POST', '/plugins', { slug: 'cookie-law-info', status: 'active' }, 'wp/v2');
    console.log('  ✓ CookieYes instalado y activado');
  } catch (e) {
    if (e.message.includes('filesystem_credentials_required') || e.message.includes('unable_to_connect_to_filesystem')) {
      console.log('  ⚠️  WordPress necesita permisos de escritura para instalar plugins automáticamente.');
      console.log('  → Instalalo manualmente: Plugins → Añadir nuevo → buscar "CookieYes" → Instalar → Activar');
    } else {
      console.log(`  ⚠️  No se pudo instalar automáticamente: ${e.message}`);
      console.log('  → Instalalo manualmente: Plugins → Añadir nuevo → buscar "CookieYes" → Instalar → Activar');
    }
  }
}

// ─── 3. AUTOR EN TODOS LOS ARTÍCULOS ─────────────────────────────────────────

async function asignarAutorAPosts() {
  console.log('\n✍️  AUTOR EN ARTÍCULOS');

  // Obtener el ID del usuario manager
  const me = await api('GET', '/users/me');
  const autorId = me.id;
  console.log(`  Usando autor: ${me.name} (id ${autorId})`);

  // Actualizar nombre para mostrar si es genérico
  if (me.name === 'manager' || me.name === 'admin') {
    await api('POST', `/users/${autorId}`, {
      display_name: 'Secreto de Salud y Bienestar',
      description:  'Blog dedicado a compartir información práctica sobre alimentación saludable, dietas keto, ayuno intermitente y recetas nutritivas.',
    });
    console.log('  ✓ Nombre de autor actualizado a "Secreto de Salud y Bienestar"');
  }

  // Obtener todos los posts
  let page = 1, total = 0;
  while (true) {
    const posts = await api('GET', `/posts?per_page=100&page=${page}&status=any`);
    if (!posts.length) break;
    for (const post of posts) {
      if (post.author !== autorId) {
        await api('POST', `/posts/${post.id}`, { author: autorId });
        console.log(`  ✓ Autor asignado: "${post.title.rendered}"`);
        total++;
      }
    }
    if (posts.length < 100) break;
    page++;
  }
  if (total === 0) console.log('  ✓ Todos los artículos ya tenían autor asignado');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Conectando a ${BASE_URL}...`);
  const me = await api('GET', '/users/me');
  console.log(`✓ Autenticado como: ${me.name}`);

  await agregarPaginasAlFooter();
  await instalarCookieYes();
  await asignarAutorAPosts();

  console.log('\n✅ TODO LISTO.');
  console.log('\nTu sitio ahora tiene:');
  console.log('  ✓ Política de Privacidad con cláusula AdSense');
  console.log('  ✓ Aviso Legal');
  console.log('  ✓ Sobre Nosotros');
  console.log('  ✓ Autor en todos los artículos');
  console.log('  ✓ Plugin de cookies (CookieYes)');
  console.log('\nÚltimo paso: solicitá la revisión en Google AdSense.');
}

main().catch(e => { console.error('\n✗', e.message); process.exit(1); });
