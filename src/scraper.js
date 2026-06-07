import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import {Webhook, EmbedBuilder} from '@tycrek/discord-hookr';
import * as mqttService from './mqtt.js';
import {TOTP} from 'totp-generator';
import {generatePassword, savePassword} from './password.js';
import {sendScraperErrorNotification} from './ntfy.js'
import * as guestDatabase from './guestdatabase.js'

puppeteer.use(StealthPlugin());

let config;
let secrets;
let logger;

const embedColors = [
  '#97A88E',
  '#B2222A',
  '#EF9D7F',
  '#027978',
  '#F9DBA5',
  '#6E2250',
  '#332823'
];
let embedIndex = 0;
const frontDeskLinkSelector = '#app > div > div.application-header > div.component.navigation > ul.navigation-links > li:nth-child(1) > a';

async function initialize(_config, _secrets, _logger) {
  config = _config;
  secrets = _secrets;
  logger = _logger;
}

async function runScraper(runConfig) {
  const browser = await puppeteer.launch({
    headless: runConfig?.headless ?? 'new',
    userDataDir: '/app/config/browser-profile',
    protocolTimeout: 120000,
    args: [
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox',
      '--no-sandbox',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disk-cache-size=0',
      '--window-size=1920,1080'
    ],
    defaultViewport: {
      width: 1920,
      height: 1080
    }
  });
  try {
    await doRun(browser, runConfig);
  } catch (e) {
    throw e;
  } finally {
    const pages = await browser.pages();
    await Promise.all(pages.map(p => p.close()));
    await browser.close();
  }
}

async function doRun(browser, runConfig) {
  let page;
  try {
    page = await login(browser);
  } catch (e) {
    throw e;
  }
  try {
    if (runConfig?.doBlackouts) {
      await doBlackouts(page, runConfig);
    }
  } catch (e) {
    logger.error(e);
  }
  try {
    if (runConfig?.doScrapeGuestData) {
      await scrapeGuestData(page, runConfig);
    }
  } catch (e) {
    logger.error(e);
  }
}

async function doBlackouts(page, runConfig) {
  logger.info('Starting blackouts.');
  const rooms = secrets.blackouts.roomNames;
  await page.goto(secrets.blackouts.url);
  await page.waitForSelector('[class="blackout-room-id-date"]');
  const date = getScrapeDate(runConfig);
  let doCheck = true;
  const isDayBefore = date.getHours() >= 12;
  if (isDayBefore) {
    date.setDate(date.getDate() + 1);
  }
  const combos = new Map();
  for (let [comboName, containedNames] of Object.entries(secrets.blackouts.roomComboNames)) {
    combos.set(comboName, new Set(containedNames));
  }
  for (let i = 0; i <= 1; i++) {
    const roomSet = new Set(rooms);
    const dateString = getDateString(date);
    // Check for combo rooms that are occupied and remove the individual rooms from the set because the
    // blackout page will error if you try to blackout a room that is part of a combo that is already occupied
    for (const [comboName, containedNames] of combos) {
      const roomSelector = await page.$(`[class="room"][data-room-name="${comboName}"]`);
      if (!roomSelector) {
        continue;
      }
      const blackoutSelector = await roomSelector.$(`[class="blackout-room-id-date"][data-date="${dateString}"]`);
      if (!blackoutSelector) {
        for (const room of roomSet) {
          if (containedNames.has(room)) {
            // Remove the room from the potential blackout targets for this day
            roomSet.delete(room);
            logger.info(`Removing room name: ${room} because ${comboName} is occupied.`);
          }
        }
      }
    }
    for (const room of roomSet) {
      const roomSelector = await page.$(`[class="room"][data-room-name="${room}"]`);
      if (!roomSelector) {
        continue;
      }
      const blackoutSelector = await roomSelector.$(`[class="blackout-room-id-date"][data-date="${dateString}"]`);
      if (blackoutSelector) {
        let isChecked = await isElementChecked(page, blackoutSelector);
        if (isChecked && !doCheck) {
          await blackoutSelector.click();
        } else if (!isChecked && doCheck) {
          await blackoutSelector.click();
        }
      }
    }
    date.setDate(date.getDate() - 2);
    doCheck = false;
  }
  if (runConfig?.dryRun) {
    logger.info('Dry run: skipping blackout save.');
    const cancelButton = await page.$('button[class="cancel"]');
    page.once('dialog', dialog => dialog.accept());
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle0'}),
      cancelButton.click()
    ]);
  } else {
    const saveButton = await page.$('button[class="save"]');
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle0'}),
      saveButton.click()
    ]);
  }
  await page.waitForSelector('#app > div > div.application-header > div.component.navigation > ul.navigation-links > li:nth-child(1) > a');
}

