# setup-wordpress.ps1
# Uso: .\setup-wordpress.ps1
# Requiere PowerShell 5+ (viene con Windows 10/11)

$WP_URL  = "https://secretodesaludybienestar.com"
$WP_USER = "manager"
$WP_PASS = "Quirino1004"

# ── Auth ──────────────────────────────────────────────────────────────────────
$bytes  = [System.Text.Encoding]::UTF8.GetBytes("${WP_USER}:${WP_PASS}")
$AUTH   = [Convert]::ToBase64String($bytes)
$HEADERS = @{
    "Authorization" = "Basic $AUTH"
    "Content-Type"  = "application/json"
}

function WP-API($method, $endpoint, $body = $null) {
    $url = "$WP_URL/wp-json/wp/v2$endpoint"
    $params = @{ Uri = $url; Method = $method; Headers = $HEADERS; UseBasicParsing = $true }
    if ($body) { $params.Body = ($body | ConvertTo-Json -Depth 10) }
    try {
        $resp = Invoke-RestMethod @params
        return $resp
    } catch {
        $msg = $_.Exception.Response
        throw "Error $method $endpoint : $_"
    }
}

function Find-Page($slug) {
    $pages = WP-API "GET" "/pages?slug=$slug&status=any"
    if ($pages -and $pages.Count -gt 0) { return $pages[0] }
    return $null
}

function Upsert-Page($slug, $title, $content) {
    $existing = Find-Page $slug
    $data = @{ title = $title; content = $content; status = "publish"; slug = $slug }
    if ($existing) {
        Write-Host "  Actualizando '$title' (id $($existing.id))"
        WP-API "POST" "/pages/$($existing.id)" $data | Out-Null
    } else {
        Write-Host "  Creando '$title'"
        WP-API "POST" "/pages" $data | Out-Null
    }
}

# ── Contenido de las páginas ──────────────────────────────────────────────────
$fecha = (Get-Date).ToString("d 'de' MMMM 'de' yyyy", [System.Globalization.CultureInfo]::GetCultureInfo("es-ES"))

$PRIVACIDAD = @"
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
<p>Google utiliza cookies publicitarias para servir anuncios a los visitantes. Los usuarios pueden <a href="https://www.google.com/settings/ads" target="_blank" rel="noopener">inhabilitar el uso de la cookie de DoubleClick</a> para la publicidad basada en intereses.</p>
<p>Para más información, consulta la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener">Política de Privacidad de Google</a>.</p>

<h2>5. Cookies de terceros</h2>
<p>Este sitio puede utilizar cookies de terceros con fines estadísticos y publicitarios. Puedes configurar tu navegador para bloquear o alertarte sobre estas cookies.</p>

<h2>6. Base legal del tratamiento</h2>
<p>El tratamiento de tus datos se basa en tu consentimiento al navegar por este sitio y aceptar el uso de cookies, y en el interés legítimo del responsable para mejorar el servicio.</p>

<h2>7. Derechos del usuario</h2>
<p>Puedes ejercer tus derechos de acceso, rectificación, supresión, oposición, portabilidad y limitación del tratamiento contactando a través de nuestra página de <a href="/contacto/">Contacto</a>.</p>

<h2>8. Conservación de datos</h2>
<p>Los datos personales facilitados voluntariamente se conservarán mientras sean necesarios para la finalidad para la que fueron recabados o hasta que el usuario solicite su supresión.</p>

<h2>9. Cambios en esta política</h2>
<p>Nos reservamos el derecho de actualizar esta política de privacidad. Te recomendamos revisarla periódicamente.</p>

<p><em>Última actualización: $fecha</em></p>
"@

$SOBRE_NOSOTROS = @"
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
"@

$AVISO_LEGAL = @"
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
<p>El titular no garantiza la exactitud, integridad o actualidad de los contenidos publicados. La información de este sitio tiene carácter divulgativo y no constituye asesoramiento médico, nutricional ni profesional de ningún tipo.</p>

<h2>5. Enlaces externos</h2>
<p>Este sitio puede contener enlaces a páginas de terceros. El titular no se hace responsable del contenido de dichos sitios externos ni de los posibles daños derivados de su uso.</p>

