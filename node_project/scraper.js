const puppeteer = require('puppeteer')
const {Webhook} = require("discord-webhook-node");
const mqttService = require("./mqttService");

const dateRegex = 'data-ajax="(.*?):'
const dataDaysRegex = 'data-days="(.*?)"'
const amountRegex = '(\\$\\d{0,3},{0,1}\\d{1,3}\\.\\d{2})'
const nameRegex = '<div title="(.*?)"'
const noteRegex = '<span class=".*?title="(.*?)"'
const noteDateRegex = '\\d{2}\\/\\d{2}\\/\\d{4} \\d{2}:\\d{2}: '
const orderIdRegex = ' id="(.*?)"'
const roomNumberRegex = '.*_(\\d{3,4})'

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
            "--disable-gpu",
            "--disable-dev-shm-usage",
            "--disable-setuid-sandbox",
            "--no-sandbox",
        ],
    })
    const page = await browser.newPage()
    await page.goto(secrets.loginUrl)
    await page.type('#edit-name', secrets.username)
    await page.type('#edit-pass', secrets.password)
    await page.screenshot({ path: 'screenshots/login.png' })
    await page.click('#edit-submit')
    await page.waitForNavigation({timeout: config.timeout})
    let confirmationCodeRequired = (await page.$('#edit-confirmation-code')) || ""
    if (confirmationCodeRequired !== ""){
        logger.info('Confirmation code required, using stored code = ' + secrets.confirmationCode)
        await page.type('#edit-confirmation-code', secrets.confirmationCode)
        await page.type('#edit-new-password', secrets.password)
        await page.screenshot({ path: 'screenshots/confirmation.png' })
        await page.click('#edit-submit')
        await page.waitForNavigation({timeout: config.timeout})
        confirmationCodeRequired = (await page.$('#edit-confirmation-code')) || ""
        if (confirmationCodeRequired !== ""){
            await page.screenshot({ path: 'screenshots/confirmation_error.png' })
            logger.error('Confirmation code=' + secrets.confirmationCode + ' is incorrect')
            return
        }
    }
    await page.screenshot({ path: 'screenshots/calendar.png' })
    let calendarDays = Array.from(await page.$$('.calendar-day'))
    let roomStays = []
    for (let day of calendarDays) {
        let inner = await getInnerHtml(page, day)
        let map = await getOrdersAndRooms(inner)
        let orders = Array.from(await day.$$('[id^=order]'))
        let roomNight = await day.$('[id^=room_night]')
        let date = (await safeMatch(await getOuterHtml(page, roomNight), dateRegex))[0][1]
        for (let order of orders) {
            let outerHtml = await getOuterHtml(page, order)
            let innerHtml = await getInnerHtml(page, order)
            let amount = (await safeMatch(outerHtml, amountRegex, 1))[0][1]
            let days = (await safeMatch(outerHtml, dataDaysRegex, 1))[0][1]
            let name = (await safeMatch(innerHtml, nameRegex))[0][1]
            let note
            let noteMatches = (await safeMatch(innerHtml, noteRegex))
            if (noteMatches.length > 0){
                note = noteMatches[0][1]
            } else {
                note = ''
            }
            let orderId = (await safeMatch(outerHtml, orderIdRegex))[0][1]
            let roomNumber = (await safeMatch(map.get(orderId), roomNumberRegex))[0][1]
            let roomName = secrets.roomNameMap[roomNumber]
            let notes = []
            if (note.includes('Credit card on file') || note.includes('Balance due')) {
                note = ''
            } else if (note !== '') {
                note = note.replace(RegExp(noteDateRegex, 'g'), '')
                if (note.includes('<br>')) {
                    notes = note.split('<br>')
                } else {
                    notes.push(note)
                }
            }
            let notesFromName = await getNotesFromName(name)
            if (notesFromName) {
                name = await trimNotesFromName(name)
                notes.push(notesFromName)
            }
            let finalNote = ''
            if (notes.length > 0) {
                for (let i = 0; i < notes.length; i++) {
                    if (notes[i].includes('<strong>')) {
                        notes[i] = notes[i].replace('<strong>', '')
                    }
                    if (notes[i].includes('</strong>')) {
                        notes[i] = notes[i].replace('</strong>', '')
                    }
                    if (notes[i].includes('Special requests: ')) {
                        notes[i] = notes[i].replace('Special requests: ', '')
                    }
                }
                let distinctNotes = Array.from(new Set(notes))
                for (let i = 0; i < distinctNotes.length; i++) {
                    if (i > 0) {
                        finalNote += ', '
                    }
                    finalNote += distinctNotes[i]
                }
            }
            roomStays.push(await createRoomStay(date, name, days, amount, finalNote, roomName))
        }
    }
    let today = new Date()
    today.setHours(0)
    today.setMinutes(0)
    today.setSeconds(0)
    today.setMilliseconds(0)
    let finalStays = await combineStays(roomStays)
    let eveningGuests = await anyGuestsTonight(today, finalStays)
    mqttService.changeDeviceState("Evening Guests", eveningGuests).then()
    let breakfastGuests = await anyGuestsForBreakfast(today, finalStays)
    mqttService.changeDeviceState("Breakfast Guests", breakfastGuests).then()
    let message = await createMessage(today, finalStays, config.daysToCheck)
    webhook.send(message).then()
    await browser.close()
}

