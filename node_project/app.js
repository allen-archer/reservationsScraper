const http = require('http')
const url = require('url')
const cron = require('node-cron')
const { createLogger, format, transports } = require('winston')
const fs = require('fs')
const yaml = require('yaml')
const scraper = require('./scraper')
const frigate = require('./frigate')
const mqttService = require("./mqttService");

let secrets
let config
let logger

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

async function runScraper(){
    logger.info('Starting run')
    let success = false
    let i = 0
    let maxTries = config.maxTries
    while (!success && i < maxTries) {
        try {
            i++
            await scraper.runScraper(config, secrets, logger)
            success = true
        } catch (e){
            logger.error(e, e.stack)
            await delay(10000)
        }
    }
    if (!success){
        logger.error('Failed to run ' + maxTries + ' times')
    }
}

const server = http.createServer((req, res) => {
    const queryObject = url.parse(req.url, true).query
    if (queryObject.confirmationCode){
        secrets.confirmationCode = queryObject.confirmationCode
        runScraper().then()
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        res.end('Running scrape process with confirmation code')
    } else if (queryObject.device) {
        let state = queryObject.state === 'true'
        scraper.changeDeviceState(queryObject.device, state).then()
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        res.end('Sending MQTT message for ' + queryObject.device + ' with sate ' + queryObject.state + '.')
    } else if (queryObject.camera && queryObject.id){
        frigate.sendSnapshot(queryObject.camera, queryObject.id).then()
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        res.end('Sending snapshot for camera = ' + queryObject.camera + ' and id = ' + queryObject.id)
    } else if (queryObject.snooze) {
        mqttService.snooze(queryObject.snooze).then()
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        if (queryObject.snooze) {
            res.end('Frigate snapshots snoozed.')
        } else {
            res.end('Frigate snapshots no longer snoozed.')
        }
    } else {
        res.statusCode = 200
        res.setHeader('Content-Type', 'text/plain')
        res.end('Request params =' + JSON.stringify(queryObject) + ' not recognized.')
    }
})

async function initialize(){
    let configLoadedFromVolume = true
    let configFile
    try {
        configFile = fs.readFileSync('./config/config.yml', 'utf-8')
    } catch (e) {
        configLoadedFromVolume = false
        configFile = fs.readFileSync('./config.yml', 'utf-8')
    }
    config = yaml.parse(configFile)
    try {
        logger = await initializeLogger('./config/app.log')
    } catch (e) {
        logger = await initializeLogger('app.log')
    }
    if (!configLoadedFromVolume) {
        logger.info('config.yml not found in volume.  Using bundled file.')
    }
    let mqttConfigFile
    try {
        mqttConfigFile = fs.readFileSync('./config/mqttConfig.json', 'utf-8')
    } catch (e) {
        logger.info('mqttConfig.json not found in volume.  Using bundled file.')
        mqttConfigFile = fs.readFileSync('./mqttConfig.json', 'utf-8')
    }
    let mqttConfig = JSON.parse(mqttConfigFile)
    let secretsFile
    try {
        secretsFile = fs.readFileSync('./config/secrets.yml', 'utf-8')
    } catch (e){
        logger.info('secrets.yml not found in volume.  Using bundled file.')
        secretsFile = fs.readFileSync('./secrets.yml', 'utf-8')
    }
    secrets = yaml.parse(secretsFile)
    mqttService.initialize(mqttConfig, logger).then()
    scraper.initialize(config, secrets, logger).then()
    frigate.initialize(config, secrets, logger).then()
    server.listen(config.port)
    cron.schedule(config.cronExpression, async () => {
        await runScraper()
    }, {
        scheduled: true,
        timezone: config.timezone
    })
}

async function initializeLogger(path){
    return createLogger({
        format: format.combine(
            format.timestamp({timeZone: config.timezone}),
            format.json(),
            format.prettyPrint()
        ),
        transports: [new transports.File({ filename: path })],
        exceptionHandlers: [new transports.File({ filename: path })],
        rejectionHandlers: [new transports.File({ filename: path })],
    })
}

initialize().then()
