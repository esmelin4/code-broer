/**
 * images.js — Busca imágenes sin derechos de autor en Pexels.
 * API gratuita: pexels.com/api (registrarse y obtener API key)
 */

const PEXELS_KEY = process.env.PEXELS_API_KEY;

// Términos de búsqueda en inglés para mejores resultados en Pexels
const TRANSLATE_TERMS = {
  'keto':           'keto food',
  'ayuno':          'fasting health',
  'cetogénica':     'ketogenic diet',
  'receta':         'healthy recipe food',
  'ensalada':       'salad healthy',
  'proteína':       'protein food',
  'verdura':        'vegetables fresh',
  'fruta':          'fresh fruits',
  'desayuno':       'healthy breakfast',
  'almuerzo':       'healthy lunch',
  'cena':           'dinner healthy',
  'smoothie':       'smoothie healthy',
  'batido':         'smoothie drink',
  'bienestar':      'wellness health',
  'salud':          'healthy lifestyle',
  'dieta':          'diet healthy food',
  'carbohidratos':  'low carb food',
  'adelgazar':      'weight loss healthy',
  'nutrición':      'nutrition food',
};

function translateQuery(query) {
  const lower = query.toLowerCase();
  for (const [es, en] of Object.entries(TRANSLATE_TERMS)) {
    if (lower.includes(es)) return en;
  }
  return `healthy food ${query}`;
}

export async function fetchImage(keyword) {
  if (!PEXELS_KEY) {
    console.log('  [images] ⚠️  PEXELS_API_KEY no configurada');
    return null;
  }

  const query = translateQuery(keyword);

  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape`,
      { headers: { Authorization: PEXELS_KEY } }
    );
    const data = await res.json();
    if (!data.photos?.length) return null;

    // Elegir foto aleatoria entre los primeros 15 resultados
    const photo = data.photos[Math.floor(Math.random() * data.photos.length)];
    return {
      url:          photo.src.large2x,
      urlMedium:    photo.src.large,
      photographer: photo.photographer,
      pexelsUrl:    photo.url,
      altText:      `${keyword} - foto de ${photo.photographer}`,
    };
  } catch (e) {
    console.log(`  [images] Error: ${e.message}`);
    return null;
  }
}

/**
 * Sube la imagen a WordPress y devuelve el media ID.
 */
export async function uploadImageToWP(image, title) {
  const BASE_URL = process.env.WP_URL.replace(/\/$/, '');
  const AUTH     = Buffer.from(`${process.env.WP_USER}:${process.env.WP_PASS}`).toString('base64');

  try {
    // Descargar la imagen
    const imgRes  = await fetch(image.urlMedium);
    const buffer  = await imgRes.arrayBuffer();
    const ext     = 'jpg';
    const filename = `${title.slice(0, 40).replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.${ext}`;

    // Subir a WordPress Media Library
    const uploadRes = await fetch(`${BASE_URL}/wp-json/wp/v2/media`, {
      method:  'POST',
      headers: {
        'Authorization':       `Basic ${AUTH}`,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type':        'image/jpeg',
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      console.log(`  [images] Error subiendo imagen: ${err.slice(0, 100)}`);
      return null;
    }

    const media = await uploadRes.json();
    // Agregar crédito al pie de la imagen
    await fetch(`${BASE_URL}/wp-json/wp/v2/media/${media.id}`, {
      method:  'POST',
      headers: { 'Authorization': `Basic ${AUTH}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        caption:    `Foto de <a href="${image.pexelsUrl}" target="_blank">${image.photographer}</a> en Pexels`,
        alt_text:   image.altText,
      }),
    });

    console.log(`  [images] ✓ Imagen subida (id ${media.id})`);
    return media.id;
  } catch (e) {
    console.log(`  [images] Error: ${e.message}`);
    return null;
  }
}
