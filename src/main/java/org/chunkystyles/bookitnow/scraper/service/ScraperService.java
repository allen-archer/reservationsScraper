package org.chunkystyles.bookitnow.scraper.service;

import club.minnced.discord.webhook.WebhookClient;
import com.gargoylesoftware.htmlunit.WebClient;
import com.gargoylesoftware.htmlunit.html.*;
import org.apache.commons.lang3.StringUtils;
import org.chunkystyles.bookitnow.scraper.configuration.Secrets;
import org.chunkystyles.bookitnow.scraper.model.RoomStay;
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
public class ScraperService {
    private final Secrets secrets;
    private final WebhookClient webhookClient;
    private final Map<String, String> roomNumbersToNamesMap;

    public ScraperService(Secrets secrets, WebhookClient webhookClient) {
        this.secrets = secrets;
        this.webhookClient = webhookClient;
        this.roomNumbersToNamesMap = parseRoomNumbersToNamesString(secrets.getRoomNumbersToNamesString());
    }

    private static Map<String, String> parseRoomNumbersToNamesString(String roomNumbersToNamesString){
        Map<String, String> newMap = new HashMap<>();
        if (!StringUtils.isBlank(roomNumbersToNamesString)){
            if (StringUtils.containsIgnoreCase(roomNumbersToNamesString, "-")) {
                String[] rooms = StringUtils.split(roomNumbersToNamesString, "-");
                for (String room : rooms) {
                    if (StringUtils.containsIgnoreCase(room, "_")) {
                        String[] roomSplit = StringUtils.split(room, "_");
                        try {
                            newMap.put(roomSplit[0], roomSplit[1]);
                        } catch (IndexOutOfBoundsException e){
                            e.printStackTrace();
                        }
                    }
                }
            } else if (StringUtils.containsIgnoreCase(roomNumbersToNamesString, "_")){
                String[] room = StringUtils.split(roomNumbersToNamesString, "_");
                try {
                    newMap.put(room[0], room[1]);
                } catch (IndexOutOfBoundsException e){
                    e.printStackTrace();
                }
            }
        }
        return newMap;
    }

