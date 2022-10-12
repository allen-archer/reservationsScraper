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

async function getComments(page){
    const fullComments = await getInnerHtml(page, await page.$('#comment-full-comment'))
    if (fullComments){
        return await trimMoreLessTags(fullComments)
    } else {
        return await getInnerHtml(page, await page.$('#reservation_comments-value'))
    }
}

async function trimMoreLessTags(text){
    if (text.includes('<')) {
        return text.substring(0, text.indexOf('<'))
    } else {
        return text
    }
}

async function getDates(dateString){
    let split = dateString.split(' - ')
    return {
        checkin: new Date(split[0]),
        checkout: new Date(split[1])
    }
}

async function getUndefinedItems(page, titles, values){
    let object = {}
    for (let i = 0; i < titles.length; i++){
        const title = await getInnerHtml(page, titles[i])
        const value = await getInnerHtml(page, values[i])
        if (title.includes('Approximate Arrival Time')){
            object.eta = await trimMoreLessTags(value)
        } else if (title.includes('dietary')){
            object.dietary = await trimMoreLessTags(value)
        } else if (title.includes('Anything else we should know')){
            object.anythingElse = await trimMoreLessTags(value)
        }
    }
    return object
}

async function getRoomNames(text){
    const roomNumberMap = secrets.roomNumberMap
    let roomNames = []
    const firstSplit = text.split(' - ')
    for (let firstString of firstSplit){
        const secondSplit = firstString.split(' ')
        for (let secondString of secondSplit){
            if (roomNumberMap[secondString]){
                roomNames.push(secondString)
                break
            }
        }
    }
    return roomNames
}

async function scrapeRooms(calendarDays, page) {
    let roomStays = []
    for (let day of calendarDays) {
        const orders = Array.from(await day.$$('[id^=order_]'))
        for (let order of orders) {
            await order.click()
            await page.waitForSelector('#reservation_occupants-value')
            const name = await getInnerHtml(page, await page.$(`#reservation_name-value > a`))
            const roomNames = await getRoomNames(await getInnerHtml(page, await page.$(
                `body > div.ui-dialog.ui-widget.ui-widget-content.ui-corner-all.ui-front.reservation-ui-popup-container.ui-draggable > div.ui-dialog-titlebar.ui-widget-header.ui-corner-all.ui-helper-clearfix.ui-draggable-handle > span`
            )))
            const dates = await getDates(await getInnerHtml(page, await page.$('#reservation_checkin-value')))
            const checkinTimeString = await getInnerHtml(page, await page.$('#reservation_checkin_time-value'))
            const guestName = await getInnerHtml(page, await page.$('#reservation_additional_comments_billing_guest-value'))
            const amountDue = await getInnerHtml(page, await page.$('#reservation_balance-value'))
            let notes = await getUndefinedItems(
                page,
                Array.from(await page.$$('#undefined-title')),
                Array.from(await page.$$('#undefined-value'))
            )
            notes.guestComments = await getComments(page)
            notes.innkeepersComments = await getInnerHtml(page, await page.$('#reservation_notes-value'))
            const phonesRaw = await getInnerHtml(page, await page.$('#reservation_phones-value'))
            const phones = await parsePhones(phonesRaw)
            try {
                await page.click('#close-button')
            } catch (error) {
                // This happens when the end of the calendar is reached
                // I'm sure there's a more graceful way to handle this
                // But this works, so...
                break
            }
            await page.waitForSelector('#reservation_occupants-value', {hidden: true})
            for (let roomName of roomNames) {
                roomStays.push(await createRoomStay(dates, name, amountDue, roomName, phones, notes, guestName, checkinTimeString))
            }
        }
    }
    return roomStays
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
            '--window-size=1920,1080' // default is 800x600, and that was actually stopping some elements from working correctly
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
    await page.type('#edit-name', secrets.username)
    await page.type('#edit-pass', secrets.password)
    await page.screenshot({ path: 'screenshots/login.png' })
    await page.click('#edit-submit')
    await page.waitForNavigation({timeout: config.timeout})
    let confirmationCodeRequired = (await page.$('#edit-confirmation-code')) || ''
    if (confirmationCodeRequired !== ''){
        logger.info('Confirmation code required, using stored code = ' + secrets.confirmationCode)
        await page.type('#edit-confirmation-code', secrets.confirmationCode)
        await page.type('#edit-new-password', secrets.password)
        await page.screenshot({ path: 'screenshots/confirmation.png' })
        await page.click('#edit-submit')
        await page.waitForNavigation({timeout: config.timeout})
        confirmationCodeRequired = (await page.$('#edit-confirmation-code')) || ''
        if (confirmationCodeRequired !== ''){
            webhook.send('SCRAPER NEEDS NEW CONFIRMATION CODE').then()
            await page.screenshot({ path: 'screenshots/confirmation_error.png' })
            logger.error('Confirmation code=' + secrets.confirmationCode + ' is incorrect')
            runFailure = true
            return
        }
    }
    await page.screenshot({ path: 'screenshots/calendar.png' })
    let calendarDays = Array.from(await page.$$('.calendar-day'))
    let roomStays = await scrapeRooms(calendarDays, page)
    let today = new Date()
    today.setHours(0)
    today.setMinutes(0)
    today.setSeconds(0)
    today.setMilliseconds(0)
    let finalStays = await combineStays(roomStays)
    let eveningGuests = await anyGuestsTonight(today, finalStays)
    mqttService.changeDeviceState('Evening Guests', eveningGuests).then()
    let breakfastGuests = await anyGuestsForBreakfast(today, finalStays)
    mqttService.changeDeviceState('Breakfast Guests', breakfastGuests).then()
    let occupancyMap = await createOccupancyMap(roomStays)
    for (let key of occupancyMap.keys()){
        const occupiedTonight = await isRoomOccupiedTonight(today, occupancyMap.get(key))
        const checkingInToday = await isRoomCheckingInToday(today, occupancyMap.get(key))
        mqttService.publishAttributes(
            'occupancy ' + key,
            {
                state: occupiedTonight ? 'ON' : 'OFF',
                checkingInToday: checkingInToday
            }
        ).then()
    }
    mqttService.publishAttributes('occupancy phone numbers',
        { state: 'ON', phones: await getAllPhoneNumbersForGuestsTonight(today, finalStays)}).then()
    let message = await createMessage(today, finalStays, config.daysToCheck)
    webhook.send(message).then()
    runFailure = false
}