function getDateString(date) {
  const year = date.toLocaleString('default', {year: 'numeric'});
  const day = date.toLocaleString('default', {day: '2-digit'});
  const month = date.toLocaleString('default', {month: '2-digit'});
  return `${year}-${month}-${day}`;
}

async function login(browser) {
  const pages = await browser.pages();
  const page = pages.length > 0 ? pages[0] : await browser.newPage();
  await page.goto(secrets.loginUrl, {waitUntil: 'networkidle0'});
  try {
    await page.waitForSelector(`button[type=submit], ${frontDeskLinkSelector}`);
  } catch (e) {
    await page.screenshot({path: 'screenshots/error_login_button.png'});
    throw 'Selector for login button failed';
  }
  if (await page.$(frontDeskLinkSelector)) {
    logger.info('Already logged in, skipping login.');
    await page.screenshot({path: 'screenshots/calendar.png'});
    return page;
  }
  try {
    await page.type('#username', secrets.username, {delay: 80 + Math.random() * 60}); // 80-140 ms delay between key strokes
    await page.type('#password', secrets.password, {delay: 80 + Math.random() * 60});
    await delay(500 + Math.random() * 500); // 0.5-1 s delay between entering username and password and clicking login
    await page.screenshot({path: 'screenshots/login.png'});
  } catch (e) {
    await page.screenshot({path: 'screenshots/error_login.png'});
    throw 'There was an error entering login information';
  }
  try {
    const button = await page.$('button[type=submit]');
    await Promise.all([
      page.waitForNavigation({waitUntil: 'networkidle0'}),
      button.click()
    ]);
    await page.waitForSelector(`#code, #password-reset, ${frontDeskLinkSelector}`);
  } catch (e) {
    await page.screenshot({path: 'screenshots/error_login_otp.png'});
    throw 'Selector for OTP or Front Desk link on Calendar page failed';
  }
  if (await page.$('#password-reset')) {
    await page.screenshot({path: 'screenshots/password_reset.png'});
    logger.info('Password expired, generating new password and resetting.');
    const newPassword = generatePassword();
    try {
      await page.waitForSelector('#new-password');
      await page.type('#new-password', newPassword);
      await page.type('#re-enter-password', newPassword);
      const resetButton = await page.$('button[type=submit]');
      await Promise.all([
        page.waitForNavigation({waitUntil: 'networkidle0'}),
        resetButton.click()
      ]);
      await page.waitForSelector(`#code, ${frontDeskLinkSelector}`);
      sendScraperErrorNotification(`New password generated: ${newPassword}`);
    } catch (e) {
      await page.screenshot({path: 'screenshots/error_password_reset.png'});
      throw 'Password reset failed';
    }
    savePassword(newPassword, secrets);
    logger.info('Password reset and saved to secrets.');
  }
  const codeInput = await page.$('#code');
  if (codeInput) {
    const {otp, expires} = await TOTP.generate(secrets.totp.secret);
    logger.info('OTP entered.');
    await page.type('#code', otp);
    const rememberBrowser = await page.$('#rememberBrowser');
    if (!await isElementChecked(page, rememberBrowser)) {
      logger.info('Clicking remember browser.')
      await rememberBrowser.click();
    }
    await page.screenshot({path: 'screenshots/otp.png'});
    const button2 = await page.$('button[type=submit]');
    try {
      await Promise.all([
        page.waitForNavigation({waitUntil: 'networkidle0'}),
        button2.click()
      ]);
      await page.waitForSelector(frontDeskLinkSelector);
    } catch (e) {
      await page.screenshot({path: 'screenshots/error_login_post_otp.png'});
      throw 'Selector for Front Desk link on Calendar page failed after OTP entered';
    }
  }
  await page.screenshot({path: 'screenshots/calendar.png'});
  return page;
}

