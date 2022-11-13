const puppeteer = require('puppeteer')
const {Webhook} = require("discord-webhook-node");
const mqttService = require("./mqttService");

let config
let secrets
let logger
let webhook

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
    await page.waitForSelector('body > div > main > section > div > div > div > form > div:nth-child(4) > button')
    await page.screenshot({ path: 'screenshots/login.png' })
    await page.click('body > div > main > section > div > div > div > form > div:nth-child(4) > button')
    await page.waitForSelector('#app > div > div.application-header > div.component.navigationV2 > ul.navigation-links > li:nth-child(1) > a')
    await page.screenshot({ path: 'screenshots/calendar.png' })
    await page.click('#app > div > div.application-header > div.component.navigationV2 > ul.navigation-links > li:nth-child(1) > a')
    await page.waitForSelector('#app > div > div.application-body > div > table > tbody:nth-child(1) > tr:nth-child(1) > th > h2')
    await page.screenshot({path: 'screenshots/frontDesk.png'})
    let map = new Map()
    map.set('checkins', [])
    map.set('checkouts', [])
    map.set('stayovers', [])
    for (let type = 1; type < 4; type++){
        let row = 3
        while (true) {
            const name = await page.$(`#app > div > div.application-body > div > table > tbody:nth-child(${type}) > tr:nth-child(${row}) > td:nth-child(2)`)
            if (name === undefined || name === null) {
                // Reached the end of the available rows
                break
            }
            const link = await page.$(`#app > div > div.application-body > div > table > tbody:nth-child(${type}) > tr:nth-child(${row}) > td.booking-confirmation-id > a`)
            const room = await page.$(`#app > div > div.application-body > div > table > tbody:nth-child(${type}) > tr:nth-child(${row}) > td:nth-child(4)`)
            row++
            const entry = {
                name: await cleanName(await getInnerHtml(page, name)),
                room: await cleanRoom(await getInnerHtml(page, room)),
                link: await getLink(page, link)
            }
            if (type === 1){
                map.get('checkins').push(entry)
            } else if (type === 2){
                map.get('checkouts').push(entry)
            } else {
                map.get('stayovers').push(entry)
            }
        }
    }
    for (const key of map.keys()){
        for (const entry of map.get(key)) {
            page.goto(entry.link)
            await page.waitForSelector('#app > div > div.application-body > div > div.reservation-page-body > div > div > div.reservation-details-column.customer > div.component.assign-customer > div.customer-body')
            const phoneElements = Array.from(await page.$$('.customer-phone > .component > a'))
            const phones = new Set()
            for (const phone of phoneElements) {
                phones.add(await cleanPhone(await getInnerHtml(page, phone)))
            }
            entry.phones = Array.from(phones)
        }
    }
    const areEveningGuests = map.get('checkins').length > 0 || map.get('stayovers').length > 0
    const areBreakfastGuests = map.get('stayovers').length > 0 || map.get('checkouts').length > 0
    const occupancyMap = new Map()
    for (const roomName of secrets.roomNames){
        occupancyMap.set(roomName,
            {
                occupiedTonight: false,
                checkingInToday: false
            })
    }
    for (const entry of map.get('checkins')){
        const rooms = []
        if (entry.room.includes('-')){
            const split = entry.room.split('-')
            for (const val of split){
                rooms.push(val)
            }
        } else {
            rooms.push(entry.room)
        }
        for (const room of rooms){
            occupancyMap.get(room).occupiedTonight = true
            occupancyMap.get(room).checkingInToday = true
        }
    }
    for (const entry of map.get('stayovers')){
        const rooms = []
        if (entry.room.includes('-')){
            const split = entry.room.split('-')
            for (const val of split){
                rooms.push(val)
            }
        } else {
            rooms.push(entry.room)
        }
        for (const room of rooms){
            occupancyMap.get(room).occupiedTonight = true
            occupancyMap.get(room).checkingInToday = false
        }
    }
    const phoneNumberMap = await combineAllPhoneNumbers(map, secrets)
    try {
        mqttService.changeDeviceState('Evening Guests', areEveningGuests).then()
    } catch (e){
        logger.error(e)
    }
    try {
        mqttService.changeDeviceState('Breakfast Guests', areBreakfastGuests).then()
    } catch (e){
        logger.error(e)
    }
    for (const key of occupancyMap.keys()){
        try {
            mqttService.publishAttributes('occupancy ' + key, occupancyMap.get(key)).then()
        } catch (e){
            logger.error(e)
        }
    }
    try {
        mqttService.publishAttributes('occupancy phone numbers',
            { state: 'ON', phones: Object.fromEntries(phoneNumberMap)}).then()
    } catch (e){
        logger.error(e)
    }
    const message = await getMessage(map)
    webhook.send(message).then()
}

async function getMessage(map){
    const checkins = map.get('checkins')
    const checkouts = map.get('checkouts')
    let message = `Checkins:`
    if (checkins.length === 0){
        message += ' NONE'
    } else {
        for (const entry of checkins){
            message
                += '\n    ' + entry.name
                + '\n      ' + 'Room: ' + entry.room
            if (entry.phones){
                message += '\n      ' + 'Phone: '
                for (let i = 0; i < entry.phones.length; i++){
                    if (i > 0){
                        message += ', '
                    }
                    message += entry.phones[i]
                }
            }
        }
    }
    message += 'Checkouts:'
    if (checkouts.length === 0){
        message += ' NONE'
    } else {
        for (const entry of checkouts){
            message
                += '\n    ' + entry.name
                + '\n      ' + 'Room: ' + entry.room
        }
    }
    return message
}

async function combineAllPhoneNumbers(map, secrets){
    const phoneNumberMap = new Map()
    const entries = []
    for (const entry of map.get('checkins')){
        entries.push(entry)
    }
    for (const entry of map.get('stayovers')){
        entries.push(entry)
    }
    for (const entry of entries){
        phoneNumberMap.set(secrets.roomNumberMap[entry.room], entry.phones)
    }
    return phoneNumberMap
}

async function cleanPhone(phone){
    return phone
        .replace('+1', '')
        .replace('(Cell)', '')
        .replace(/\s/g, '') // all whitespace
        .replaceAll('-', '')
        .replaceAll('.', '')
        .replaceAll('(', '')
        .replaceAll(')', '')
}

async function cleanName(name){
    const split = name.split(', ')
    return `${split[0]} ${split[1]}`
}

async function cleanRoom(room){
    const split = room.split(' ')
    return split[0]
}

async function getInnerHtml(page, element){
    if (element === null){
        return ''
    }
    return await page.evaluate(element => element.innerHTML, element)
}

async function getLink(page, element){
    if (element === null){
        return ''
    }
    return await page.evaluate(element => element.href, element)
}

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

module.exports = { initialize, runScraper }
