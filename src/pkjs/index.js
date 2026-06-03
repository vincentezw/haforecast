var Clay = require('@rebble/clay');
var clayConfig = require('./config');
var clay = new Clay(clayConfig, null, {autoHandleEvents: false});

const CACHE_DURATION = 15 * 60 * 1000;

var haUrl, haToken, haEntity;
var LIMIT = 8;
var cache = {
  hourly: { data: null, updated: 0 },
  daily: { data: null, updated: 0 },
  sun: { data: null, updated: 0 }
};

function loadSettings() {
  haUrl = localStorage.getItem("HA_URL");
  haToken = localStorage.getItem("HA_TOKEN");
  haEntity = localStorage.getItem("HA_ENTITY");
}

Pebble.addEventListener('showConfiguration', function(e) {
  Pebble.openURL(clay.generateUrl());
});

Pebble.addEventListener('webviewclosed', function(e) {
  if (!e || !e.response) return;

  const decoded = decodeURIComponent(e.response);
  const dict = JSON.parse(decoded);

  haUrl = (dict.HAUrl && dict.HAUrl.value) || "";
  haToken = (dict.HAToken && dict.HAToken.value) || "";
  haEntity = (dict.HAEntity && dict.HAEntity.value) || "";

  localStorage.setItem("HA_URL", haUrl);
  localStorage.setItem("HA_TOKEN", haToken);
  localStorage.setItem("HA_ENTITY", haEntity);

  loadSettings();
});

function sendError(message) {
  Pebble.sendAppMessage({
    'COMMAND': 9,
    'DATA': message,
  });
}

Pebble.addEventListener('ready', function (_e) {
  loadSettings();

  if (!haUrl || !haToken || !haEntity) {
    console.log("Missing HA configuration, cannot fetch weather");
    sendError("Not configured\nPlease set up the watchapp\nin the Pebble app on your phone.");
    return;
  }

  getWeather(haUrl, haToken, haEntity, "hourly", 0);
});

function normalizeCondition(c) {
  const map = {
    "clear-night": 0,
    "cloudy": 1,
    "fog": 2,
    "hail": 3,
    "lightning-rainy": 4,
    "lightning": 5,
    "partlycloudy-night": 6,
    "partlycloudy": 7,
    "pouring": 8,
    "rainy": 9,
    "snowy-rainy": 10,
    "snowy": 11,
    "sunny": 12,
    "windy-variant": 13,
    "windy": 13
  };
  return map[c];
}

function getWeather(url, token, entity, type, page) {
  var now = Date.now();
  var entry = cache[type];

  // Check if this specific type is cached and fresh
  if (entry && entry.data && (now - entry.updated < CACHE_DURATION)) {
    sendParsedPage(entry.data, type, page, entity);
    return;
  }

  var baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  var fullUrl = baseUrl + "/api/services/weather/get_forecasts?return_response=true";

  var xhr = new XMLHttpRequest();
  xhr.open("POST", fullUrl, true);
  xhr.setRequestHeader("Authorization", "Bearer " + token);
  xhr.setRequestHeader("Content-Type", "application/json");

  xhr.onload = function() {
    if (xhr.status === 200) {
      try {
        var data = JSON.parse(xhr.responseText);
        var raw = data.service_response[entity] ? data.service_response[entity].forecast : [];
        cache[type] = {
          data: raw,
          updated: Date.now()
        };
        sendParsedPage(raw, type, page, entity);
      } catch (e) {
        sendError("Failed to parse weather data: " + e);
      }
    } else {
      sendError("Failed to fetch weather data\nStatus: " + xhr.status);
    }
  };

  xhr.send(JSON.stringify({ entity_id: entity, type }));
}

function sendParsedPage(raw, type, page, entity) {
  var parsed = [];
  const startIndex = page * LIMIT;
  const end = startIndex + LIMIT;
  const total = raw.length;

  for (var i = startIndex; i < raw.length && i < end; i++) {
    var item = raw[i];
    parsed.push(
      new Date(item.datetime).getTime() + "," +
      Math.round(item.temperature) + "," +
      normalizeCondition(item.condition) + "," +
      item.wind_bearing + "," +
      (Number(item.wind_speed) || 0).toFixed(1) + "," +
      item.precipitation + "," +
      item.humidity
    );
  }

  if (parsed.length > 0) {
    var flattened = parsed.join("|");
    Pebble.sendAppMessage({
      'COMMAND': type === "hourly" ? 1 : 2,
      'DATA': flattened,
      'PAGE': page,
      'TOTAL': total,
    });
  }
}

function getSunData(url, token) {
  var now = Date.now();
  var entry = cache["sun"];
  if (entry && entry.data && (now - entry.updated < CACHE_DURATION)) {
    Pebble.sendAppMessage({
      'COMMAND': 3,
      'DATA': entry.data,
      'PAGE': 0,
      'TOTAL': 1
    });
    return;
  }

  var baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
  var requestUrl = baseUrl + "/api/states/sun.sun";
  var xhr = new XMLHttpRequest();
  
  xhr.onload = function() {
    if (xhr.status >= 200 && xhr.status < 300) {
      try {
        var data = JSON.parse(xhr.responseText);
        var attr = data.attributes;

        var rise = new Date(attr.next_rising).getTime();
        var set = new Date(attr.next_setting).getTime();
        
        var dayLenMs;
        if (set < rise) {
           // we guess yesterday's sunrise by taking away 24h
           var todayRise = rise - (24 * 60 * 60 * 1000);
           dayLenMs = Math.abs(set - todayRise);
        } else {
           dayLenMs = Math.abs(set - rise);
        }

        var durationHours = Math.floor(dayLenMs / (1000 * 60 * 60));
        var durationMins = Math.floor((dayLenMs / (1000 * 60)) % 60);

        var sunStr = [
          data.state === "above_horizon" ? 1 : 0,
          new Date(attr.next_dawn).getTime(),
          new Date(attr.next_rising).getTime(),
          new Date(attr.next_setting).getTime(),
          new Date(attr.next_dusk).getTime(),
          durationHours + "h " + durationMins + "m"
        ].join(",");

        cache["sun"] = {
          data: sunStr,
          updated: Date.now()
        };

        Pebble.sendAppMessage({
          'COMMAND': 3,
          'DATA': sunStr,
          'PAGE': 0,
          'TOTAL': 1
        });
      } catch (e) { console.error(e); }
    }
  };
  xhr.open("GET", requestUrl, true);
  xhr.setRequestHeader("Authorization", "Bearer " + token);
  xhr.send();
}

Pebble.addEventListener('appmessage', function (e) {
  if (!haUrl || !haToken || !haEntity) {
    console.log("Missing HA configuration, cannot process command");
    return;
  }

  const command = e.payload.COMMAND;
  const page = e.payload.PAGE || 0;

  switch (command) {
    case 1:
      getWeather(haUrl, haToken, haEntity, "hourly", page);
      break;
    case 2:
      getWeather(haUrl, haToken, haEntity, "daily", page);
      break;
    case 3:
      getSunData(haUrl, haToken);
      break;
    default:
      console.log("Unknown command, you muppet!");
  }
});

