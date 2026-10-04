// Umami before-send filter: keeps automated browsers out of the visit count.
//
// The analytics tag names this function in `data-before-send`, and Umami calls
// it with (type, payload) right before each report. Returning a falsy value
// drops that one report; returning the payload sends it unchanged. Nothing here
// blocks a visitor, changes the page or stores anything: bots read the site
// like anyone else, they are just not counted.
(function () {
  "use strict";

  // Common markers of headless browsers, crawlers and link preview fetchers.
  // Matched case-insensitively against the user agent.
  var BOT_UA =
    /headless|phantomjs|slimerjs|selenium|webdriver|puppeteer|playwright|lighthouse|pagespeed|bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|preview|embedly|vkshare|w3c_validator|curl|wget|python|httpclient|java\//i;

  function isAutomated() {
    var nav = window.navigator || {};

    // Set by WebDriver based automation (Selenium, Playwright, Puppeteer).
    if (nav.webdriver === true) return true;

    // "Cubot" is a phone brand, not a bot; drop it before matching "bot".
    var ua = String(nav.userAgent || "").replace(/cubot/gi, "");
    if (BOT_UA.test(ua)) return true;

    // The default headless window: an exact 800x600 screen together with no
    // language preferences at all. Real browsers always report a language.
    var scr = window.screen || {};
    var languages = nav.languages;
    if (scr.width === 800 && scr.height === 600 && (!languages || languages.length === 0)) {
      return true;
    }

    return false;
  }

  window.umamiBeforeSend = function (type, payload) {
    try {
      return isAutomated() ? false : payload;
    } catch (e) {
      // If the check itself fails, count the visit as before.
      return payload;
    }
  };
})();
