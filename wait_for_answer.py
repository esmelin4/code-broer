import threading
import time
import numpy as np
import sounddevice as sd
import os

TEMPLATE_MUTE    = "mute.png"       # microfono+MUTE  -> marcando activo
TEMPLATE_TIMER   = "call_timer.png" # cronometro      -> llamada contestada
TEMPLATE_HANGUP  = "hangup.png"     # X colgar        -> llamada colgada

def _load_cv():
    import mss
    import cv2
    return mss, cv2

def _find(gray, template, threshold=0.7):
    import cv2
    if template is None:
        return False
    res = cv2.matchTemplate(gray, template, cv2.TM_CCOEFF_NORMED)
    _, max_val, _, _ = cv2.minMaxLoc(res)
    return max_val >= threshold

def wait_for_answer(max_wait=30):
    dev = get_device_index(AUDIO_CFG["capture_device"], kind="input")
    if dev is None:
        log(f"[CALL] Marcando... esperando {max_wait}s fijos.")
        time.sleep(max_wait)
        return True

    RING_THRESH = 0.04
    MARGEN      = 0.5

    st = {
        "in_ring":      False,
        "rings":        0,
        "ring_on":      None,
        "last_loud":    None,
        "max_gap":      0.0,
        "max_ring_len": 0.0,
    }
    answered   = threading.Event()  # True  -> contestada
    hung_up    = threading.Event()  # True  -> colgada
    audio_seen = threading.Event()

    # ── Hilo de detección visual ────────────────────────────────
    def watch_screen():
        try:
            mss, cv2 = _load_cv()
        except ImportError as e:
            log(f"[CALL] ⚠ Detección visual desactivada: {e}. pip install mss opencv-python")
            return

        def load_tpl(path):
            if not os.path.exists(path):
                log(f"[CALL] ⚠ Imagen no encontrada: {path}")
                return None
            img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
            if img is None:
                log(f"[CALL] ⚠ No se pudo leer: {path}")
            return img

        tpl_mute   = load_tpl(TEMPLATE_MUTE)
        tpl_timer  = load_tpl(TEMPLATE_TIMER)
        tpl_hangup = load_tpl(TEMPLATE_HANGUP)

        log("[CALL] Detección visual activa (mss+opencv)...")

        # 1) Esperar a que aparezca el boton MUTE (confirmacion de que marco)
        if tpl_mute is not None:
            log("[CALL] Esperando icono MUTE para confirmar marcado...")
            with mss.mss() as sct:
                monitor = sct.monitors[1]
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    try:
                        img  = np.array(sct.grab(monitor))
                        gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
                        if _find(gray, tpl_mute):
                            log("[CALL] 🎙 MUTE detectado -> llamada iniciada")
                            break
                    except Exception as e:
                        log(f"[CALL] Error visual (mute): {e}")
                    time.sleep(0.4)
                else:
                    log("[CALL] ⚠ MUTE no apareció en 15s -> llamada no iniciada")
                    hung_up.set()
                    return

        # 2) Monitorear cronometro (contestada) y X (colgada)
        with mss.mss() as sct:
            monitor = sct.monitors[1]
            while not answered.is_set() and not hung_up.is_set():
                try:
                    img  = np.array(sct.grab(monitor))
                    gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)

                    if tpl_timer is not None and _find(gray, tpl_timer):
                        log("[CALL] 🖥 Cronómetro detectado -> CONTESTADA")
                        answered.set()
                        return

                    if tpl_hangup is not None and _find(gray, tpl_hangup):
                        log("[CALL] 🖥 Botón X detectado -> COLGADA")
                        hung_up.set()
                        return

                except Exception as e:
                    log(f"[CALL] Error visual: {e}")
                time.sleep(0.4)

    screen_thread = threading.Thread(target=watch_screen, daemon=True)
    screen_thread.start()
    # ────────────────────────────────────────────────────────────

    def cb(indata, frames, t, status):
        rms = float(np.sqrt(np.mean(indata ** 2)))
        now = time.monotonic()
        if answered.is_set() or hung_up.is_set():
            return
        if rms > 0.002:
            audio_seen.set()

        if rms > RING_THRESH:
            if not st["in_ring"]:
                st["in_ring"] = True
                st["ring_on"] = now
                st["rings"]  += 1
                if st["last_loud"] is not None:
                    gap = now - st["last_loud"]
                    st["max_gap"] = max(st["max_gap"], gap)
                    log(f"[CALL] Ring #{st['rings']} | silencio previo {gap:.2f}s")
            st["last_loud"] = now

            if st["rings"] >= 2 and st["max_ring_len"] > 0:
                dur = now - st["ring_on"]
                if dur > st["max_ring_len"] + MARGEN:
                    log(f"[CALL] Audio continuo {dur:.2f}s -> CONTESTADA (audio)")
                    answered.set()
        else:
            if st["in_ring"]:
                st["in_ring"] = False
                dur = st["last_loud"] - st["ring_on"]
                st["max_ring_len"] = max(st["max_ring_len"], dur)

            if st["rings"] >= 2 and st["last_loud"] is not None and st["max_gap"] > 0:
                sil = now - st["last_loud"]
                if sil > st["max_gap"] + MARGEN:
                    log(f"[CALL] Silencio {sil:.2f}s -> CONTESTADA (silencio)")
                    answered.set()

    log(f"[CALL] Marcando... (max {max_wait}s)")
    try:
        with sd.InputStream(samplerate=SR, channels=1, device=dev,
                            callback=cb, blocksize=int(SR * 0.05)):
            # Esperar audio o que la deteccion visual confirme colgado
            while not audio_seen.is_set() and not hung_up.is_set():
                if time.monotonic() - time.monotonic() > 10:
                    break
                time.sleep(0.1)

            if hung_up.is_set():
                log("[CALL] Llamada colgada antes de iniciar audio")
                return False

            if not audio_seen.is_set():
                log(f"[CALL] ⚠ Sin audio. Espera fija ({max_wait}s).")
                time.sleep(max_wait)
                return True

            log("[CALL] Ring detectado — aprendiendo patrón...")

            deadline = time.monotonic() + max_wait
            while time.monotonic() < deadline:
                if answered.is_set() or hung_up.is_set():
                    break
                time.sleep(0.1)

    except Exception as e:
        log(f"[CALL] Error ({e}). Espera fija.")
        time.sleep(max_wait)
        return True

    if answered.is_set():
        log("[CALL] ✓ Llamada contestada")
        time.sleep(0.3)
        return True

    if hung_up.is_set():
        log("[CALL] ✗ Llamada colgada sin respuesta")
        return False

    log("[CALL] Sin respuesta (timeout)")
    return False
