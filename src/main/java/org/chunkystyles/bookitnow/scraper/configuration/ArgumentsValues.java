package org.chunkystyles.bookitnow.scraper.configuration;

import lombok.Data;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.stereotype.Component;

@Component
@Data
public class ArgumentsValues {
  private String mqttBrokerAddress;
  private String mqttBrokerPort;
  private String cronExpression;
  private String timezone;
  private int numberOfDays;

  public ArgumentsValues(
      ApplicationArguments applicationArguments,
      @Value("${mqtt.broker.address}") String defaultMqttBrokerAddress,
      @Value("${mqtt.broker.port}") String defaultMqttBrokerPort,
      @Value("${scraper.cron.timezone}") String defaultTimezone,
      @Value("${scraper.cron.expression}") String defaultCronExpression,
      @Value("${scraper.numberOfDays}") int defaultNumberOfDays) {
    if (applicationArguments.containsOption("mqttaddress")) {
      this.mqttBrokerAddress =
          applicationArguments.getOptionValues("mqttaddress").stream().findFirst().orElseThrow();
    } else {
      this.mqttBrokerAddress = defaultMqttBrokerAddress;
    }
    if (applicationArguments.containsOption("mqttport")) {
      this.mqttBrokerPort =
          applicationArguments.getOptionValues("mqttport").stream().findFirst().orElseThrow();
    } else {
      this.mqttBrokerPort = defaultMqttBrokerPort;
    }
    if (applicationArguments.containsOption("cronexpression")) {
      this.cronExpression =
              applicationArguments.getOptionValues("cronexpression").stream().findFirst().orElseThrow();
    } else {
      this.cronExpression = defaultCronExpression;
    }
    if (applicationArguments.containsOption("timezone")) {
      this.timezone =
          applicationArguments.getOptionValues("timezone").stream().findFirst().orElseThrow();
    } else {
      this.timezone = defaultTimezone;
    }
    if (applicationArguments.containsOption("numberofdays")) {
      this.numberOfDays =
          Integer.parseInt(
              applicationArguments.getOptionValues("numberofdays").stream()
                  .findFirst()
                  .orElseThrow());
    } else {
      this.numberOfDays = defaultNumberOfDays;
    }
  }
}
