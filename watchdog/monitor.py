#!/usr/bin/env python3
"""
watchdog/monitor.py
Vigila el "heartbeat" de otro script (por ejemplo el bot que corre en el cmd
de Windows) y avisa por correo (Gmail) si no se actualiza durante varias
horas. También puede avisar por WhatsApp (CallMeBot) si lo configurás.

Cómo funciona:
  1. El script que querés vigilar (el que imprime "Última ejecución") tiene
     que escribir la fecha/hora actual en un archivo de texto cada vez que
     completa un ciclo. Agregale estas 3 líneas justo donde imprime ese
     mensaje:

         from datetime import datetime
         with open("last_run.txt", "w", encoding="utf-8") as f:
             f.write(datetime.now().isoformat())

     (usá la misma ruta en HEARTBEAT_FILE de este script)

  2. Este script revisa ese archivo cada CHECK_INTERVAL_MIN minutos. Si
     pasaron más de THRESHOLD_HOURS desde la última actualización, manda un
     correo de alerta. No vuelve a avisar por el mismo bloqueo hasta que el
     archivo se actualice de nuevo.

Configuración (variables de entorno o archivo watchdog/.env):
  HEARTBEAT_FILE        Ruta al archivo de heartbeat (default: last_run.txt)
  THRESHOLD_HOURS       Horas sin cambios para disparar la alerta (default: 5)
  CHECK_INTERVAL_MIN    Cada cuántos minutos revisa (default: 10)
  EMAIL_FROM            Tu cuenta de Gmail que envía el aviso
  EMAIL_APP_PASSWORD    Contraseña de aplicación de esa cuenta (no tu contraseña normal)
  EMAIL_TO              A qué correo(s) avisar (separados por coma; puede ser el mismo EMAIL_FROM)
  CALLMEBOT_PHONE       (opcional) Tu número con código de país, ej: +18095551234
  CALLMEBOT_APIKEY      (opcional) Apikey que te da CallMeBot

Activar el correo (1 vez, gratis, funciona siempre):
  1. Entrá a https://myaccount.google.com/apppasswords con la cuenta de
     Gmail que va a enviar el aviso (necesitás tener verificación en 2 pasos
     activada; si no la tenés, activala primero en Seguridad).
  2. Creá una "contraseña de aplicación" (elegí "Otra" y ponele un nombre
     como "watchdog"). Te da un código de 16 letras: copialo tal cual, sin
     espacios, en EMAIL_APP_PASSWORD.
  3. Poné esa misma cuenta en EMAIL_FROM y a dónde querés que llegue el
     aviso en EMAIL_TO (puede ser tu mismo correo, o el de otra persona).

Activar CallMeBot (opcional, WhatsApp, a veces tarda o no responde):
  1. Agregá el contacto +34 644 51 91 87 a tu WhatsApp.
  2. Enviale el mensaje: "I allow callmebot to send me messages"
  3. Te responde con tu apikey. Ponela en CALLMEBOT_APIKEY.

Cómo correrlo en Windows:
  pip install python-dotenv      (opcional, para leer watchdog\\.env)
  python watchdog\\monitor.py

  Dejalo corriendo en otra ventana de cmd, junto a la del script que vigila.
"""

import os
import smtplib
import time
import urllib.request
import urllib.parse
from datetime import datetime, timedelta
from email.mime.text import MIMEText

try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except ImportError:
    pass

HEARTBEAT_FILE = os.getenv("HEARTBEAT_FILE", "last_run.txt")
THRESHOLD_HOURS = float(os.getenv("THRESHOLD_HOURS", "5"))
CHECK_INTERVAL_MIN = float(os.getenv("CHECK_INTERVAL_MIN", "10"))
EMAIL_FROM = os.getenv("EMAIL_FROM", "")
EMAIL_APP_PASSWORD = os.getenv("EMAIL_APP_PASSWORD", "")
EMAIL_TO = os.getenv("EMAIL_TO", "")
CALLMEBOT_PHONE = os.getenv("CALLMEBOT_PHONE", "")
CALLMEBOT_APIKEY = os.getenv("CALLMEBOT_APIKEY", "")


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"{ts}  WATCHDOG  {msg}", flush=True)


