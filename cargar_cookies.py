import json
import time
from selenium import webdriver
from selenium.webdriver.chrome.options import Options

COOKIES_FILE = "cookies.txt"
URL = "https://secretodesaludybienestar.com/"

def cargar_cookies(driver, archivo):
    with open(archivo, "r", encoding="utf-8") as f:
        cookies = json.load(f)

    for cookie in cookies:
        # Selenium no acepta estos campos extras
        for campo in ["sameSite", "storeId", "id", "hostOnly", "session"]:
            cookie.pop(campo, None)

        # Corregir dominio si viene con punto inicial
        if "domain" in cookie and cookie["domain"].startswith("."):
            cookie["domain"] = cookie["domain"][1:]

        try:
            driver.add_cookie(cookie)
        except Exception as e:
            print(f"Cookie ignorada ({cookie.get('name', '?')}): {e}")

def main():
    options = Options()
    # Descomenta la siguiente linea para modo sin ventana (headless)
    # options.add_argument("--headless")
    options.add_argument("--start-maximized")

    driver = webdriver.Chrome(options=options)

    # Primero visitar el dominio para que las cookies sean validas
    driver.get(URL)
    time.sleep(2)

    cargar_cookies(driver, COOKIES_FILE)

    # Recargar la pagina con las cookies activas
    driver.refresh()
    time.sleep(3)

    print("Cookies cargadas. Navegador abierto.")
    input("Presiona Enter para cerrar el navegador...")
    driver.quit()

if __name__ == "__main__":
    main()
