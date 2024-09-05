import os
import time
import pandas as pd
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

def setup_driver():
    options = webdriver.ChromeOptions()
    # Desactiva el modo headless para ver el navegador en acción
    options.add_argument('--headless')
    options.add_argument('--disable-gpu')
    return webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)

def get_channel_name(url):
    return url.split('@')[-1].split('/')[0]

def get_video_urls(driver, channel_url, limit=10):
    driver.get(channel_url)
    time.sleep(6)  # Aumenta el tiempo de espera para que la página cargue completamente

    video_urls = []
    container = driver.find_element(By.ID, "contents")
    video_elements = container.find_elements(By.CSS_SELECTOR, ".style-scope ytd-rich-item-renderer")[:limit]

    if not video_elements:
        print("No se encontraron videos con los selectores actuales.")
        return []

    print(f"Found {len(video_elements)} videos.")  # Mensaje de depuración

    for video in video_elements:
        try:
            # Navega a través de los hijos para encontrar el enlace
            link_element = video.find_element(By.XPATH, ".//a[@id='thumbnail']")
            url = link_element.get_attribute("href")
            video_urls.append(url)
            print(f"Found video URL: {url}")  # Mensaje de depuración
        except Exception as e:
            print(f"Error extracting URL for a video: {e}")

    return video_urls

def get_video_data(driver, video_url):
    driver.get(video_url,)
    time.sleep(10)  # Aumenta el tiempo de espera para que la página cargue completamente

    try:
        
        bloque = driver.find_element(By.CSS_SELECTOR, "#above-the-fold")
        desplegable = bloque.find_element(By.CSS_SELECTOR, "#bottom-row")

        #desplegable2 = desplegable.find_element(By.CSS_SELECTOR, "tp-yt-paper-button.button style-scope ytd-text-inline-expander")
        print(desplegable,"/////////////////////////")
        desplegable.click()

        bloque_views = bloque.find_element(By.CSS_SELECTOR, "#info")
        
        title = bloque.find_element(By.XPATH, ".//h1[contains(@class, 'style-scope ytd-watch-metadata')]").text
        views = bloque_views.find_element(By.XPATH, ".//span[contains(text(), 'vistas')]").text.split()[0]
        #upload_date = driver.find_element(By.CSS_SELECTOR, ".style-scope yt-formatted-string bold").text
        #duration = driver.find_element(By.CSS_SELECTOR, ".ytp-time-duration").text.strip()

        #likes = driver.find_element(By.CSS_SELECTOR, ".yt-spec-button-shape-next__button-text-content").text()
        #description = driver.find_element(By.CSS_SELECTOR, ".style-scope ytd-text-inline-expander").text
        #comments = driver.find_element(By.CSS_SELECTOR, ".style-scope yt-formatted-string").text

        #subtitles_info = get_transcription(driver, title)

        video_data = {
            "Título": title,
            "URL": video_url,
            "Vistas": views,
            #"Fecha de publicación": upload_date,
            #"Duración": duration,
            #"Likes": likes,
            #"Descripción": description,
            #"Comentarios": comments,
            #"Subtítulos en español": subtitles_info
        }

        print(f"Data extracted for video: {title}")  # Mensaje de depuración
        return video_data

    except Exception as e:
        print(f"Error extracting data for video: {e}")  # Mensaje de error
        return None

#def get_transcription(driver, video_title):
    #return "Subtítulos disponibles"  # Implementa la lógica para extraer transcripciones aquí

def main():
    channel_url = "https://www.youtube.com/@TipitoLIVE/videos"
    driver = setup_driver()

    channel_name = get_channel_name(channel_url)

    video_urls = get_video_urls(driver, channel_url, limit=1)

    videos_data = []
    for url in video_urls:
        video_data = get_video_data(driver, url)
        if video_data:
            videos_data.append(video_data)

    base_directory = channel_name
    videos_directory = os.path.join(base_directory, 'videos')

    if not os.path.exists(base_directory):
        os.makedirs(base_directory)
    
    if not os.path.exists(videos_directory):
        os.makedirs(videos_directory)

    file_path = os.path.join(videos_directory, f"{channel_name}_videos_data.xlsx")
    if videos_data:  # Solo guarda el archivo si hay datos
        df = pd.DataFrame(videos_data)
        print(f"Saving data to {file_path}")  # Mensaje de depuración
        df.to_excel(file_path, index=False)
    else:
        print("No se encontraron datos para guardar.")

    driver.quit()

if __name__ == "__main__":
    main()