def read_last_heartbeat():
    if not os.path.exists(HEARTBEAT_FILE):
        return None
    try:
        with open(HEARTBEAT_FILE, "r", encoding="utf-8") as f:
            content = f.read().strip()
        return datetime.fromisoformat(content)
    except (ValueError, OSError):
        return None


def send_email(subject, message):
    if not EMAIL_FROM or not EMAIL_APP_PASSWORD or not EMAIL_TO:
        log("⚠️  Falta EMAIL_FROM, EMAIL_APP_PASSWORD o EMAIL_TO: no se puede avisar por correo.")
        return False
    recipients = [addr.strip() for addr in EMAIL_TO.split(",") if addr.strip()]
    mail = MIMEText(message, "plain", "utf-8")
    mail["Subject"] = subject
    mail["From"] = EMAIL_FROM
    mail["To"] = ", ".join(recipients)
    try:
        with smtplib.SMTP("smtp.gmail.com", 587, timeout=15) as server:
            server.starttls()
            server.login(EMAIL_FROM, EMAIL_APP_PASSWORD)
            server.sendmail(EMAIL_FROM, recipients, mail.as_string())
        log("✅ Alerta enviada por correo.")
        return True
    except Exception as err:
        log(f"✗ No se pudo enviar el correo: {err}")
        return False


def send_whatsapp(message):
    if not CALLMEBOT_PHONE or not CALLMEBOT_APIKEY:
        return False
    url = (
        "https://api.callmebot.com/whatsapp.php?"
        f"phone={urllib.parse.quote(CALLMEBOT_PHONE)}"
        f"&text={urllib.parse.quote(message)}"
        f"&apikey={urllib.parse.quote(CALLMEBOT_APIKEY)}"
    )
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            resp.read()
        log("✅ Alerta enviada por WhatsApp.")
        return True
    except Exception as err:
        log(f"✗ No se pudo enviar el WhatsApp: {err}")
        return False


def notify(subject, message):
    sent_email = send_email(subject, message)
    sent_whatsapp = send_whatsapp(message)
    return sent_email or sent_whatsapp


def main():
    log(f"🐶 Watchdog iniciado. Vigilando '{HEARTBEAT_FILE}' cada {CHECK_INTERVAL_MIN} min.")
    log(f"Umbral de alerta: {THRESHOLD_HOURS} horas sin cambios.")

    already_alerted_for = None  # timestamp del heartbeat por el que ya se avisó

    while True:
        last = read_last_heartbeat()

        if last is None:
            log(f"⚠️  Todavía no se pudo leer '{HEARTBEAT_FILE}'.")
        else:
            elapsed = datetime.now() - last
            if elapsed > timedelta(hours=THRESHOLD_HOURS):
                if already_alerted_for != last:
                    log(f"🚨 Sin cambios desde {last} (hace {elapsed}). Enviando alerta...")
                    msg = (
                        "🚨 Alerta: el script no se actualiza desde "
                        f"{last.strftime('%Y-%m-%d %H:%M:%S')} "
                        f"(hace más de {THRESHOLD_HOURS}h).\n"
                        "Correo muy rápido y actualiza manual el VPS."
                    )
                    if notify("🚨 Watchdog: script sin actividad", msg):
                        already_alerted_for = last
                else:
                    log(f"Ya se avisó por este bloqueo (desde {last}). Esperando que se reanude.")
            else:
                log(f"OK, última actualización hace {elapsed}.")
                already_alerted_for = None

        time.sleep(CHECK_INTERVAL_MIN * 60)


if __name__ == "__main__":
    main()
