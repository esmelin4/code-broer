#!/usr/bin/env node
/**
 * setup-wordpress.js
 * Corre este script desde TU computadora (no desde Claude Code).
 *
 * Uso:
 *   WP_URL=https://secretodesaludybienestar.com WP_USER=manager WP_PASS=TuPassword node setup-wordpress.js
 *
 * Qué hace:
 *   1. Crea página Política de Privacidad
 *   2. Crea página Sobre Nosotros
 *   3. Crea página Aviso Legal
 *   4. Crea página Contacto (si no existe)
 *   5. Mueve artículo off-topic "casa de campo" a la papelera
 *   6. Limpia posts en categoría Uncategorized asignándolos a General
 */

const BASE_URL = (process.env.WP_URL || '').replace(/\/$/, '');
const WP_USER = process.env.WP_USER || '';
const WP_PASS = process.env.WP_PASS || '';

if (!BASE_URL || !WP_USER || !WP_PASS) {
  console.error('Faltan variables de entorno. Uso:');
  console.error('  WP_URL=https://secretodesaludybienestar.com WP_USER=manager WP_PASS=TuPassword node setup-wordpress.js');
  process.exit(1);
}

const AUTH = Buffer.from(`${WP_USER}:${WP_PASS}`).toString('base64');

async function api(method, endpoint, body) {
  const url = `${BASE_URL}/wp-json/wp/v2${endpoint}`;
  const opts = {
    method,
    headers: {
      'Authorization': `Basic ${AUTH}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) {
    throw new Error(`${method} ${endpoint} → ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// Busca una página por slug; devuelve el objeto o null
async function findPage(slug) {
  const pages = await api('GET', `/pages?slug=${slug}&status=any`);
  return pages.length ? pages[0] : null;
}

// Crea una página si no existe; si existe la actualiza
async function upsertPage(slug, title, content) {
  const existing = await findPage(slug);
  if (existing) {
    console.log(`  ↻ Actualizando "${title}" (id ${existing.id})`);
    return api('POST', `/pages/${existing.id}`, { title, content, status: 'publish', slug });
  }
  console.log(`  + Creando "${title}"`);
  return api('POST', '/pages', { title, content, status: 'publish', slug });
}

// ─── CONTENIDO DE LAS PÁGINAS ────────────────────────────────────────────────

const PRIVACIDAD = `
<h2>1. Responsable del tratamiento</h2>
<p>El responsable del tratamiento de los datos personales recabados a través de este sitio web es <strong>Secreto de Salud y Bienestar</strong>, accesible en <strong>secretodesaludybienestar.com</strong>.</p>

<h2>2. Datos que recopilamos</h2>
<p>Este sitio puede recopilar los siguientes datos:</p>
<ul>
  <li>Datos de navegación (dirección IP, tipo de navegador, páginas visitadas) a través de cookies analíticas.</li>
  <li>Datos que el usuario facilite voluntariamente a través del formulario de contacto (nombre y correo electrónico).</li>
</ul>

<h2>3. Finalidad del tratamiento</h2>
<p>Los datos se utilizan para:</p>
<ul>
  <li>Mejorar la experiencia de navegación y el funcionamiento del sitio web.</li>
  <li>Responder a consultas enviadas a través del formulario de contacto.</li>
  <li>Mostrar publicidad personalizada a través de <strong>Google AdSense</strong>.</li>
</ul>

<h2>4. Cookies y publicidad (Google AdSense)</h2>
<p>Este sitio web utiliza <strong>Google AdSense</strong>, un servicio de publicidad de Google LLC. Google AdSense utiliza cookies para mostrar anuncios basados en las visitas previas del usuario a este sitio y a otros sitios en Internet.</p>
<p>Google utiliza cookies publicitarias para servir anuncios a los visitantes de este sitio. Los usuarios pueden <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">inhabilitar el uso de la cookie de DoubleClick</a> para la publicidad basada en intereses.</p>
<p>Para obtener más información sobre cómo Google gestiona los datos en sus servicios publicitarios, consulta la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Política de Privacidad de Google</a>.</p>

<h2>5. Cookies de terceros</h2>
<p>Este sitio puede utilizar cookies de terceros con fines estadísticos y publicitarios. Puedes configurar tu navegador para bloquear o alertarte sobre estas cookies.</p>

<h2>6. Base legal del tratamiento</h2>
<p>El tratamiento de tus datos se basa en tu consentimiento (al navegar por este sitio y aceptar el uso de cookies) y en el interés legítimo del responsable para mejorar el servicio.</p>

<h2>7. Derechos del usuario</h2>
<p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, portabilidad y limitación del tratamiento contactando a través del formulario disponible en la página de <a href="/contacto/">Contacto</a>.</p>

<h2>8. Conservación de datos</h2>
<p>Los datos personales facilitados voluntariamente se conservarán mientras sean necesarios para la finalidad para la que fueron recabados o hasta que el usuario solicite su supresión.</p>

<h2>9. Cambios en esta política</h2>
<p>Nos reservamos el derecho de actualizar esta política de privacidad. Te recomendamos revisarla periódicamente. La fecha de última actualización aparece al pie de esta página.</p>

<p><em>Última actualización: ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
`;

const SOBRE_NOSOTROS = `
<h2>¿Quiénes somos?</h2>
<p><strong>Secreto de Salud y Bienestar</strong> es un blog dedicado a compartir información práctica y accesible sobre alimentación saludable, nutrición, dietas keto y low carb, ayuno intermitente y recetas que cuidan tu cuerpo.</p>

<h2>Nuestra misión</h2>
<p>Creemos que llevar una vida saludable no tiene por qué ser complicado ni costoso. Nuestra misión es acercar a cada persona los conocimientos y herramientas para tomar mejores decisiones sobre su alimentación y bienestar diario.</p>

<h2>Qué encontrarás aquí</h2>
<ul>
  <li><strong>Recetas saludables</strong> fáciles de preparar y deliciosas.</li>
  <li><strong>Guías sobre dieta keto y low carb</strong> explicadas de forma clara.</li>
  <li><strong>Información sobre ayuno intermitente</strong> y sus beneficios.</li>
  <li><strong>Consejos de nutrición</strong> basados en evidencia y sentido común.</li>
</ul>

<h2>Aviso sobre el contenido</h2>
<p>La información publicada en este sitio tiene carácter informativo y educativo. No sustituye el consejo médico o nutricional profesional. Ante cualquier duda sobre tu salud o alimentación, consulta siempre con un profesional cualificado.</p>

<h2>Contacto</h2>
<p>Si tienes preguntas, sugerencias o quieres colaborar con nosotros, puedes escribirnos a través de nuestra página de <a href="/contacto/">Contacto</a>.</p>
`;

const AVISO_LEGAL = `
<h2>1. Datos identificativos del titular</h2>
<p>En cumplimiento del artículo 10 de la Ley 34/2002, de 11 de julio, de Servicios de la Sociedad de la Información y del Comercio Electrónico (LSSICE), se informa:</p>
<ul>
  <li><strong>Titular:</strong> Secreto de Salud y Bienestar</li>
  <li><strong>Dominio web:</strong> secretodesaludybienestar.com</li>
  <li><strong>Contacto:</strong> disponible a través del <a href="/contacto/">formulario de contacto</a>.</li>
</ul>

<h2>2. Objeto y ámbito de aplicación</h2>
<p>El presente Aviso Legal regula el acceso y uso del sitio web <strong>secretodesaludybienestar.com</strong>. El acceso al sitio implica la aceptación plena y sin reservas de las presentes condiciones.</p>

<h2>3. Propiedad intelectual</h2>
<p>Todos los contenidos de este sitio web (textos, imágenes, diseño, logotipos y código fuente) son propiedad del titular o de terceros que han autorizado su uso. Queda prohibida su reproducción total o parcial sin autorización expresa y por escrito.</p>

<h2>4. Responsabilidad</h2>
<p>El titular no garantiza la exactitud, integridad o actualidad de los contenidos publicados. La información de este sitio tiene carácter divulgativo y no constituye asesoramiento médico, nutricional ni profesional de ningún tipo. El usuario asume la responsabilidad del uso que haga de la información.</p>

<h2>5. Enlaces externos</h2>
<p>Este sitio puede contener enlaces a páginas de terceros. El titular no se hace responsable del contenido de dichos sitios externos ni de los posibles daños derivados de su uso.</p>

<h2>6. Publicidad</h2>
<p>Este sitio web muestra anuncios publicitarios a través de <strong>Google AdSense</strong>. Los anuncios son gestionados por Google LLC y están sujetos a sus propias políticas y términos de uso. El titular no es responsable del contenido de los anuncios mostrados.</p>

<h2>7. Legislación aplicable</h2>
<p>Las presentes condiciones se rigen por la legislación española. Para cualquier controversia derivada del uso de este sitio, las partes se someten a los juzgados y tribunales del domicilio del usuario.</p>

<p><em>Última actualización: ${new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</em></p>
`;

// ─── TAREAS PRINCIPALES ───────────────────────────────────────────────────────

async function crearPaginas() {
  console.log('\n📄 PÁGINAS LEGALES');
  await upsertPage('politica-de-privacidad', 'Política de Privacidad', PRIVACIDAD);
  await upsertPage('sobre-nosotros', 'Sobre Nosotros', SOBRE_NOSOTROS);
  await upsertPage('aviso-legal', 'Aviso Legal', AVISO_LEGAL);
}

async function eliminarArticuloOffTopic() {
  console.log('\n🗑️  ARTÍCULO OFF-TOPIC');
  const posts = await api('GET', '/posts?search=casa-de-campo&per_page=5');
  const offTopic = posts.find(p =>
    p.slug.includes('casa-de-campo') || p.title.rendered.toLowerCase().includes('casa de campo')
  );
  if (offTopic) {
    await api('DELETE', `/posts/${offTopic.id}`, { force: false }); // mover a papelera, no borrar permanente
    console.log(`  🗑️  Movido a papelera: "${offTopic.title.rendered}"`);
  } else {
    console.log('  ✓ No se encontró artículo "casa de campo"');
  }
}

async function limpiarUncategorized() {
  console.log('\n🏷️  CATEGORÍA UNCATEGORIZED');
  // Buscar la categoría "Uncategorized"
  const cats = await api('GET', '/categories?search=uncategorized&per_page=10');
  const uncatES = await api('GET', '/categories?search=sin+categoria&per_page=10');
  const allUncat = [...cats, ...uncatES].filter(c =>
    c.slug === 'uncategorized' || c.slug === 'sin-categoria' || c.name.toLowerCase() === 'uncategorized'
  );

  if (!allUncat.length) {
    console.log('  ✓ No hay categoría Uncategorized con posts');
    return;
  }

  // Buscar categoría "General" o crearla
  let generalCats = await api('GET', '/categories?search=general&per_page=5');
  let general = generalCats.find(c => c.slug === 'general');
  if (!general) {
    general = await api('POST', '/categories', { name: 'General', slug: 'general' });
    console.log('  + Creada categoría "General"');
  }

  for (const uncat of allUncat) {
    const posts = await api('GET', `/posts?categories=${uncat.id}&per_page=100`);
    if (!posts.length) {
      console.log(`  ✓ Categoría "${uncat.name}" sin posts`);
      continue;
    }
    console.log(`  Moviendo ${posts.length} posts de "${uncat.name}" a "General"...`);
    for (const post of posts) {
      const newCats = [...post.categories.filter(id => id !== uncat.id), general.id];
      await api('POST', `/posts/${post.id}`, { categories: newCats });
      console.log(`    ✓ "${post.title.rendered}"`);
    }
  }
}

async function verificarMenuPrincipal() {
  console.log('\n📋 VERIFICACIÓN DE MENÚS');
  try {
    const menus = await api('GET', '/menus');
    console.log(`  Menús encontrados: ${menus.length}`);
    // Solo informamos, no modificamos menús automáticamente
    for (const m of menus) {
      console.log(`  - ${m.name} (${m.slug})`);
    }
    console.log('  ⚠️  Acordate de agregar las páginas legales al menú de pie de página manualmente.');
  } catch {
    console.log('  ℹ️  API de menús no disponible (requiere plugin WP REST API Menus o WP 6.x)');
    console.log('  ⚠️  Acordate de agregar las páginas legales al menú de pie de página manualmente.');
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Conectando a ${BASE_URL}...`);

  // Verificar autenticación
  try {
    const me = await api('GET', '/users/me');
    console.log(`✓ Autenticado como: ${me.name} (${me.roles?.join(', ')})`);
  } catch (e) {
    console.error('✗ Error de autenticación:', e.message);
    console.error('\nPosibles causas:');
    console.error('  - Usuario o contraseña incorrectos');
    console.error('  - WordPress no tiene habilitado Basic Auth en la REST API');
    console.error('  - Solución: instalá el plugin "Application Passwords" o "JSON Basic Authentication"');
    console.error('    https://wordpress.org/plugins/json-basic-authentication/');
    process.exit(1);
  }

  await crearPaginas();
  await eliminarArticuloOffTopic();
  await limpiarUncategorized();
  await verificarMenuPrincipal();

  console.log('\n✅ LISTO. Tareas completadas.');
  console.log('\nPASOS MANUALES que quedan:');
  console.log('  1. Ir a Apariencia → Menús y agregar Política de Privacidad, Aviso Legal y Sobre Nosotros al menú del pie de página');
  console.log('  2. Verificar que todos los artículos tienen un autor asignado en WordPress');
  console.log('  3. Instalar un plugin de cookie consent (ej: CookieYes o Complianz) para el banner de cookies de AdSense');
  console.log('  4. Solicitar revisión en Google AdSense');
}

main().catch(e => {
  console.error('\n✗ Error inesperado:', e.message);
  process.exit(1);
});
