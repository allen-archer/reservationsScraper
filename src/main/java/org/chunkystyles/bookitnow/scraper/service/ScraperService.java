package org.chunkystyles.bookitnow.scraper.service;

import club.minnced.discord.webhook.WebhookClient;
import com.gargoylesoftware.htmlunit.WebClient;
import com.gargoylesoftware.htmlunit.html.*;
import io.micrometer.core.lang.Nullable;
import org.apache.commons.lang3.StringUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.chunkystyles.bookitnow.scraper.configuration.Secrets;
import org.chunkystyles.bookitnow.scraper.model.RoomStay;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.stereotype.Service;
import org.springframework.util.CollectionUtils;

import java.io.IOException;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@Configuration
public class ScraperService {
  private static final Logger logger = LogManager.getLogger();
  private final Secrets secrets;
  private final WebhookClient webhookClient;
  private final Map<String, String> roomNumbersToNamesMap;
  private final int numberOfDaysToRun;

  public ScraperService(
      Secrets secrets,
      WebhookClient webhookClient,
      @Value("${scraper.numberOfDays}") int numberOfDaysToRun) {
    this.secrets = secrets;
    this.webhookClient = webhookClient;
    this.roomNumbersToNamesMap = parseRoomNumbersToNamesString(secrets.roomNumbersToNamesString());
    this.numberOfDaysToRun = numberOfDaysToRun;
  }

  private static Map<String, String> parseRoomNumbersToNamesString(
      String roomNumbersToNamesString) {
    Map<String, String> newMap = new HashMap<>();
    if (!StringUtils.isBlank(roomNumbersToNamesString)) {
      if (StringUtils.containsIgnoreCase(roomNumbersToNamesString, "-")) {
        String[] rooms = StringUtils.split(roomNumbersToNamesString, "-");
        for (String room : rooms) {
          if (StringUtils.containsIgnoreCase(room, "_")) {
            String[] roomSplit = StringUtils.split(room, "_");
            try {
              newMap.put(roomSplit[0], roomSplit[1]);
            } catch (IndexOutOfBoundsException e) {
              logger.error(e.getMessage(), e);
            }
          }
        }
      } else if (StringUtils.containsIgnoreCase(roomNumbersToNamesString, "_")) {
        String[] room = StringUtils.split(roomNumbersToNamesString, "_");
        try {
          newMap.put(room[0], room[1]);
        } catch (IndexOutOfBoundsException e) {
          logger.error(e.getMessage(), e);
        }
      }
    }
    return newMap;
  }

  private static LocalDate getDateFromRoomNightId(String roomNightId) {
    Pattern pattern = Pattern.compile(".*?(\\d{4})-(\\d{2})-(\\d{2}).*");
    Matcher matcher = pattern.matcher(roomNightId);
    if (!matcher.find()) {
      return null;
    }
    return LocalDate.of(
        Integer.parseInt(matcher.group(1)),
        Integer.parseInt(matcher.group(2)),
        Integer.parseInt(matcher.group(3)));
  }

  private static String getRoomNumberFromRoomNightId(String roomNightId) {
    Pattern pattern = Pattern.compile(".*?(\\d{4})-(\\d{2})-(\\d{2})_(\\d{3})");
    Matcher matcher = pattern.matcher(roomNightId);
    if (!matcher.find()) {
      return "";
    }
    return matcher.group(4);
  }

  private static String getGuestNameFromDivHtml(String html) {
    html = StringUtils.replace(html, "\n", "");
    html = StringUtils.replace(html, "\r", "");
    Pattern pattern = Pattern.compile(".*?>(.*)<.*");
    Matcher matcher = pattern.matcher(html);
    if (!matcher.find()) {
      return "";
    }
    String raw = matcher.group(1);
    return StringUtils.trim(raw);
  }

  private static String getAmountFromDivHtml(String html) {
    html = StringUtils.replace(html, "\n", "");
    html = StringUtils.replace(html, "\r", "");
    Pattern pattern = Pattern.compile(".*?span>(.*)<.*");
    Matcher matcher = pattern.matcher(html);
    if (!matcher.find()) {
      return "";
    }
    String raw = matcher.group(1);
    return StringUtils.trim(raw);
  }

  private static String getCheckinInfo(RoomStay roomStay) {
    return "    "
        + roomStay.getGuestName()
        + "\n      Room:  "
        + roomStay.getRoomName()
        + "\n      Nights:  "
        + roomStay.getNights();
  }

  private static String getCheckoutInfo(RoomStay roomStay) {
    return "    "
        + roomStay.getGuestName()
        + "\n      Room:  "
        + roomStay.getRoomName()
        + "\n      Amount due:  "
        + roomStay.getAmount();
  }

  private static String getCheckouts(List<String> checkouts) {
    return CollectionUtils.isEmpty(checkouts)
        ? "  Checkouts:  NONE"
        : "  Checkouts:\n" + String.join("\n", checkouts);
  }

  private static String getCheckins(List<String> checkins) {
    return CollectionUtils.isEmpty(checkins)
        ? "  Checkins:  NONE"
        : "  Checkins:\n" + String.join("\n", checkins);
  }

  private static boolean isSameStay(RoomStay first, RoomStay second) {
    return first.getCheckout().equals(second.getCheckin())
        && StringUtils.equalsIgnoreCase(first.getGuestName(), second.getGuestName());
  }

  private static RoomStay mergeStay(RoomStay first, RoomStay second) {
    first.setCheckout(second.getCheckout());
    return first;
  }

