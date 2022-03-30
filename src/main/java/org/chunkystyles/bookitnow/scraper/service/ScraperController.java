package org.chunkystyles.bookitnow.scraper.service;

import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ScraperController {
  private final Logger logger = LogManager.getLogger();
  private final ScraperService scraperService;

  public ScraperController(ScraperService scraperService) {
    this.scraperService = scraperService;
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
}
