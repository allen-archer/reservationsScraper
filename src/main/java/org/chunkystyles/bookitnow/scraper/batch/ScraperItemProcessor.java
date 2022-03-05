package org.chunkystyles.bookitnow.scraper.batch;

import org.chunkystyles.bookitnow.scraper.service.ScraperService;
import org.springframework.batch.item.ItemProcessor;

public class ScraperItemProcessor implements ItemProcessor<String, String> {
    private final ScraperService scraperService;

    public ScraperItemProcessor(ScraperService scraperService) {
        this.scraperService = scraperService;
    }

    @Override
    public String process(String s) throws Exception {
        scraperService.runScraper();
        return s;
    }

}