<h2>6. Publicidad</h2>
<p>Este sitio web muestra anuncios publicitarios a través de <strong>Google AdSense</strong>, gestionados por Google LLC y sujetos a sus propias políticas y términos de uso.</p>

<h2>7. Legislación aplicable</h2>
<p>Las presentes condiciones se rigen por la legislación española. Para cualquier controversia derivada del uso de este sitio, las partes se someten a los juzgados y tribunales del domicilio del usuario.</p>

<p><em>Última actualización: $fecha</em></p>
"@

# ── Main ──────────────────────────────────────────────────────────────────────
Write-Host "`n🚀 Conectando a $WP_URL..."

# Verificar autenticación
try {
    $me = WP-API "GET" "/users/me"
    Write-Host "✓ Autenticado como: $($me.name)"
} catch {
    Write-Host "✗ Error de autenticación: $_"
    Write-Host ""
    Write-Host "Si el error persiste, instalá el plugin 'JSON Basic Authentication' en WordPress:"
    Write-Host "  https://wordpress.org/plugins/json-basic-authentication/"
    exit 1
}

# 1. Páginas legales
Write-Host "`n📄 PÁGINAS LEGALES"
Upsert-Page "politica-de-privacidad" "Política de Privacidad" $PRIVACIDAD
Upsert-Page "sobre-nosotros"         "Sobre Nosotros"         $SOBRE_NOSOTROS
Upsert-Page "aviso-legal"            "Aviso Legal"            $AVISO_LEGAL

# 2. Artículo off-topic "casa de campo"
Write-Host "`n🗑️  ARTÍCULO OFF-TOPIC"
$posts = WP-API "GET" "/posts?search=casa+de+campo&per_page=5"
$offTopic = $posts | Where-Object { $_.slug -like "*casa-de-campo*" -or $_.title.rendered -like "*casa de campo*" }
if ($offTopic) {
    foreach ($p in $offTopic) {
        WP-API "DELETE" "/posts/$($p.id)" @{} | Out-Null
        Write-Host "  Movido a papelera: '$($p.title.rendered)'"
    }
} else {
    Write-Host "  ✓ No se encontró artículo 'casa de campo'"
}

# 3. Limpiar Uncategorized
Write-Host "`n🏷️  CATEGORÍA UNCATEGORIZED"
$allCats = WP-API "GET" "/categories?per_page=100"
$uncat = $allCats | Where-Object { $_.slug -eq "uncategorized" -or $_.slug -eq "sin-categoria" }

if ($uncat) {
    $generalCat = $allCats | Where-Object { $_.slug -eq "general" }
    if (-not $generalCat) {
        $generalCat = WP-API "POST" "/categories" @{ name = "General"; slug = "general" }
        Write-Host "  + Creada categoría 'General'"
    }
    foreach ($cat in $uncat) {
        $uncatPosts = WP-API "GET" "/posts?categories=$($cat.id)&per_page=100"
        if ($uncatPosts.Count -eq 0) {
            Write-Host "  ✓ '$($cat.name)' sin posts"
            continue
        }
        Write-Host "  Moviendo $($uncatPosts.Count) posts de '$($cat.name)' a 'General'..."
        foreach ($post in $uncatPosts) {
            $newCats = @($post.categories | Where-Object { $_ -ne $cat.id }) + $generalCat.id
            WP-API "POST" "/posts/$($post.id)" @{ categories = $newCats } | Out-Null
            Write-Host "    ✓ $($post.title.rendered)"
        }
    }
} else {
    Write-Host "  ✓ No hay categoría Uncategorized"
}

Write-Host "`n✅ LISTO."
Write-Host ""
Write-Host "PASOS MANUALES que quedan:"
Write-Host "  1. WordPress admin → Apariencia → Menús → agregar las 3 páginas al menú del pie de página"
Write-Host "  2. Instalar plugin de cookies: CookieYes (gratis) desde Plugins → Añadir nuevo"
Write-Host "  3. Solicitar revisión en Google AdSense"