async function scrapeGuestData(page, runConfig) {
  logger.info('Starting scrape process.')
  const confirmationCodesSet = new Set();
  try {
    const frontDeskUrl = await page.$eval(frontDeskLinkSelector, el => el.href);
    await page.goto(frontDeskUrl, {waitUntil: 'networkidle0'});
    await page.waitForSelector('#app > div > div.application-body > div > table > tbody:nth-child(1) > tr:nth-child(1) > th > h2');
  } catch (e) {
    await page.screenshot({path: 'screenshots/error_front_desk_nav.png'});
    throw 'Selector for Arrivals header on Front Desk page first iteration failed';
  }
  let date = getScrapeDate(runConfig);
  // If the scraper is run the day before, we need to check the next day's arrivals instead of today's
  const isDayBefore = date.getHours() >= 12;
  for (let i = 0; i < config.daysToCheck; i++) {
    if (i > 0 || isDayBefore) {
      date.setDate(date.getDate() + 1);
      const month = date.toLocaleString('en-US', {month: 'short'});
      const dateString = `${month} ${date.getDate()}, ${date.getFullYear()}`;
      const dateInput = await page.$('#date_input_input');
      await dateInput.evaluate(element => element.select());
      await dateInput.type(dateString);
      try {
        await Promise.all([
          page.waitForNavigation({waitUntil: ['networkidle0', 'domcontentloaded']}),
          page.click('#app > div > div.application-body > div > div.component.front-desk-form > form > div.component.tr-button.presentation-standard.precedence-primary > button > div > div')
        ]);
        await page.waitForSelector('#app > div > div.application-body > div > table > tbody:nth-child(1) > tr:nth-child(1) > th > h2');
      } catch (e) {
        await page.screenshot({path: 'screenshots/error_front_desk_date.png'});
        throw 'Selector for Arrivals header on Front Desk page second iteration failed';
      }
    }
    await page.screenshot({path: `screenshots/frontDesk${i}.png`});
    const codes = await page.$$eval('td.booking-confirmation-id a', els => els.map(el => el.textContent.trim()));
    codes.forEach(code => confirmationCodesSet.add(code));
  }
  logger.info(confirmationCodesSet.size > 0 ? `Confirmation codes scraped: ${[...confirmationCodesSet].join(', ')}` : 'No confirmation codes scraped.');
  let confirmationCodesToEnrich;
  try {
    confirmationCodesToEnrich = await guestDatabase.getConfirmationCodesWithoutGuest();
    logger.info(confirmationCodesToEnrich.length > 0 ? `Confirmation codes to enrich: ${confirmationCodesToEnrich.join(', ')}` : 'No confirmation codes to enrich.');
  } catch (e) {
    logger.error(`Error fetching confirmation codes from guest database: ${e}`)
  }
  const confirmationCodeResponses = [];
  const allConfirmationCodes = [...new Set([...confirmationCodesSet, ...(confirmationCodesToEnrich ?? [])])];
  await goToSearchPage(page);
  for (const code of allConfirmationCodes) {
    try {
      const searchInput = await page.$('input[name="term"]');
      await searchInput.evaluate(element => element.select());
      await searchInput.type(code, {delay: 50});
      const [response] = await Promise.all([
        page.waitForResponse(
            res => res.url().includes('/bills/search') && res.status() === 200,
            {timeout: 15000}
        ),
        page.$eval('button[type="submit"]', btn => btn.click())
      ]);
      const data = await response.json();
      confirmationCodeResponses.push({
        code: code,
        data: data[0]
      });
    } catch (e) {
      await page.screenshot({path: 'screenshots/error_confirmation_code_search.png'});
      throw `Error searching for confirmation code ${code}. ${confirmationCodeResponses.length} codes searched successfully of ${confirmationCodesSet.size}.`;
    }
  }
  await guestDatabase.sendUpsertRequest(confirmationCodeResponses);
  const scrapedResponses = confirmationCodeResponses.filter(r => confirmationCodesSet.has(r.code));
  const baseDate = getScrapeDate(runConfig);
  const messages = [];
  for (let i = 0; i < config.daysToCheck; i++) {
    const dayDate = new Date(baseDate);
    dayDate.setDate(dayDate.getDate() + (isDayBefore ? i + 1 : i));
    const dateString = getDateString(dayDate);
    const checkins = classifyForDay(scrapedResponses, dateString, 'checkin');
    const checkouts = classifyForDay(scrapedResponses, dateString, 'checkout');
    const stayovers = classifyForDay(scrapedResponses, dateString, 'stayover');
    if (i === 0) {
      const areEveningGuests = checkins.length > 0 || stayovers.length > 0;
      const areBreakfastGuests = stayovers.length > 0 || checkouts.length > 0;
      const occupancyMap = buildOccupancyMap(checkins, stayovers, dateString);
      const phoneNumberMap = buildPhoneNumberMap(checkins, stayovers);
      if (runConfig?.dryRun) {
        logger.info('Dry run: skipping MQTT send.');
        logger.info(`evening guests: ${areEveningGuests}`);
        logger.info(`breakfast guests: ${areBreakfastGuests}`);
        logger.info(`occupancy:\n${[...occupancyMap.entries()].map(([k, v]) => ` -- ${k}:${JSON.stringify(v)}`).join('\n')}`);
        logger.info(`phones:\n${[...phoneNumberMap.entries()].map(([k, v]) => ` -- ${k}:${JSON.stringify(v)}`).join('\n')}`);
      } else {
        mqttService.changeDeviceState('evening guests', areEveningGuests).then();
        mqttService.changeDeviceState('breakfast guests', areBreakfastGuests).then();
        for (const key of occupancyMap.keys()) {
          mqttService.publishAttributes('occupancy ' + key, occupancyMap.get(key)).then();
        }
        mqttService.publishAttributes('occupancy phone numbers', Object.fromEntries(phoneNumberMap)).then();
      }
    }
    messages.push(await buildDiscordMessage(dayDate, checkins, checkouts));
  }
  if (runConfig?.dryRun) {
    logger.info('Dry run: skipping Discord webhook send.');
    for (const message of messages) {
      logger.info(`Discord message: ${JSON.stringify(message)}`);
    }
    return;
  }
  for (const message of messages) {
    const webhook = new Webhook(secrets.scraper.webhook);
    webhook.setContent(message.content);
    webhook.addEmbed(message.embeds);
    await webhook.send();
  }
}