async function getNotesFromName(name){
    let split = name.split('<br>')
    if (split.length > 1){
        let notes = ''
        for (let i = 1; i < split.length; i++){
            if (i > 1){
                notes += ', '
            }
            notes += split[i]
        }
        return notes
    }
}

async function trimNotesFromName(name){
    return name.split('<br>')[0]
}

async function createRoomStay(date, name, days, amount, note, room){
    let split = date.split('-')
    let year = parseInt(split[0], 10)
    let month = parseInt(split[1], 10)
    let day = parseInt(split[2], 10)
    let nights = parseInt(days, 10)
    let checkin = new Date(year, month - 1, day, 0, 0, 0, 0)
    checkin.set
    let checkout = new Date(checkin)
    checkout.setDate(checkin.getDate() + nights)
    return {
        checkin: checkin,
        checkout: checkout,
        name: name,
        amount: amount,
        note: note,
        room: room,
        nights: parseInt(days, 10)
    }
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
    const matches = []
    if (text) {
        let regex = RegExp(pattern, 'g')
        let groups
        while ((groups = regex.exec(text)) !== null) {
            matches.push(Array.from(groups))
        }
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

async function anyGuestsTonight(today, roomStays){
    for (let roomStay of roomStays){
        let isTonight = await compareDates(roomStay.checkin, today) <= 0 && await compareDates(roomStay.checkout, today) > 0
        if (isTonight){
            return true
        }
    }
    return false
}

async function anyGuestsForBreakfast(today, roomStays){
    for (let roomStay of roomStays){
        let breakfastGuests = await compareDates(roomStay.checkin, today) < 0 && await compareDates(roomStay.checkout, today) >= 0
        if (breakfastGuests){
            return true
        }
    }
    return false
}

async function createMessage(today, roomStays, numberOfDays){
    let message = ''
    for (let i = 0; i < numberOfDays; i++){
        let date = new Date(today)
        date.setDate(date.getDate() + i)
        if (i > 0){
            message += '\n\n'
        }
        message += await getMessageForDay(date, roomStays)
    }
    return message
}

async function compareDates(left, right){
    let leftTime = left.getTime()
    let rightTime = right.getTime()
    if (leftTime < rightTime){
        return -1
    } else if (leftTime === rightTime){
        return 0
    } else {
        return 1
    }
}

async function combineStays(roomStays){
    let final = []
    let map = new Map()
    for (let roomStay of roomStays){
        if (!map.has(roomStay.room)){
            map.set(roomStay.room, [])
        }
        map.get(roomStay.room).push(roomStay)
    }
    for (let key of map.keys()){
        let entry = map.get(key)
        for (let i = 0; i < entry.length; i++){
            if (i === entry.length - 1){
                final.push(entry[i])
            } else {
                let thisStay = entry[i]
                let j = i + 1
                let indexOfLastMerged = i
                while (j < entry.length && await isSameStay(thisStay, entry[j])){
                    thisStay.checkout = entry[j].checkout
                    thisStay.nights += entry[j].nights
                    thisStay.amount += ', ' + entry[j].amount
                    indexOfLastMerged = j
                }
                if (indexOfLastMerged > i){
                    i = indexOfLastMerged
                }
                final.push(thisStay)
            }
        }
    }
    return final
}

async function isSameStay(left, right){
    return await compareDates(left.checkout, right.checkin) === 0 && left.name === right.name
}

async function getMessageForDay(day, roomsStays){
    let checkins = []
    let checkouts = []
    for (const roomsStay of roomsStays) {
        if (await compareDates(roomsStay.checkin, day) === 0){
            checkins.push(roomsStay)
        } else if (await compareDates(roomsStay.checkout, day) === 0){
            checkouts.push(roomsStay)
        }
    }
    let message = day.toLocaleString("en", {weekday: "long"}) + ':\n  Checkins:'
    if (checkins.length === 0){
        message += ' NONE'
    } else {
        for (let roomStay of checkins){
            message
                += '\n    ' + roomStay.name
                + '\n      ' + 'Room: ' + roomStay.room
                + '\n      ' + 'Nights: ' + roomStay.nights
            if (roomStay.note){
                message += '\n      ' + 'Note: ' + roomStay.note
            }
        }
    }
    message += '\n  Checkouts:'
    if (checkouts.length === 0){
        message += ' NONE'
    } else {
        for (let roomStay of checkouts){
            message
                += '\n    ' + roomStay.name
                + '\n      ' + 'Room: ' + roomStay.room
                + '\n      ' + 'Due: ' + roomStay.amount
        }
    }
    return message
}

async function changeDeviceState(deviceName, state){
    mqttService.changeDeviceState(deviceName, state).then()
}

module.exports = { initialize, runScraper, changeDeviceState }