    public void runScraper() {
        try (WebClient webClient = new WebClient()) {
            HtmlPage page1 = webClient.getPage(secrets.getScraperUrl());
            List<HtmlForm> forms = page1.getForms();
            if (CollectionUtils.isEmpty(forms)) {
                System.out.println("No forms");
                return;
            }
            HtmlForm form = forms.get(0);
            HtmlSubmitInput button = form.getInputByName("op");
            HtmlTextInput usernameInput = form.getInputByName("name");
            usernameInput.type(secrets.getUsername());
            HtmlPasswordInput passwordInput = form.getInputByName("pass");
            passwordInput.type(secrets.getPassword());
            HtmlPage page2 = button.click();
            List<Object> byXPath = page2.getByXPath("//div[contains(@class, 'calendar-day')]");
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
                        roomStay.setCheckout(date.plusDays(days));
                        roomStay.setAmount(amount);
                        roomStay.setGuestName(guestName);
                        String roomName = roomNumbersToNamesMap.get(roomNumber);
                        roomStay.setRoomName(roomName == null ? roomNumber : roomName);
                        staysMap.computeIfAbsent(roomNumber, s -> new ArrayList<>());
                        staysMap.get(roomNumber).add(roomStay);
                    }
                }
            }
            LocalDate today = LocalDate.now();
            LocalDate tomorrow = today.plusDays(1);
            LocalDate nextDay = today.plusDays(2);
            List<RoomStay> staysList = new ArrayList<>();
            List<String> checkinToday = new ArrayList<>();
            List<String> checkoutToday = new ArrayList<>();
            List<String> checkinTomorrow = new ArrayList<>();
            List<String> checkoutTomorrow = new ArrayList<>();
            List<String> checkinNextDay = new ArrayList<>();
            List<String> checkoutNextDay = new ArrayList<>();
            for (String key : staysMap.keySet()) {
                staysList.addAll(staysMap.get(key));
            }
            for (RoomStay roomStay : staysList) {
                if (today.isEqual(roomStay.getCheckin())) {
                    checkinToday.add(getCheckinInfo(roomStay));
                } else if (today.isEqual(roomStay.getCheckout())) {
                    checkoutToday.add(getCheckoutInfo(roomStay));
                }
                if (tomorrow.isEqual(roomStay.getCheckin())) {
                    checkinTomorrow.add(getCheckinInfo(roomStay));
                } else if (tomorrow.isEqual(roomStay.getCheckout())) {
                    checkoutTomorrow.add(getCheckoutInfo(roomStay));
                }
                if (nextDay.isEqual(roomStay.getCheckin())) {
                    checkinNextDay.add(getCheckinInfo(roomStay));
                } else if (nextDay.isEqual(roomStay.getCheckout())) {
                    checkoutNextDay.add(getCheckoutInfo(roomStay));
                }
            }
            String finalMessage =
                    "Today:\n" + getCheckins(checkinToday) + "\n" + getCheckouts(checkoutToday)
                            + "\n\n"
                            + "Tomorrow:\n" + getCheckins(checkinTomorrow) + "\n" + getCheckouts(checkoutTomorrow)
                            + "\n\n"
                            + nextDay.getDayOfWeek() + ":\n" + getCheckins(checkinNextDay) + "\n" + getCheckouts(checkoutNextDay);
            webhookClient.send(finalMessage);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static LocalDate getDateFromRoomNightId(String roomNightId){
        Pattern pattern = Pattern.compile(".*?(\\d{4})-(\\d{2})-(\\d{2}).*");
        Matcher matcher = pattern.matcher(roomNightId);
        if (!matcher.find()){
            return null;
        }
        return LocalDate.of(Integer.parseInt(matcher.group(1)),
                Integer.parseInt(matcher.group(2)), Integer.parseInt(matcher.group(3)));
    }

    private static String getRoomNumberFromRoomNightId(String roomNightId){
        Pattern pattern = Pattern.compile(".*?(\\d{4})-(\\d{2})-(\\d{2})_(\\d{3})");
        Matcher matcher = pattern.matcher(roomNightId);
        if (!matcher.find()){
            return "";
        }
        return matcher.group(4);
    }

    private static String getGuestNameFromDivHtml(String html){
        html = StringUtils.replace(html, "\n", "");
        html = StringUtils.replace(html, "\r", "");
        Pattern pattern = Pattern.compile(".*?>(.*)<.*");
        Matcher matcher = pattern.matcher(html);
        if (!matcher.find()){
            return "";
        }
        String raw = matcher.group(1);
        return StringUtils.trim(raw);
    }

    private static String getAmountFromDivHtml(String html){
        html = StringUtils.replace(html, "\n", "");
        html = StringUtils.replace(html, "\r", "");
        Pattern pattern = Pattern.compile(".*?span>(.*)<.*");
        Matcher matcher = pattern.matcher(html);
        if (!matcher.find()){
            return "";
        }
        String raw = matcher.group(1);
        return StringUtils.trim(raw);
    }

    private static String getCheckinInfo(RoomStay roomStay){
        return "    " + roomStay.getGuestName() +
                "\n      Room:  " +
                roomStay.getRoomName() +
                "\n      Nights:  " +
                roomStay.getNights();
    }

    private static String getCheckoutInfo(RoomStay roomStay){
        return "    " + roomStay.getGuestName() +
                "\n      Room:  " +
                roomStay.getRoomName() +
                "\n      Amount due:  " +
                roomStay.getAmount();
    }

    private static String getCheckouts(List<String> checkouts){
        return CollectionUtils.isEmpty(checkouts) ? "  Checkouts:  NONE" : "  Checkouts:\n" + String.join("\n", checkouts);
    }

    private static String getCheckins(List<String> checkins){
        return CollectionUtils.isEmpty(checkins) ? "  Checkins:  NONE" : "  Checkins:\n" + String.join("\n", checkins);
    }
}