  private static Map<String, List<RoomStay>> cleanUpStaysAndCombine(
      Map<String, List<RoomStay>> staysMap) {
    Map<String, List<RoomStay>> newMap = new HashMap<>();
    for (String roomNumber : staysMap.keySet()) {
      List<RoomStay> newStays = new ArrayList<>();
      List<RoomStay> stays = staysMap.get(roomNumber);
      for (int i = 0; i < stays.size(); i++) {
        if (i == stays.size() - 1) {
          newStays.add(stays.get(i));
        } else {
          RoomStay thisStay = stays.get(i);
          int j = i + 1;
          int indexOfLastMerged = i;
          while (j < stays.size() && isSameStay(thisStay, stays.get(j))) {
            mergeStay(thisStay, stays.get(j));
            indexOfLastMerged = j;
          }
          if (indexOfLastMerged > i) {
            i = indexOfLastMerged;
          }
          newStays.add(thisStay);
        }
      }
      newMap.put(roomNumber, newStays);
    }
    return newMap;
  }

  public void runScraper(@Nullable String confirmationCode) {
    try (WebClient webClient = new WebClient()) {
      HtmlPage page1 = webClient.getPage(secrets.scraperUrl());
      List<HtmlForm> forms = page1.getForms();
      HtmlForm form = forms.get(0);
      HtmlSubmitInput button = form.getInputByName("op");
      HtmlTextInput usernameInput = form.getInputByName("name");
      usernameInput.type(secrets.username());
      HtmlPasswordInput passwordInput = form.getInputByName("pass");
      passwordInput.type(secrets.password());
      HtmlPage page2 = button.click();
      List<Object> byXPath = page2.getByXPath("//div[contains(@class, 'calendar-day')]");
      if (CollectionUtils.isEmpty(byXPath)) {
        if (StringUtils.isBlank(confirmationCode)) {
          logger.error("Confirmation code required.  Stopping run.");
          return;
        }
        HtmlForm confirmationForm = page2.getForms().get(0);
        HtmlInput confirmButton = confirmationForm.getInputsByValue("Confirm").get(0);
        HtmlTextInput newUsernameInput = confirmationForm.getInputByName("name");
        if (StringUtils.isBlank(newUsernameInput.getText())) {
          // The username is already filled on the confirmation page
          // But just in case
          newUsernameInput.type(secrets.username());
        }
        HtmlTextInput confirmationInput = confirmationForm.getInputByName("confirmation_code");
        confirmationInput.type(confirmationCode);
        HtmlPasswordInput newPasswordInput = confirmationForm.getInputByName("new_password");
        newPasswordInput.type(secrets.password());
        HtmlPage page3 = confirmButton.click();
        byXPath = page3.getByXPath("//div[contains(@class, 'calendar-day')]");
      }
      List<HtmlDivision> divs = byXPath.stream().map(r -> (HtmlDivision) r).toList();
      Map<String, List<RoomStay>> staysMap = new HashMap<>();
      // order comes first, then room night
      // room night has date info, order has number of nights
      for (HtmlDivision div : divs) {
        for (DomElement domElement : div.getChildElements()) {
          if (StringUtils.startsWithIgnoreCase(domElement.getId(), "order_")) {
            DomElement sibling = domElement.getNextElementSibling();
            String amount = "";
            String guestName = "";
            for (DomElement child : domElement.getChildElements()) {
              String className = child.getAttribute("class");
              if (StringUtils.containsIgnoreCase(className, "calendar-day-room-line1")) {
                guestName = getGuestNameFromDivHtml(child.asXml());
              } else if (StringUtils.containsIgnoreCase(className, "reservation-line2")) {
                amount = getAmountFromDivHtml(child.asXml());
              }
            }
            int days = Integer.parseInt(domElement.getAttribute("data-days"));
            String roomNumber = getRoomNumberFromRoomNightId(sibling.getId());
            LocalDate date = getDateFromRoomNightId(sibling.getId());
            RoomStay roomStay = new RoomStay();
            roomStay.setNights(days);
            roomStay.setCheckin(date);
            roomStay.setCheckout(date == null ? null : date.plusDays(days));
            roomStay.setAmount(amount);
            roomStay.setGuestName(guestName);
            String roomName = roomNumbersToNamesMap.get(roomNumber);
            roomStay.setRoomName(roomName == null ? roomNumber : roomName);
            staysMap.computeIfAbsent(roomNumber, s -> new ArrayList<>());
            staysMap.get(roomNumber).add(roomStay);
          }
        }
      }
      sendReportMessage(staysMap);
    } catch (IOException e) {
      logger.error(e.getMessage(), e);
    }
  }

  private void sendReportMessage(Map<String, List<RoomStay>> staysMap) {
    if (CollectionUtils.isEmpty(staysMap)) {
      logger.error("There was an error scraping the website.");
      return;
    }
    StringBuilder stringBuilder = new StringBuilder();
    Map<String, List<RoomStay>> newMap = cleanUpStaysAndCombine(staysMap);
    for (int i = 0; i < numberOfDaysToRun; i++) {
      LocalDate thisDay = LocalDate.now().plusDays(i);
      List<String> checkins = new ArrayList<>();
      List<String> checkouts = new ArrayList<>();
      for (String roomNumber : newMap.keySet()) {
        for (RoomStay stay : newMap.get(roomNumber)) {
          if (stay.getCheckin().equals(thisDay)) {
            checkins.add(getCheckinInfo(stay));
          } else if (stay.getCheckout().equals(thisDay)) {
            checkouts.add(getCheckoutInfo(stay));
          }
        }
      }
      if (i > 0) {
        stringBuilder.append("\n\n");
      }
      stringBuilder.append(thisDay.getDayOfWeek()).append(":\n");
      stringBuilder.append(getCheckins(checkins)).append("\n");
      stringBuilder.append(getCheckouts(checkouts));
    }
    String message = stringBuilder.toString();
    logger.info(message);
    webhookClient.send(message);
  }
}
