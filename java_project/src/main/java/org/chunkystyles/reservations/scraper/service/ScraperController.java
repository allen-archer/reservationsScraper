package org.chunkystyles.reservations.scraper.service;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ScraperController {
  private final Logger logger = LogManager.getLogger();
  private final ScraperService scraperService;
  private final MqttService mqttService;

  public ScraperController(ScraperService scraperService, MqttService mqttService) {
    this.scraperService = scraperService;
    this.mqttService = mqttService;
  }

  @GetMapping("/scrape")
  public String scrape(
      @RequestParam(value = "confirmationCode", required = false) String confirmationCode) {
    scraperService.runScraper(confirmationCode);
    return "OK";
  }

  @GetMapping("/testlog")
  public String testLog() {
    logger.info("Testing Log");
    return "OK";
  }

  @GetMapping("/test")
  public String test(){
    return "It works!";
  }

  @GetMapping("/mqtt")
  public String mqtt(@RequestParam String topic, @RequestParam String message){
    mqttService.sendMessage(topic.replaceAll("-", "/"), message);
    return "OK";
  }
}
