import fetch from 'node-fetch';

let config;
let secrets;
let logger;
let ntfyUrl;
let frigateUrl;

async function initializeNtfy(_config, _secrets, _logger){
    config = _config;
    secrets = _secrets;
    logger = _logger;
    ntfyUrl = secrets.ntfy.url;
    frigateUrl = secrets.frigate.url;
}

function sendNotification(message, topic) {
    const options = {
        method: 'POST',
        body: message
    };
    fetch(ntfyUrl + '/' + topic, options)
        .then()
        .catch(error => console.error('Error:', error));
}

function sendFrigateNotification(camera, label, id) {
    const options = {
        method: 'POST',
        headers: {
            'Title': `${capitalizeFirstLetter(label)} detected`,
            'Attach': `${frigateUrl}/api/events/${id}/snapshot.jpg?bbox=1&timestamp=1&crop=1&h=480&quality=90`,
            'Click': `${frigateUrl}/api/events/${id}/clip.mp4`
        },
        body: `by ${capitalizeFirstLetter(camera)} camera`
    };
    fetch(ntfyUrl + '/frigate', options)
        .then()
        .catch(error => console.error('Error:', error));
}

function capitalizeFirstLetter(string){
    return string.charAt(0).toUpperCase() + string.slice(1);
}

export { sendNotification, sendFrigateNotification, initializeNtfy };