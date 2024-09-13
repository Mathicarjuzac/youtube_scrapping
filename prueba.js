const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const excel = require('exceljs');  // Necesitarás instalar exceljs con `npm install exceljs`

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

    const videoUrls = [];
    const container = await page.$('#contents');
    const videoElements = await container.$$('.style-scope.ytd-rich-item-renderer');
    
    if (videoElements.length === 0) {
        console.log("No se encontraron videos con los selectores actuales.");
        return [];
    }

    console.log(`Found ${videoElements.length} videos.`); // Mensaje de depuración

    for (let i = 0; i < Math.min(videoElements.length, limit); i++) {
        try {
            const linkElement = await videoElements[i].$('a#thumbnail');
            const url = await linkElement.evaluate(el => el.href);
            videoUrls.push(url);
            console.log(`Found video URL: ${url}`); // Mensaje de depuración
        } catch (e) {
            console.error(`Error extracting URL for a video: ${e}`);
        }
    }

    return videoUrls;
}

async function getVideoData(page, videoUrl) {
    await page.goto(videoUrl, { waitUntil: 'networkidle2' });

    try {
        await page.waitForSelector('#above-the-fold', { visible: true });
        await page.click('#bottom-row');  // Asegúrate de que el botón esté visible y habilitado


        const title = await page.$eval('h1.style-scope.ytd-watch-metadata', el => el.innerText);

        let views = await page.$eval('#info span', el => el.innerText)
        views= views.split(" ",1)[0].replace(",","");

        const upload_date = await page.$eval('#info span:nth-of-type(3)', el => el.innerText);

        const duration = await page.$eval('.ytp-time-duration', el => el.innerText);

        const likes = await page.$eval('#top-level-buttons-computed segmented-like-dislike-button-view-model yt-smartimation div div like-button-view-model toggle-button-view-model button-view-model button div.yt-spec-button-shape-next__button-text-content', el => el.innerText);  

       
        await page.waitForSelector('#primary-button ytd-button-renderer yt-button-shape button', { timeout: 5000 });
        await page.click('#primary-button  ytd-button-renderer  yt-button-shape  button');
// COMENTARIOS
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

        const transcripcion = await page.$eval('#body', el => el.innerText);
        

        

        const videoData = {
            "Título": title,
            "URL": videoUrl,
            "Vistas": views,
            "Fecha de publicación": upload_date,
            "Duración": duration,
            "Likes": likes,
            "Comentarios": comments,
            "Descripción": description,
            "Transcripcion": transcripcion
            
        };

        console.log(`Data extracted for video: ${title}`); // Mensaje de depuración
        console.log(videoData);
        
        return videoData;

    } catch (e) {
        console.error(`Error extracting data for video: ${e}`); // Mensaje de error
        return null;
    }
}

async function main() {
    const channelUrl = "https://www.youtube.com/@TipitoLIVE";
    const channelVideos = channelUrl+"/videos";
    const browser = await setupBrowser();
    const page = await browser.newPage();

    const channelName = getChannelName(channelUrl);

    const videoUrls = await getVideoUrls(page, channelVideos, 1);

    const videosData = [];
    for (const url of videoUrls) {
        const videoData = await getVideoData(page, url);
        if (videoData) {
            videosData.push(videoData);
        }
    }

    const baseDirectory = channelName;
    const videosDirectory = path.join(baseDirectory, 'videos');

    if (!fs.existsSync(baseDirectory)) {
        fs.mkdirSync(baseDirectory);
    }

    // if (!fs.existsSync(videosDirectory)) {
    //     fs.mkdirSync(videosDirectory);
    // }

    const filePath = path.join(baseDirectory, `${channelName}_videos_data.xlsx`);
    if (videosData.length > 0) {  // Solo guarda el archivo si hay datos
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
            { header: 'transcripcion', key: 'Transcripcion', width: 50 },
        ];
        

        videosData.forEach(data => {
            worksheet.addRow(data);
        });

        await workbook.xlsx.writeFile(filePath);
        console.log(`Saving data to ${filePath}`); // Mensaje de depuración
    } else {
        console.log("No se encontraron datos para guardar.");
    }

    await browser.close();
}

main().catch(console.error);
