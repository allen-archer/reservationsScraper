const puppeteer = require('puppeteer')
const {Webhook} = require("discord-webhook-node");
const mqttService = require("./mqttService");

let config
let secrets
let logger
let webhook
let runFailure = false

async function initialize(_config, _secrets, _logger){
    config = _config
    secrets = _secrets
    logger = _logger
    webhook = new Webhook(secrets.scraper.webhook)
}

async function runScraper(){
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--disable-gpu',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--no-sandbox',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--window-size=1920,1080' // default is 800x600
        ],
        defaultViewport: {
            width: 1920,
            height: 1080
        }
    })
    try {
        await doRun(browser);
    } catch (e){
        throw e
    } finally {
        await browser.close()
    }
}

async function doRun(browser){
    const page = await browser.newPage()
    await page.goto(secrets.loginUrl)
    await page.type('#username', secrets.username)
    await page.type('#password', secrets.password)
    await page.screenshot({ path: 'screenshots/login.png' })
    await page.click('body > div > main > section > div > div > div > form > div:nth-child(4) > button')
    await page.waitForSelector('#app > div > div.application-body > div > div > div.reservation-calendar-page-body > div > div.reservation-calendar-header')
    await page.screenshot({ path: 'screenshots/calendar.png' })
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(startDate.getDate() + config.daysToCheck)
    const reportsUrl = secrets.reportsUrl.replace('{startDate}', `${startDate.getFullYear()}-${startDate.getMonth() + 1}-${startDate.getDate()}`).replace('{endDate}', `${endDate.getFullYear()}-${endDate.getMonth() + 1}-${endDate.getDate()}`)
    console.log(reportsUrl)
    await page.goto(reportsUrl)
    await page.waitForSelector('#app > div > div.application-body > div > div.reports-page-content > div > div.report-body > div > div > table > tbody:nth-child(2)')
    await page.screenshot({ path: 'screenshots/report.png' })
    let i = 2;
    while(true){
        if (i > 200){
            logger.error('Manually breaking out of loop, something went wrong.')
            break
        }
        let checkOut = await page.$(`#app > div > div.application-body > div > div.reports-page-content > div > div.report-body > div > div > table > tbody:nth-child(2) > tr:nth-child(${i}) > td.checkOutDates > table > tbody > tr > td`)
        if (checkOut){
            console.log(await getInnerHtml(page, checkOut))
            i++
        } else {
            break
        }
    }
}

async function getInnerHtml(page, element){
    if (element === null){
        return ''
    }
    return await page.evaluate(element => element.innerHTML, element)
}

module.exports = { initialize, runScraper }
