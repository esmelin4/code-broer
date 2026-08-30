import threading
import time
import numpy as np
import sounddevice as sd
import pyautogui
import cv2
import os

TEMPLATE_PATH = "call_timer.png"  # guarda la imagen del cronometro con este nombre

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
    answered   = threading.Event()
    audio_seen = threading.Event()

    # ── Hilo de detección visual ────────────────────────────────
    def watch_screen():
        if not os.path.exists(TEMPLATE_PATH):
            log(f"[CALL] ⚠ No se encontró {TEMPLATE_PATH}, detección visual desactivada.")
            return
        log("[CALL] Detección visual activa...")
        while not answered.is_set():
            try:
                found = pyautogui.locateOnScreen(TEMPLATE_PATH, confidence=0.7, grayscale=True)
                if found is not None:
                    log(f"[CALL] 🖥 Cronómetro detectado en pantalla -> CONTESTADA")
                    answered.set()
                    return
            except Exception as e:
                log(f"[CALL] Error detección visual: {e}")
            time.sleep(0.5)

    screen_thread = threading.Thread(target=watch_screen, daemon=True)
    screen_thread.start()
    # ────────────────────────────────────────────────────────────

    def cb(indata, frames, t, status):
        rms = float(np.sqrt(np.mean(indata ** 2)))
        now = time.monotonic()
        if answered.is_set():
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
                    log(f"[CALL] Audio continuo {dur:.2f}s (ring max {st['max_ring_len']:.2f}s) -> CONTESTADA")
                    answered.set()
        else:
            if st["in_ring"]:
                st["in_ring"] = False
                dur = st["last_loud"] - st["ring_on"]
                st["max_ring_len"] = max(st["max_ring_len"], dur)

            if st["rings"] >= 2 and st["last_loud"] is not None and st["max_gap"] > 0:
                sil = now - st["last_loud"]
                if sil > st["max_gap"] + MARGEN:
                    log(f"[CALL] Silencio {sil:.2f}s (hueco max {st['max_gap']:.2f}s) -> CONTESTADA")
                    answered.set()

    log(f"[CALL] Marcando... (max {max_wait}s)")
    try:
        with sd.InputStream(samplerate=SR, channels=1, device=dev,
                            callback=cb, blocksize=int(SR * 0.05)):
            audio_seen.wait(timeout=10)
            if not audio_seen.is_set():
                log(f"[CALL] ⚠ Sin audio en CABLE Output. Espera fija ({max_wait}s).")
                time.sleep(max_wait)
                return True
            log("[CALL] Ring detectado — aprendiendo patrón...")
            answered.wait(timeout=max_wait)
    except Exception as e:
        log(f"[CALL] Error ({e}). Espera fija.")
        time.sleep(max_wait)
        return True

    if answered.is_set():
        log("[CALL] ✓ Llamada contestada")
        time.sleep(0.3)
        return True
    log("[CALL] Sin respuesta (timeout)")
    return False
