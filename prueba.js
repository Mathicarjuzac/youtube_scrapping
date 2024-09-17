const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const excel = require('exceljs');

// Función de delay personalizada
function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

function sanitizeFileName(fileName) {
    return fileName.replace(/[<>:"/\\|?*]/g, ''); // Reemplaza caracteres no válidos
}

async function setupBrowser() {
    const browser = await puppeteer.launch({
        headless: false, // Cambia a true si quieres que no se muestre el navegador
        args: ['--disable-gpu']
    });
    return browser;
}

function getChannelName(url) {
    return url.split('@').pop().split('/')[0];
}

async function getVideoUrls(page, channelVideos, limit = 10) {
    await page.goto(channelVideos, { waitUntil: 'networkidle2' });

    const videoUrls = new Set();  // Usar un Set para evitar URLs duplicadas
    let videoElements = await page.$$('#contents .style-scope.ytd-rich-item-renderer');

    let previousHeight, attempts = 0;

    while (videoUrls.size < limit && attempts < 10) {
        previousHeight = await page.evaluate('document.body.scrollHeight');
        await page.evaluate('window.scrollBy(0, window.innerHeight)');
        await delay(2000); // Espera de 2 segundos entre scrolls

        videoElements = await page.$$('#contents .style-scope.ytd-rich-item-renderer');

        for (let i = 0; i < videoElements.length; i++) {
            try {
                const linkElement = await videoElements[i].$('a#thumbnail');
                const url = await linkElement.evaluate(el => el.href);
        
                // Evitar duplicados - Si la URL ya existe, salta a la siguiente iteración
                if ([...videoUrls].find(video => video.url === url)) {
                    continue;  // Evita procesar el video nuevamente si ya está en el set
                }
        
                // Extraer la duración del video
                const durationElement = await videoElements[i].$('ytd-thumbnail-overlay-time-status-renderer');
                let duration = durationElement
                    ? await durationElement.evaluate(el => el.innerText.trim())
                    : 'N/A';  // Duración no disponible
        
                // Limpiar la duración de posibles duplicados o saltos de línea
                duration = duration.split('\n')[0].trim();  // Elimina cualquier salto de línea y toma la primera línea
        
                videoUrls.add({ url, duration });  // Guardar tanto la URL como la duración
                if (videoUrls.size >= limit) break;
            } catch (e) {
                console.error(`Error extracting URL or duration: ${e}`);
            }
        }
        

        const currentHeight = await page.evaluate('document.body.scrollHeight');
        if (currentHeight === previousHeight) attempts++;
    }

    console.log(`Total video URLs found: ${videoUrls.size}`);
    return Array.from(videoUrls);  // Convertir el Set a Array antes de devolver
}


async function getVideoData(page, videoData) {
    const { url: videoUrl, duration: videoDuration } = videoData;

    await page.goto(videoUrl, { waitUntil: 'networkidle2' });

    try {
        await page.waitForSelector('#above-the-fold', { visible: true });
        await page.click('#bottom-row');  // Asegúrate de que el botón esté visible y habilitado

        const title = await page.$eval('h1.style-scope.ytd-watch-metadata', el => el.innerText);

        let views = await page.$eval('#info span', el => el.innerText);
        views = views.split(" ",1)[0].replace(",","");

        const upload_date = await page.$eval('#info span:nth-of-type(3)', el => el.innerText);

        let likes = await page.$eval(
            '#top-level-buttons-computed segmented-like-dislike-button-view-model yt-smartimation div div like-button-view-model toggle-button-view-model button-view-model  button', // Selecciona el botón por su clase
            el => el.getAttribute('aria-label')  // Extrae el valor del atributo aria-label
        );
        likes = likes.replace('Marcar este video con "Me gusta", al igual que otras ', '').replace(' personas.', '');
        
        await page.waitForSelector('#primary-button ytd-button-renderer yt-button-shape button', { timeout: 5000 });
        await page.evaluate(() => {
            const button = document.querySelector('#primary-button ytd-button-renderer yt-button-shape button');
            if (button) {
                button.click();
            } else {
                console.log("No se puede clickear");
            }
        });

        await page.waitForSelector('#segments-container', { timeout: 5000 });
        const transcripcion = await page.$eval('#segments-container', el => el.innerText);

        let commentsLoaded = false;
        while (!commentsLoaded) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            try {
                await page.waitForSelector('#count yt-formatted-string span:nth-child(1)', { timeout: 2000 });
                commentsLoaded = true;
            } catch (e) {
                console.log("Intentando cargar más contenido...");
            }
        }
        await page.waitForSelector('#count yt-formatted-string span:nth-child(1)');
        const comments = await page.$eval('#count yt-formatted-string span:nth-child(1)', el => el.innerText);

        const description = await page.$eval('#description-inline-expander yt-attributed-string span', el => el.innerText);

        const videoDataResult = {
            "Título": title,
            "URL": videoUrl,
            "Vistas": views,
            "Fecha de publicación": upload_date,
            "Duración": videoDuration,  // Guardar la duración aquí
            "Likes": likes,
            "Comentarios": comments,
            "Descripción": description,
            "Transcripción": transcripcion
        };

        console.log(`Data extracted for video: ${title}`);
        
        return videoDataResult;

    } catch (e) {
        console.error(`Error extracting data for video: ${e}`);
        return null;
    }
}



async function main() {
    const channelUrl = "https://www.youtube.com/@TipitoLIVE";
    const channelVideos = channelUrl + "/videos";
    const browser = await setupBrowser();
    const page = await browser.newPage();

    const channelName = getChannelName(channelUrl);

    const videoLimit = 10;  // Cambia este valor al número de videos que quieres
    const videoDataList = await getVideoUrls(page, channelVideos, videoLimit);

    const videosData = [];
    const baseDirectory = path.join(process.cwd(), channelName); // Carpeta base donde se guardará el Excel
    if (!fs.existsSync(baseDirectory)) {
        fs.mkdirSync(baseDirectory, { recursive: true });
    }

    for (const videoData of videoDataList) {
        const video = await getVideoData(page, videoData);
        if (video) {
            videosData.push(video);
            
            // Guardar transcripción en un archivo .txt en la misma carpeta que el archivo Excel
            const sanitizedTitle = sanitizeFileName(video["Título"]);
            const transcriptionFilePath = path.join(baseDirectory, `${sanitizedTitle}.txt`);
            fs.writeFileSync(transcriptionFilePath, video["Transcripción"] || "No transcript available");
            console.log(`Transcription saved to ${transcriptionFilePath}`);
        }
    }

    const filePath = path.join(baseDirectory, `${channelName}_videos_data.xlsx`);
    if (videosData.length > 0) {
        const workbook = new excel.Workbook();
        const worksheet = workbook.addWorksheet('Videos Data');

        worksheet.columns = [
            { header: 'Título', key: 'Título', width: 30 },
            { header: 'URL', key: 'URL', width: 50 },
            { header: 'Vistas', key: 'Vistas', width: 15 },
            { header: 'Fecha de publicación', key: 'Fecha de publicación', width: 20 },
            { header: 'Duración', key: 'Duración', width: 15 },
            { header: 'Likes', key: 'Likes', width: 15 },
            { header: 'Comentarios', key: 'Comentarios', width: 15 },
            { header: 'Descripción', key: 'Descripción', width: 50 },
        ];
        
        videosData.forEach(data => {
            worksheet.addRow(data);
        });

        await workbook.xlsx.writeFile(filePath);
        console.log(`Saving data to ${filePath}`);
    } else {
        console.log("No se encontraron datos para guardar.");
    }

    await browser.close();
}

main().catch(console.error);

