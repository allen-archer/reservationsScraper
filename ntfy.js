import fetch from 'node-fetch';

let config;
let secrets;
let logger;
let ntfyUrl;
let scraperErrorConfig;

async function initialize(_config, _secrets, _logger) {
  config = _config;
  secrets = _secrets;
  logger = _logger;
  ntfyUrl = secrets.ntfy.url;
  scraperErrorConfig = config.ntfy.scraperError;
}

function sendScraperErrorNotification(error) {
  sendNotification(error, scraperErrorConfig.topic, scraperErrorConfig.title, scraperErrorConfig.tags, scraperErrorConfig.priority);
}

function sendNotification(message, topic, title, tags, priority) {
  const options = {
    method: 'POST',
    body: message
  };
  if (title || tags || priority) {
    options.headers = {};
    if (title) {
      options.headers.Title = title;
    }
    if (tags) {
      options.headers.Tags = tags;
    }
    if (priority) {
      options.headers.Priority = priority;
    }
  }
  fetch(ntfyUrl + '/' + topic, options)
      .then()
      .catch(error => console.error('Error:', error));
}

export {sendNotification, sendScraperErrorNotification, initialize};