function classifyForDay(responses, dateString, type) {
  return responses.filter(r => {
    if (!r.data || r.data.status === 'canceled') return false;
    const bookings = r.data.bookings ?? [];
    if (type === 'checkin') return bookings.some(b => b.startDate === dateString);
    if (type === 'checkout') return bookings.some(b => b.endDate === dateString);
    if (type === 'stayover') return bookings.some(b => b.startDate < dateString && b.endDate > dateString);
  });
}

function getRoomsForOccupancy(roomName) {
  if (roomName.includes('-')) return roomName.split('-');
  if (roomName.toLowerCase().includes('whole')) return secrets.roomNames;
  return [roomName];
}

function buildOccupancyMap(checkins, stayovers, dateString) {
  const occupancyMap = new Map();
  for (const roomName of secrets.roomNames) {
    occupancyMap.set(roomName, {occupiedTonight: false, checkingInToday: false});
  }
  for (const r of checkins) {
    for (const booking of (r.data.bookings ?? [])) {
      if (booking.startDate === dateString) {
        for (const room of getRoomsForOccupancy(cleanRoom(booking.room?.name ?? ''))) {
          if (occupancyMap.has(room)) {
            occupancyMap.get(room).occupiedTonight = true;
            occupancyMap.get(room).checkingInToday = true;
          }
        }
      }
    }
  }
  for (const r of stayovers) {
    for (const booking of (r.data.bookings ?? [])) {
      if (booking.startDate < dateString && booking.endDate > dateString) {
        for (const room of getRoomsForOccupancy(cleanRoom(booking.room?.name ?? ''))) {
          if (occupancyMap.has(room)) {
            occupancyMap.get(room).occupiedTonight = true;
          }
        }
      }
    }
  }
  return occupancyMap;
}

function buildPhoneNumberMap(checkins, stayovers) {
  const phoneNumberMap = new Map();
  for (const r of [...checkins, ...stayovers]) {
    const customer = r.data.customer;
    const phones = [customer.phone, customer.cellPhone, customer.workPhone].filter(Boolean).map(cleanPhone);
    for (const booking of (r.data.bookings ?? [])) {
      const roomNumber = secrets.roomNumberMap[cleanRoom(booking.room?.name ?? '')];
      if (roomNumber) phoneNumberMap.set(roomNumber, phones);
    }
  }
  return phoneNumberMap;
}

