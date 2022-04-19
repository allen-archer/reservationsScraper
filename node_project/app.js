const puppeteer = require('puppeteer')

const loginUrl = ''
const userName = ''
const password = ''
const confirmationCode = ''
const dateRegex = 'data-ajax="(.*?):'
const dataDaysRegex = 'data-days="(.*?)"'
const amountRegex = '(\\$\\d{0,3},{0,1}\\d{1,3}\\.\\d{2})'
const nameRegex = '<div title="(.*?)"'
const noteRegex = '<span class=".*?title="(.*?)"'
const noteDateRegex = '\\d{2}\\/\\d{2}\\/\\d{4} \\d{2}:\\d{2}: '
const orderIdRegex = ' id="(.*?)"'
const roomNumberRegex = '.*_(\\d{3,4})'

const main = async () => {
    const browser = await puppeteer.launch({timeout: 5000})
    const page = await browser.newPage()
    await page.goto(loginUrl)
    await page.type('#edit-name', userName)
    await page.type('#edit-pass', password)
    await page.screenshot({ path: 'login.png' })
    await page.click('#edit-submit')
    await page.waitForNavigation()
    let confirmationCodeRequired = (await page.$('#edit-confirmation-code')) || "";
    if (confirmationCodeRequired !== ""){
        await page.type('#edit-confirmation-code', confirmationCode)
        await page.type('#edit-new-password', password)
        await page.screenshot({ path: 'confirmation.png' })
        await page.click('#edit-submit')
        await page.waitForNavigation()
    }
    await page.screenshot({ path: 'calendar.png' })
    let calendarDays = Array.from(await page.$$('.calendar-day'))
    for (let i = 0; i < calendarDays.length; i++) {
        let day = calendarDays[i]
        let inner = await getInnerHtml(page, day)
        let map = await getOrdersAndRooms(inner)
        let orders = Array.from(await day.$$('[id^=order]'))
        let roomNight = await day.$('[id^=room_night]')
        let date = (await safeMatch(await getOuterHtml(page, roomNight), dateRegex))[0][1]
        for (let j = 0; j < orders.length; j++) {
            let outerHtml = await getOuterHtml(page, orders[j])
            let innerHtml = await getInnerHtml(page, orders[j])
            let amount = (await safeMatch(outerHtml, amountRegex, 1))[0][1]
            let days = (await safeMatch(outerHtml, dataDaysRegex, 1))[0][1]
            let name = (await safeMatch(innerHtml, nameRegex))[0][1]
            let note = (await safeMatch(innerHtml, noteRegex))[0][1]
            let orderId = (await safeMatch(outerHtml, orderIdRegex))[0][1]
            let roomNumber = (await safeMatch(map.get(orderId), roomNumberRegex))[0][1]
            if (note.includes('Credit card on file') || note.includes('Balance due')){
                note = ''
            } else {
                note = note.replace(RegExp(noteDateRegex, 'g'), '')
                if (note.includes('<br>')){
                    note = note.replace('<br>', ', ')
                }
            }
            console.log('date=' + date + ': name=' + name + ': days=' + days + ': amount=' + amount + ': note=' + note + ': room=' + roomNumber)
        }
    }
    await browser.close()
}

async function getOuterHtml(page, element){
    let text = await page.evaluate(element => element.outerHTML, element)
    return replaceNewlines(text)
}

async function getInnerHtml(page, element){
    let text = await page.evaluate(element => element.innerHTML, element)
    return replaceNewlines(text)
}

async function replaceNewlines(text){
    if (text === undefined || text === null || text === ""){
        return ""
    }
    return text.replace(/[\r\n]+/g,"")
}

async function safeMatch(text, pattern){
    if (text === undefined || text === null || text === ""){
        return "N/A"
    }
    const matches = []
    let regex = RegExp(pattern, 'g')
    let groups
    while ((groups = regex.exec(text)) !== null) {
        matches.push(Array.from(groups))
    }
    return matches
}

async function getOrdersAndRooms(innerHtml){
    let regex = await safeMatch(innerHtml, orderIdRegex)
    let map = new Map()
    for (let i = 0; i < regex.length; i++){
        let thisText = regex[i][1]
        if (thisText.includes('order')){
            map.set(thisText, regex[i+1][1])
        }
    }
    return map
}

main()