package org.chunkystyles.reservations.scraper.batch;

import org.chunkystyles.reservations.scraper.service.ScraperService;
import org.springframework.batch.item.ItemProcessor;

public class ScraperItemProcessor implements ItemProcessor<String, String> {
  private final ScraperService scraperService;

  public ScraperItemProcessor(ScraperService scraperService) {
    this.scraperService = scraperService;
  }

  @Override
  public String process(String s) throws Exception {
    scraperService.runScraper(null);
    return s;
  }
}
