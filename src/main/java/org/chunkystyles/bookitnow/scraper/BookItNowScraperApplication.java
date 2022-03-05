package org.chunkystyles.bookitnow.scraper;

import org.chunkystyles.bookitnow.scraper.service.ScraperService;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.ConfigurableApplicationContext;

@SpringBootApplication(exclude={DataSourceAutoConfiguration.class})
public class BookItNowScraperApplication {

	public static void main(String[] args) {
		ConfigurableApplicationContext run = SpringApplication.run(BookItNowScraperApplication.class, args);
		Object scraperService = run.getBean("scraperService");
		if (scraperService instanceof ScraperService){
			((ScraperService) scraperService).runScraper();
		}
	}

}
