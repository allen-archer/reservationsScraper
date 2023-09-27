const puppeteer = require('puppeteer')
const { Webhook, EmbedBuilder } = require('@tycrek/discord-hookr');
const mqttService = require("./mqttService");

let config
let secrets
let logger

const embedColors = [
    '#97A88E',
    '#B2222A',
    '#EF9D7F',
    '#027978',
    '#F9DBA5',
    '#6E2250',
    '#332823'
]
let embedIndex = 0

async function initialize(_config, _secrets, _logger){
    config = _config
    secrets = _secrets
    logger = _logger
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
    try {
        await page.waitForXPath('/html/body/div[1]/main/section/div/div/div/form/div[3]/button')
    } catch (e) {
        throw 'Selector for login button failed'
    }
    await page.type('#username', secrets.username)
    await page.type('#password', secrets.password)
    await page.screenshot({ path: 'screenshots/login.png' })
    const button = await page.$x('/html/body/div[1]/main/section/div/div/div/form/div[3]/button')
    await button[0].click()
    try {
        await page.waitForSelector('#app > div > div.application-header > div.component.navigation > ul.navigation-links > li:nth-child(1) > a')
    } catch (e) {
        throw 'Selector for Front Desk link on Calendar page failed'
    }
    await page.screenshot({ path: 'screenshots/calendar.png' })
    const maps = []
    await page.click('#app > div > div.application-header > div.component.navigation > ul.navigation-links > li:nth-child(1) > a')
    try {
        await page.waitForSelector('#app > div > div.application-body > div > table > tbody:nth-child(1) > tr:nth-child(1) > th > h2')
    } catch (e) {
        throw 'Selector for Arrivals header on Front Desk page first iteration failed'
    }
    let date = new Date()
    for (let i = 0; i < config.daysToCheck; i++){
        if (i > 0) {
            date.setDate(date.getDate() + 1)
            const month = date.toLocaleString('en-US', { month: 'short' });
            const dateString = `${month} ${date.getDate()}, ${date.getFullYear()}`
            const dateInput = await page.$('#date_input_input')
            await dateInput.click({ clickCount: 3 }) // click 3 times to select all text
            await dateInput.type(dateString) // to then overwrite that text
            await page.click('#app > div > div.application-body > div > div.component.front-desk-form > form > div.component.tr-button.presentation-standard.precedence-primary > button > div > div')
            try {
                await page.waitForSelector('#app > div > div.application-body > div > table > tbody:nth-child(1) > tr:nth-child(1) > th > h2')
            } catch (e) {
                throw 'Selector for Arrivals header on Front Desk page second iteration failed'
            }
        }
        await page.screenshot({path: `screenshots/frontDesk${i}.png`})
        maps.push(await getMapForDay(page))
    }
    for (let i = 0; i < config.daysToCheck; i++) {
        for (const entry of maps[i].get('checkins')) {
            const phonesAndPreviousStays = await getPhonesAndPreviousStaysFromLink(page, entry.link)
            if (i === 0) {
                entry.phones = phonesAndPreviousStays.phones
            }
            entry.previousStays = phonesAndPreviousStays.previousStays
        }
    }
    for (const entry of maps[0].get('stayovers')) {
        entry.phones = await getPhonesFromLink(page, entry.link)
    }
    const areEveningGuests = maps[0].get('checkins').length > 0 || maps[0].get('stayovers').length > 0
    const areBreakfastGuests = maps[0].get('stayovers').length > 0 || maps[0].get('checkouts').length > 0
    const occupancyMap = new Map()
    for (const roomName of secrets.roomNames){
        occupancyMap.set(roomName,
            {
                occupiedTonight: false,
                checkingInToday: false
            })
    }
    for (const entry of maps[0].get('checkins')){
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
    for (const entry of maps[0].get('stayovers')){
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
    const phoneNumberMap = await combineAllPhoneNumbers(maps[0], secrets)
    mqttService.changeDeviceState('Evening Guests', areEveningGuests).then()
    mqttService.changeDeviceState('Breakfast Guests', areBreakfastGuests).then()
    for (const key of occupancyMap.keys()){
        mqttService.publishAttributes('occupancy ' + key, occupancyMap.get(key)).then()
    }
    mqttService.publishAttributes('occupancy phone numbers',
        { state: 'ON', phones: Object.fromEntries(phoneNumberMap)}).then()
    const messages = await createMessages(new Date(), maps, config.daysToCheck)
    for (const message of messages){
        const webhook = new Webhook(secrets.scraper.webhook)
        webhook.setContent(message.content)
        webhook.addEmbed(message.embeds)
        await webhook.send()
    }
}

function getNextEmbedColor(){
    if (embedIndex >= embedColors.length){
        embedIndex = 0
    }
    return embedColors[embedIndex++]
}

async function getPhonesAndPreviousStaysFromLink(page, link){
    return {
        phones: await getPhonesFromLink(page, link),
        previousStays: await getPreviousStays(page)
    }
}

async function getPhonesFromLink(page, link){
    await page.goto(link)
    try {
        await page.waitForSelector('#app > div > div.application-body > div > div.reservation-page-body > div > div > div.reservation-details-column.customer > div.component.assign-customer > div.customer-body')
    } catch (e) {
        logger.error('Selector for Phone Numbers failed')
        return ['ERROR']
    }
    const phoneElements = Array.from(await page.$$('.customer-phone > .component > a'))
    const phones = new Set()
    for (const phone of phoneElements) {
        phones.add(await cleanPhone(await getInnerHtml(page, phone)))
    }
    return Array.from(phones)
}

async function getPreviousStays(page){
    const date = new Date()
    await page.click('#app > div > div.application-body > div > div.reservation-page-body > div > div > div.reservation-details-column.customer > div.component.assign-customer > div.customer-header > div.customer-area > div.component.customer-name.small.has-link > a')
    try {
        await page.waitForSelector('#app > div > div.application-body > div > div.customer-details-page-body > div > div > table > tbody')
    } catch (e) {
        logger.error('Wait for selector failed on previous stays table')
        return 'ERROR'
    }
    const table = await page.$('#app > div > div.application-body > div > div.customer-details-page-body > div > div > table > tbody')
    if (table === null){
        logger.error('Table null for previous stays')
        return 'ERROR'
    }
    const rows = await table.$$('tr')
    let staysMessage = ''
    let lastStayFound = false
    let previousStaysCount = 0
    for (const row of rows){
        const roomName = await cleanRoom(await getInnerHtml(table, await row.$('td:nth-child(4) > a > div')))
        const arrivalString = await getInnerHtml(table, await row.$('td:nth-child(5) > a > div'))
        const departureString = await getInnerHtml(table, await row.$('td:nth-child(6) > a > div'))
        const timestamp = Date.parse(departureString)
        if (!isNaN(timestamp)){
            const departure = new Date(timestamp)
            if (departure < date){
                previousStaysCount++
                if (lastStayFound === false){
                    lastStayFound = true
                    staysMessage += `# previous stays, last on ${arrivalString}-${departureString} in ${roomName}`
                }
            }
        }
    }
    if (previousStaysCount > 0){
        return staysMessage.replace('#', previousStaysCount)
    } else {
        return 'First time guest'
    }
}

async function getMapForDay(page){
    let map = new Map()
    map.set('checkins', [])
    map.set('checkouts', [])
    map.set('stayovers', [])
    for (let type = 1; type < 4; type++){
        let row = 3
        while (true) {
            const rowElement = await page.$(`#app > div > div.application-body > div > table > tbody:nth-child(${type}) > tr:nth-child(${row})`)
            if (rowElement === undefined || rowElement === null) {
                // Reached the end of the available rows
                break
            }
            const name = await rowElement.$(`td:nth-child(2)`)
            const link = await rowElement.$(`td.booking-confirmation-id > a`)
            const room = await rowElement.$(`td:nth-child(4)`)
            const nights = await rowElement.$(`td:nth-child(5)`)
            const paid = await rowElement.$(`td:nth-child(6)`)
            const notes = Array.from(await rowElement.$$(`td:nth-child(7) > div > div`))
            row++
            const entry = {
                name: await cleanName(await getInnerHtml(page, name)),
                room: await cleanRoom(await getInnerHtml(page, room)),
                nights: await cleanNights(await getInnerHtml(page, nights)),
                amount: await cleanPaid(await getInnerHtml(page, paid)),
                link: await getLink(page, link),
                notes: await cleanNotes(page, notes)
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
    return map
}

async function createMessages(today, maps, numberOfDays){
    let messages = []
    for (let i = 0; i < numberOfDays; i++){
        let date = new Date(today)
        date.setDate(date.getDate() + i)
        messages.push(await getMessageForDay(date, maps[i]))
    }
    return messages
}

async function getMessageForDay(day, map){
    const checkins = map.get('checkins')
    const checkouts = map.get('checkouts')
    const message = {
        content: `__**${day.toLocaleString("en", {weekday: "long"})}**__`,
        embeds: []
    }
    if (checkins.length === 0){
        const embed = new EmbedBuilder()
            .setDescription(':inbox_tray: :x:')
            .setColor(getNextEmbedColor())
        message.embeds.push(embed)
    } else {
        for (const entry of checkins){
            const embed = new EmbedBuilder()
                .setDescription(`:inbox_tray: ${entry.name} :inbox_tray:`)
                .setFooter({text: entry.previousStays})
                .addField({name: 'Room', value: entry.room, inline: true})
                .addField({name: 'Nights', value: entry.nights, inline: true})
                .setColor(getNextEmbedColor())
            if (entry.guest){
                embed.addField({name: 'Additional Guest Names', value: entry.guest, inline: false})
            }
            if (entry.notes){
                for (const note of entry.notes) {
                    embed.addField({name: note.name, value: note.value, inline: false})
                }
            }
            if (entry.phones){
                let phones = ''
                for (let i = 0; i < entry.phones.length; i++){
                    if (i > 0){
                        phones += ', '
                    }
                    phones += entry.phones[i]
                }
                embed.addField({name: 'Phone', value: phones, inline: false})
            }
            message.embeds.push(embed)
        }
    }
    if (checkouts.length === 0){
        const embed = new EmbedBuilder()
            .setDescription(':outbox_tray: :x:')
            .setColor(getNextEmbedColor())
        message.embeds.push(embed)
    } else {
        for (const entry of checkouts){
            const embed = new EmbedBuilder()
                .setDescription(`:outbox_tray: ${entry.name} :outbox_tray:`)
                .addField({name: 'Room', value: entry.room, inline: true})
                .addField({name: 'Due', value: entry.amount, inline: true})
                .setColor(getNextEmbedColor())
            message.embeds.push(embed)
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
    const nameSansHtml = name.replaceAll(/<[^>]*>/g, ``)
    const split = nameSansHtml.split(', ')
    return `${split[1]} ${split[0]}`
}

async function cleanRoom(room){
    const split = room.split(' ')
    return split[0]
}

async function cleanNights(nights){
    const split = nights.split(' ')
    return split[2]
}

async function cleanPaid(paid){
    if (paid.includes('Yes')){
        return '$0.00'
    } else {
        const split = paid.split(' ')
        return split[2]
    }
}

async function cleanNotes(page, notes){
    const cleanedNotes = []
    for (const note of notes){
        const innerHtml = await getInnerHtml(page, note)
        const split = innerHtml.split('</strong>')
        cleanedNotes.push({
            name: split[0].replace('<strong>', ''),
            value: split[1]
        })
    }
    return cleanedNotes
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