async function parsePhones(phones){
    let returnData = []
    let temp = []
    if (phones.includes('<br>')){
        const split = phones.split('<br>')
        for (let str of split){
            temp.push(str)
        }
    } else {
        temp.push(phones)
    }
    for (let phone of temp){
        let str = phone.replace('+1', '')
        str = str.replace(/\s/g, '')
        returnData.push(str)
    }
    return returnData
}

async function daysBetweenDates(first, second){
    const difference = second.getTime() - first.getTime()
    return Math.round(Math.abs(difference / 86400000))
}

async function createRoomStay(dates, name, amount, roomName, phones, notes, guest, checkinTime){
    return {
        checkin: dates.checkin,
        checkout: dates.checkout,
        name: name,
        guest: guest,
        roomNumber: secrets.roomNumberMap[roomName],
        amount: amount,
        room: roomName,
        nights: await daysBetweenDates(dates.checkin, dates.checkout),
        phones: phones,
        checkinTime: checkinTime,
        notes: notes
    }
}

async function getInnerHtml(page, element){
    if (element === null){
        return ''
    }
    let text = await page.evaluate(element => element.innerHTML, element)
    return replaceNewlines(text)
}

async function replaceNewlines(text){
    if (text === undefined || text === null || text === ""){
        return ""
    }
    return text.replace(/[\r\n]+/g,"")
}

async function anyGuestsTonight(today, roomStays){
    for (let roomStay of roomStays){
        if (await compareDates(roomStay.checkin, today) <= 0 && await compareDates(roomStay.checkout, today) > 0){
            return true
        }
    }
    return false
}

async function getAllPhoneNumbersForGuestsTonight(today, roomStays){
    let map = new Map()
    for (let roomStay of roomStays){
        if (await compareDates(roomStay.checkin, today) <= 0 && await compareDates(roomStay.checkout, today) > 0){
            let phones = []
            for (let phone of roomStay.phones){
                phones.push(phone)
            }
            map.set(roomStay.roomNumber, phones)
        }
    }
    return Object.fromEntries(map)
}

async function isRoomOccupiedTonight(today, roomStays){
    let room = ''
    for (let roomStay of roomStays){
        room = roomStay.room
        if (await compareDates(roomStay.checkin, today) <= 0 && await compareDates(roomStay.checkout, today) > 0){
            return true
        }
    }
    return false
}

async function isRoomCheckingInToday(today, roomStays){
    let room = ''
    for (let roomStay of roomStays){
        room = roomStay.room
        if (await compareDates(roomStay.checkin, today) === 0){
            return true
        }
    }
    return false
}

async function createOccupancyMap(roomStays){
    let map = new Map()
    for (let roomStay of roomStays){
        let room = roomStay.room
        if (!map.has(room)){
            map.set(room, [])
        }
        map.get(room).push(roomStay)
    }
    return map
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
            if (roomStay.guest){
                message += '\n      ' + 'Guest: ' + roomStay.guest
            }
            if (roomStay.checkinTime){
                message += '\n      ' + 'Checkin: ' + roomStay.checkinTime
            }
            if (roomStay.notes.eta){
                message += '\n      ' + 'ETA: ' + roomStay.notes.eta
            }
            if (roomStay.notes.dietary){
                message += '\n      ' + 'Dietary restrictions: ' + roomStay.notes.dietary
            }
            if (roomStay.notes.guestComments){
                message += '\n      ' + 'Guest comments: ' + roomStay.notes.guestComments
            }
            if (roomStay.notes.innkeepersComments){
                message += '\n      ' + 'Innkeepers comments: ' + roomStay.notes.innkeepersComments
            }
            if (roomStay.notes.anythingElse){
                message += '\n      ' + 'Anything else?: ' + roomStay.notes.anythingElse
            }
            if (roomStay.phones){
                message += '\n      ' + 'Phone: '
                for (let i = 0; i < roomStay.phones.length; i++){
                    if (i > 0){
                        message += ', '
                    }
                    message += roomStay.phones[i]
                }
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

async function updateCode(confirmationCode){
    secrets.confirmationCode = confirmationCode
    return runFailure
}

module.exports = { initialize, runScraper, changeDeviceState, updateCode }