async function buildDiscordMessage(day, checkins, checkouts) {
  const message = {
    content: `__**${day.toLocaleString('en', {weekday: 'long'})}**__`,
    embeds: []
  };
  if (checkins.length === 0) {
    message.embeds.push(new EmbedBuilder().setDescription(':inbox_tray: :x:').setColor(getNextEmbedColor()));
  } else {
    for (const r of checkins) {
      const data = r.data;
      const customer = data.customer;
      const booking = data.bookings?.[0];
      const room = cleanRoom(booking?.room?.name ?? '');
      const nights = booking
          ? Math.round((new Date(booking.endDate) - new Date(booking.startDate)) / 86400000)
          : '?';
      const phones = [customer.phone, customer.cellPhone, customer.workPhone]
          .filter(Boolean).map(cleanPhone).join(', ');
      let previousStays = 'First time guest';
      try {
        const history = await guestDatabase.getGuestHistory(customer.id);
        if (history.previousStayCount > 0) {
          const last = history.lastStay;
          previousStays = `${history.previousStayCount} previous stays, last on ${last.checkIn}-${last.checkOut} in ${last.rooms.map(cleanRoom).join(', ')}`;
        }
      } catch (e) {
        logger.error(`Failed to get guest history for customer ${customer.id}: ${e}`);
      }
      const embed = new EmbedBuilder()
          .setDescription(`:inbox_tray: ${customer.fullName} :inbox_tray:`)
          .setFooter({text: previousStays})
          .addField({name: 'Room', value: room, inline: true})
          .addField({name: 'Nights', value: String(nights), inline: true})
          .setColor(getNextEmbedColor());
      if (data.additionalGuestNames) embed.addField({name: 'Additional Guest Names', value: data.additionalGuestNames, inline: false});
      if (data.arrivalTime) embed.addField({name: 'Arrival Time', value: data.arrivalTime, inline: false});
      if (data.dietaryRestrictions) embed.addField({name: 'Dietary Restrictions', value: data.dietaryRestrictions, inline: false});
      if (data.specialAccommodations) embed.addField({name: 'Special Accommodations', value: data.specialAccommodations, inline: false});
      const getAttr = name => data.attributeValues?.find(a => a.attribute.variableName === name)?.value || null;
      const housekeepingNotes = getAttr('housekeeping_notes');
      const reasonForStay = getAttr('reason_for_stay');
      if (housekeepingNotes) embed.addField({name: 'Housekeeping Notes', value: housekeepingNotes, inline: false});
      if (reasonForStay) embed.addField({name: 'Reason for Stay', value: reasonForStay, inline: false});
      if (customer.notes) embed.addField({name: 'Customer Notes', value: customer.notes, inline: false});
      if (phones) embed.addField({name: 'Phone', value: phones, inline: false});
      message.embeds.push(embed);
    }
  }
  if (checkouts.length === 0) {
    message.embeds.push(new EmbedBuilder().setDescription(':outbox_tray: :x:').setColor(getNextEmbedColor()));
  } else {
    for (const r of checkouts) {
      const customer = r.data.customer;
      const room = cleanRoom(r.data.bookings?.[0]?.room?.name ?? '');
      message.embeds.push(new EmbedBuilder()
          .setDescription(`:outbox_tray: ${customer.fullName} :outbox_tray:`)
          .addField({name: 'Room', value: room, inline: true})
          .setColor(getNextEmbedColor()));
    }
  }
  return message;
}

async function goToSearchPage(page) {
  try {
    await page.goto(secrets.searchUrl, {waitUntil: 'networkidle0'});
    await page.waitForSelector('input[name="term"]');
  } catch (e) {
    await page.screenshot({path: 'screenshots/error_search_page_naviation.png'});
    throw 'Error navigating to search page';
  }
}

function getNextEmbedColor() {
  if (embedIndex >= embedColors.length) {
    embedIndex = 0;
  }
  return embedColors[embedIndex++];
}

function cleanPhone(phone) {
  return phone.replace(/\D/g, '');
}

function cleanRoom(room) {
  const split = room.split(' ');
  return split[0];
}

async function isElementChecked(page, element) {
  if (element) {
    return await page.evaluate(element => element.checked, element);
  } else {
    return false;
  }
}

function getScrapeDate(runConfig) {
  const date = new Date();
  if (runConfig?.dateAdjust) {
    logger.info(`Adjusting date:${date} by:${runConfig.dateAdjust}`);
    date.setDate(date.getDate() + Number(runConfig.dateAdjust));
    logger.info('New date is ' + date);
  }
  return date;
}

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

export {
  initialize,
  runScraper,
  cleanPhone,
  cleanRoom,
  getDateString
}
