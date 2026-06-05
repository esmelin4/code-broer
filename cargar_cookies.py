import json
import time
import requests
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service

COOKIES_FILE = "cookies.txt"
URL = "https://secretodesaludybienestar.com/"
ADSPOWER_ID = "k15ppck1"
ADSPOWER_API = "http://local.adspower.net:50325"

def abrir_adspower(perfil_id):
    resp = requests.get(f"{ADSPOWER_API}/api/v1/browser/start", params={"user_id": perfil_id})
    data = resp.json()
    if data.get("code") != 0:
        raise Exception(f"Error al abrir AdsPower: {data.get('msg')}")
    ws = data["data"]["ws"]["selenium"]
    driver_path = data["data"]["webdriver"]
    return ws, driver_path

def cerrar_adspower(perfil_id):
    requests.get(f"{ADSPOWER_API}/api/v1/browser/stop", params={"user_id": perfil_id})

def cargar_cookies(driver, archivo):
    with open(archivo, "r", encoding="utf-8") as f:
        cookies = json.load(f)

    for cookie in cookies:
        for campo in ["sameSite", "storeId", "id", "hostOnly", "session"]:
            cookie.pop(campo, None)

        if "domain" in cookie and cookie["domain"].startswith("."):
            cookie["domain"] = cookie["domain"][1:]

        try:
            driver.add_cookie(cookie)
        except Exception as e:
            print(f"Cookie ignorada ({cookie.get('name', '?')}): {e}")

def main():
    print(f"Abriendo perfil AdsPower: {ADSPOWER_ID}...")
    ws_url, driver_path = abrir_adspower(ADSPOWER_ID)
    time.sleep(2)

    options = Options()
    options.add_experimental_option("debuggerAddress", ws_url)

    service = Service(executable_path=driver_path)
    driver = webdriver.Chrome(service=service, options=options)

    # Cambiar al ultimo handle activo (evita "window already closed")
    handles = driver.window_handles
    if handles:
        driver.switch_to.window(handles[-1])
    time.sleep(1)

    # Primero visitar el dominio para que las cookies sean validas
    driver.get(URL)
    time.sleep(2)

    cargar_cookies(driver, COOKIES_FILE)

    # Recargar la pagina con las cookies activas — con manejo de ventana cerrada
    try:
        handles = driver.window_handles
        if handles:
            driver.switch_to.window(handles[-1])
        driver.refresh()
    except Exception as e:
        print(f"Aviso al recargar: {e}")
        driver.get(URL)
    time.sleep(3)

    print("Cookies cargadas. Navegador AdsPower abierto.")
    input("Presiona Enter para cerrar el navegador...")

    driver.quit()
    cerrar_adspower(ADSPOWER_ID)

if __name__ == "__main__":
    main()
