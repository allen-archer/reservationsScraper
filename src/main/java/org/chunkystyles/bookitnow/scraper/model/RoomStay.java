package org.chunkystyles.bookitnow.scraper.model;

import lombok.Data;

import java.time.LocalDate;

@Data
public class RoomStay {
  private int nights;
  private String guestName;
  private LocalDate checkin;
  private LocalDate checkout;
  private String amount;
  private String roomName;
}
