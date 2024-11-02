import express from 'express';

const app = express();
import cron from 'node-cron';
import {createLogger, format, transports} from 'winston';
import fs from 'fs';
import yaml from 'yaml';
import * as scraper from './scraper.js';
import * as mqttService from './mqttService.js';
import * as ntfy from './ntfy.js';

let secrets;
let config;
let logger;

function delay(time) {
  return new Promise(resolve => setTimeout(resolve, time));
}

async function runScraper(runConfig) {
  logger.info('Starting run');
  let success = false;
  let i = 0;
  let maxTries = config.maxTries;
  let error;
  while (!success && i < maxTries) {
    try {
      i++;
      await scraper.runScraper(runConfig);
      success = true;
    } catch (e) {
      logger.error(e);
      error = e;
      if (i < maxTries) {
        await delay(10000);
      }
    }
  }
  if (!success) {
    ntfy.sendScraperErrorNotification(error);
    logger.error('Failed to run ' + maxTries + ' times');
  }
}

async function initialize() {
  let configLoadedFromVolume = true;
  let configFile;
  try {
    configFile = fs.readFileSync('./config/config.yml', 'utf-8');
  } catch (e) {
    configLoadedFromVolume = false;
    configFile = fs.readFileSync('./config.yml', 'utf-8');
  }
  config = yaml.parse(configFile);
  try {
    logger = await initializeLogger('./config/app.log');
  } catch (e) {
    logger = await initializeLogger('app.log');
  }
  if (!configLoadedFromVolume) {
    logger.info('config.yml not found in volume.  Using bundled file.');
  }
  let mqttConfigFile;
  try {
    mqttConfigFile = fs.readFileSync('./config/mqttConfig.json', 'utf-8');
  } catch (e) {
    logger.info('mqttConfig.json not found in volume.  Using bundled file.');
    mqttConfigFile = fs.readFileSync('./mqttConfig.json', 'utf-8');
  }
  let mqttConfig = JSON.parse(mqttConfigFile);
  let secretsFile;
  try {
    secretsFile = fs.readFileSync('./config/secrets.yml', 'utf-8');
  } catch (e) {
    logger.info('secrets.yml not found in volume.  Using bundled file.');
    secretsFile = fs.readFileSync('./secrets.yml', 'utf-8');
  }
  secrets = yaml.parse(secretsFile);
  mqttService.initialize(mqttConfig, config, secrets, logger).then();
  scraper.initialize(config, secrets, logger).then();
  ntfy.initialize(config, secrets, logger).then();
  app.listen(config.port, () => {
    logger.info('server listening on port: ' + config.port);
  });
  cron.schedule(config.cronExpression, async () => {
    const runConfig = {
      doBlackouts: true,
      doScrapeGuestData: true
    }
    await runScraper(runConfig);
  }, {
    scheduled: true,
    timezone: config.timezone
  });
}

async function initializeLogger(path) {
  return createLogger({
    format: format.combine(
        format.timestamp({format: () => new Date().toLocaleString('en-US', {timeZone: config.timezone})}),
        format.json()
    ),
    transports: [new transports.File({filename: path})],
    exceptionHandlers: [new transports.File({filename: path})],
    rejectionHandlers: [new transports.File({filename: path})]
  });
}

app.get('/scrape', (request, response) => {
  const query = request.query;
  const runConfig = {
    doBlackouts: queryParameterDoesNotExistOrIsTrue(query, 'doBlackouts'),
    doScrapeGuestData: queryParameterDoesNotExistOrIsTrue(query, 'doScrapeGuestData'),
    dateAdjust: query.dateAdjust
  }
  response.send('Scrape process started');
  runScraper(runConfig).then(() => {
    logger.info('Manual scrape process finished.');
  });
});

function queryParameterDoesNotExistOrIsTrue(query, parameter) {
    return !query[parameter] || query[parameter] === 'true';
}

initialize().then();
