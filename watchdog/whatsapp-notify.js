#!/usr/bin/env node
/**
 * watchdog/whatsapp-notify.js
 * Vigila el "heartbeat" de otro script (el que imprime "Última ejecución")
 * y te escribe por WhatsApp, desde OTRO número, si no se actualiza durante
 * varias horas.
 *
 * Cómo funciona:
 *   1. El script que querés vigilar tiene que escribir la fecha/hora actual
 *      en un archivo de texto cada vez que completa un ciclo. Si es Python,
 *      agregale esto justo donde imprime "Última ejecución":
 *
 *          from datetime import datetime
 *          with open("last_run.txt", "w", encoding="utf-8") as f:
 *              f.write(datetime.now().isoformat())
 *
 *      (usá la misma ruta en HEARTBEAT_FILE de abajo)
 *
 *   2. Este script revisa ese archivo cada CHECK_INTERVAL_MIN minutos. Si
 *      pasaron más de THRESHOLD_HOURS desde la última actualización, te
 *      manda un WhatsApp al número WHATSAPP_TO. No vuelve a avisar por el
 *      mismo bloqueo hasta que el archivo se actualice de nuevo.
 *
 * Configuración (watchdog/.env):
 *   HEARTBEAT_FILE        Ruta al archivo de heartbeat (default: last_run.txt)
 *   THRESHOLD_HOURS       Horas sin cambios para disparar la alerta (default: 5)
 *   CHECK_INTERVAL_MIN    Cada cuántos minutos revisa (default: 10)
 *   WHATSAPP_TO           Tu número CON código de país, SIN "+" ni espacios
 *                         (ej: 18095551234) — es a quien le llega el aviso.
 *
 * Primer uso (una sola vez):
 *   1. npm install
 *   2. node watchdog/whatsapp-notify.js
 *   3. Va a aparecer un código QR en la consola. Escaneálo con el WhatsApp
 *      DEL OTRO NÚMERO (el que va a mandar el aviso), desde:
 *      WhatsApp > Configuración > Dispositivos vinculados > Vincular dispositivo.
 *   4. Una vez vinculado, la sesión queda guardada en watchdog/.wwebjs_auth/
 *      y no hace falta escanear el QR de nuevo (salvo que desvincules el
 *      dispositivo o pasen ~14 días sin usarlo).
 *
 * Cómo correrlo en Windows:
 *   node watchdog\\whatsapp-notify.js
 *   Dejalo corriendo en otra ventana de cmd, junto a la del script que vigila.
 */

import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '.env') });

const HEARTBEAT_FILE = process.env.HEARTBEAT_FILE || 'last_run.txt';
const THRESHOLD_HOURS = Number(process.env.THRESHOLD_HOURS || 5);
const CHECK_INTERVAL_MIN = Number(process.env.CHECK_INTERVAL_MIN || 10);
const WHATSAPP_TO = (process.env.WHATSAPP_TO || '').replace(/\D/g, '');

function log(msg) {
  const ts = new Date().toLocaleTimeString('es-ES', { hour12: false });
  console.log(`${ts}  WATCHDOG  ${msg}`);
}

function readLastHeartbeat() {
  if (!fs.existsSync(HEARTBEAT_FILE)) return null;
  try {
    const content = fs.readFileSync(HEARTBEAT_FILE, 'utf8').trim();
    const date = new Date(content);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

let alreadyAlertedFor = null;

async function checkHeartbeat(client) {
  const last = readLastHeartbeat();

  if (!last) {
    log(`⚠️  Todavía no se pudo leer '${HEARTBEAT_FILE}'.`);
    return;
  }

  const elapsedHours = (Date.now() - last.getTime()) / 3_600_000;

  if (elapsedHours > THRESHOLD_HOURS) {
    if (!alreadyAlertedFor || alreadyAlertedFor.getTime() !== last.getTime()) {
      log(`🚨 Sin cambios desde ${last.toLocaleString('es-ES')} (hace ${elapsedHours.toFixed(1)}h). Enviando alerta...`);
      const msg =
        `🚨 Alerta: el script no se actualiza desde ${last.toLocaleString('es-ES')} ` +
        `(hace más de ${THRESHOLD_HOURS}h).\n` +
        `Correo muy rápido y actualiza manual el VPS.`;
      try {
        await client.sendMessage(`${WHATSAPP_TO}@c.us`, msg);
        log('✅ Alerta enviada por WhatsApp.');
        alreadyAlertedFor = last;
      } catch (err) {
        log(`✗ No se pudo enviar el WhatsApp: ${err.message}`);
      }
    } else {
      log(`Ya se avisó por este bloqueo (desde ${last.toLocaleString('es-ES')}). Esperando que se reanude.`);
    }
  } else {
    log(`OK, última actualización hace ${elapsedHours.toFixed(2)}h.`);
    alreadyAlertedFor = null;
  }
}

async function main() {
  if (!WHATSAPP_TO) {
    console.error("✗ Falta WHATSAPP_TO en watchdog/.env (tu número con código de país, solo dígitos, ej: 18095551234).");
    process.exit(1);
  }

  log('🐶 Iniciando cliente de WhatsApp Web...');

  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: { headless: true },
  });

  client.on('qr', (qr) => {
    log('📱 Escaneá este código con el WhatsApp DESDE EL QUE querés que te escriba:');
    log('   (WhatsApp > Configuración > Dispositivos vinculados > Vincular dispositivo)');
    qrcode.generate(qr, { small: true });
  });

  client.on('authenticated', () => log('🔐 Sesión autenticada y guardada.'));
  client.on('auth_failure', (msg) => log(`✗ Falló la autenticación: ${msg}`));
  client.on('disconnected', (reason) => log(`⚠️  WhatsApp desconectado: ${reason}`));

  client.on('ready', () => {
    log(`✅ Cliente listo. Vigilando '${HEARTBEAT_FILE}' cada ${CHECK_INTERVAL_MIN} min.`);
    log(`Umbral de alerta: ${THRESHOLD_HOURS} horas sin cambios. Avisa a: ${WHATSAPP_TO}`);
    checkHeartbeat(client);
    setInterval(() => checkHeartbeat(client), CHECK_INTERVAL_MIN * 60 * 1000);
  });

  await client.initialize();
}

main();
