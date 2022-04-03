package org.chunkystyles.bookitnow.scraper.service;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.eclipse.paho.client.mqttv3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
public class MqttService {
  private static final Logger logger = LogManager.getLogger();
  private IMqttClient client;
  private static final String registerTopic = "homeassistant/switch/bookitnow/config";
  private static final String registerMessage = """
          {
            "name": "Guests Today",
            "command_topic": "homeassistant/switch/bookitnow/set",
            "state_topic": "homeassistant/switch/bookitnow/state",
            "state_on": "ON",
            "state_off": "OFF",
            "device": {
              "via_device": "bookitnow",
              "model": "1.0.0",
              "identifiers": "bookitnow",
              "name": "Book-it-now",
              "manufacturer": "Allen Archer"
            },
            "availability": [
              {
                "topic": "homeassistant/switch/bookitnow/available",
                "payload_not_available": "OFFLINE",
                "payload_available": "ONLINE"
              }
            ]
          }
          """;
  private static final String availabilityTopic = "homeassistant/switch/bookitnow/available";
  private static final String stateTopic = "homeassistant/switch/bookitnow/state";

  public MqttService(@Value("${mqtt.broker.address}") String mqttAddress, @Value("${mqtt.broker.port}") String mqttPort) {
    try {
      client = new MqttClient(mqttAddress + ":" + mqttPort, UUID.randomUUID().toString());
      MqttConnectOptions options = new MqttConnectOptions();
      options.setAutomaticReconnect(true);
      options.setCleanSession(true);
      options.setConnectionTimeout(10);
      client.connect(options);
      sendMessage(registerTopic, registerMessage);
      sendMessage(availabilityTopic, "ONLINE");
    } catch (MqttException e) {
      logger.error(e.getMessage(), e);
    }
  }

  public void updateState(boolean guestsToday){
    if (guestsToday){
      sendMessage(stateTopic, "ON");
    } else {
      sendMessage(stateTopic, "OFF");
    }
  }

  public void sendMessage(String topic, String message){
    try {
      client.publish(topic, message.getBytes(StandardCharsets.UTF_8), 0, true);
    } catch (MqttException e) {
      logger.error(e.getMessage(), e);
    }
  }
}
