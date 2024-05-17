import mqtt from 'mqtt';

let mqttConfig;
let config;
let client;
let logger;
const deviceMap = new Map();

async function publishMessage(topic, message) {
  client.publish(topic, message, {qos: 0, retain: true}, (error) => {
    if (error) {
      logger.error(error);
    }
  });
}

async function changeDeviceState(deviceName, state) {
  let device = deviceMap.get(deviceName);
  if (state === true) {
    await publishMessage(device.registerMessage.state_topic, device.registerMessage.state_on);
  } else {
    await publishMessage(device.registerMessage.state_topic, device.registerMessage.state_off);
  }
}

async function initialize(_mqttConfig, _config, _secrets, _logger) {
  logger = _logger;
  mqttConfig = _mqttConfig;
  config = _config;
  client = mqtt.connect(mqttConfig.address);
  for (let device of await createDeviceList(mqttConfig, _secrets)) {
    deviceMap.set(device.name, device);
    await publishMessage(device.registerTopic, JSON.stringify(device.registerMessage));
    await publishMessage(device.registerMessage.availability.topic, device.registerMessage.availability.payload_available);
  }
}

async function createDeviceList(mqttConfig, secrets) {
  let newDevices = [];
  for (let device of mqttConfig.devices) {
    if (device.name === "occupancy roomname") {
      let deviceStr = JSON.stringify(device);
      for (let roomName of Object.values(secrets.roomNames)) {
        let newDeviceStr = deviceStr.replaceAll('roomname', roomName);
        newDevices.push(JSON.parse(newDeviceStr));
      }
    } else {
      newDevices.push(device);
    }
  }
  return newDevices;
}

async function publishAttributes(deviceName, attributes) {
  const device = deviceMap.get(deviceName);
  await publishMessage(device.registerMessage.json_attributes_topic, JSON.stringify(attributes));
}

export {initialize, changeDeviceState, publishAttributes}
