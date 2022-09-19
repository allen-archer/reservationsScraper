package org.chunkystyles.reservations.scraper.configuration;

import org.chunkystyles.reservations.scraper.model.MqttDevice;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import java.util.HashMap;
import java.util.Map;

@Configuration
public class MqttDevices {

    @Bean
    @Primary
    public Map<String, MqttDevice> mqttDeviceMap(){
        Map<String, MqttDevice> devices = new HashMap<>();
        String eveningRegisterMessage = """
                {
                  "name": "Evening Guests",
                  "unique_id": "evening_guests_01",
                  "state_topic": "homeassistant/binary_sensor/evening_guests/state",
                  "state_on": "ON",
                  "state_off": "OFF",
                  "device": {
                    "model": "1.0.0",
                    "identifiers": "bookitnow",
                    "name": "Book-it-now",
                    "manufacturer": "Allen Archer",
                    "via_device": "bookitnow"
                  },
                  "availability": [
                    {
                      "topic": "homeassistant/binary_sensor/evening_guests/available",
                      "payload_not_available": "OFFLINE",
                      "payload_available": "ONLINE"
                    }
                  ]
                }
                """;
        String breakfastRegisterMessage = """
                {
                  "name": "Breakfast Guests",
                  "unique_id": "breakfast_guests_01",
                  "state_topic": "homeassistant/binary_sensor/breakfast_guests/state",
                  "state_on": "ON",
                  "state_off": "OFF",
                  "device": {
                    "model": "1.0.0",
                    "identifiers": "bookitnow",
                    "name": "Book-it-now",
                    "manufacturer": "Allen Archer",
                    "via_device": "bookitnow"
                  },
                  "availability": [
                    {
                      "topic": "homeassistant/binary_sensor/breakfast_guests/available",
                      "payload_not_available": "OFFLINE",
                      "payload_available": "ONLINE"
                    }
                  ]
                }
                """;
        devices.put("eveningGuests", new MqttDevice("homeassistant/binary_sensor/evening_guests/config",
                eveningRegisterMessage, "homeassistant/binary_sensor/evening_guests/available",
                "homeassistant/binary_sensor/evening_guests/state"));
        devices.put("breakfastGuests", new MqttDevice("homeassistant/binary_sensor/breakfast_guests/config",
                breakfastRegisterMessage, "homeassistant/binary_sensor/breakfast_guests/available",
                "homeassistant/binary_sensor/breakfast_guests/state"));
        return devices;
    }
}
