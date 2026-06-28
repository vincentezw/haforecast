import {} from "piu/MC";
import Message from "pebble/message";
import Button from "pebble/button";

const SCROLL_STEP = 20;

let currentPage = 0;
let totalPages = 0;
let currentCommand = 1; // 1 is "hourly"
let isLoading = true;
let firstLoad = true;
let appMessageWritable = false;
let pendingCommand = null;

const colours = Object.freeze({
  black: "#000000",
  blue: "#7db7fa",
  lightblue: "#cce6ff",
});

const rowSkins = [
  new Skin({ fill: colours.blue }),
  new Skin({ fill: colours.lightblue }),
];

const weatherSkin = new Skin({
  texture: new Texture(1),
  width: 30,
  height: 30,
  fill: colours.white,
  variants: 30,
});

const windSkin = new Skin({
  texture: new Texture(2),
  width: 15,
  height: 15,
  fill: colours.white,
  variants: 15,
});

const actionBarSkin = new Skin({
  texture: new Texture(3),
  width: 17,
  height: 14,
  fill: colours.black,
  variants: 17,
});

const styles = Object.freeze({
  small: new Style({
    color: colours.black,
    font: "14px Gothic",
    horizontal: "left",
    vertical: "top",
  }),
  boldSmall: new Style({
    color: colours.black,
    font: "bold 14px Gothic",
    // horizontal: "left",
  }),
});

const appMessage = new Message({
  keys: ["COMMAND", "DATA", "PAGE", "TOTAL"],
  onReadable() {
    let msg = this.read();
    if (!msg) {
      return;
    }

    currentCommand = msg.get("COMMAND");
    if (currentCommand === 9) {
      const errorMsg = msg.get("DATA");
      const error = new Label(null, {
        top: 80,
        style: styles.small,
        string: "Error: " + errorMsg,
      });
      application.empty();
      application.add(error);
      return;
    }

    const newPage = msg.get("PAGE");
    const movingBackward = (newPage < currentPage);
    currentPage = newPage;
    const total = msg.get("TOTAL");
    if (total !== undefined) {
      totalPages = Math.ceil(total / 8);
    }

    if (currentPage === 0) {
      iconColumn.content(0).visible = false;
    } else {
      iconColumn.content(0).visible = true;
    }

    let data = msg.get("DATA");
    msg = null;
    if (!data) {
      return;
    }

    const rows = data.split("|");
    data = null;
    if (currentCommand === 3) {
      renderSun(rows, movingBackward);
    } else {
      renderForecast(rows, movingBackward);
    }
    updateIconVisibility();
    isLoading = false;
  },
  onWritable() {
    appMessageWritable = true;

    if (pendingCommand) {
      const cmd = pendingCommand;
      pendingCommand = null;
      this.write(new Map([
        ["COMMAND", cmd.command],
        ["PAGE", cmd.page],
      ]));
    }
  },
  onSuspend() {
    appMessageWritable = false;
  },
});

new Button({
  types: ["select", "up", "down"],
  onPush(down, type) {
    if (!down || isLoading) {
      return; 
    }

    switch(type) {
      case "up":
        scrollBy(-SCROLL_STEP);
        break;
      case "down":
        scrollBy(SCROLL_STEP);
        break;
      case "select":
        const maxCommand = 3;
        currentCommand = (currentCommand % maxCommand) + 1;
        if (currentCommand > maxCommand) {
          currentCommand = 1;
        }

        currentPage = 0;
        isLoading = true;
        trySend(currentCommand, currentPage);
        break;
    }
  }
});

const application = new Application(null, {
  contents: [
    new Label(null, {
      top: 120,
      style: styles.small,
      string: "Loading...",
    }),
  ],
  skin: new Skin({ fill: colours.blue }),
  touchCount: 1,
});

const iconColumn = new Column(null, {
  width: 19,
  height: application.height,
  right: 0,
  top: 0,
  contents: [
    new Content(null, { width: 17, height: 14, skin: actionBarSkin, variant: 0, top: 30 }),
    new Content(null, { width: 17, height: 14, skin: actionBarSkin, variant: 1, top: 60 }),
    new Content(null, { width: 17, height: 14, skin: actionBarSkin, variant: 2, top: 60 }),
  ],
  skin: new Skin({ fill: colours.black })
});

const forecastList = new Column(null, { 
  left: 0, right: 9, top: 0 
});

class VerticalScrollerBehavior extends Behavior {
	onTouchBegan(scroller, id, x, y) {
		this.anchor = scroller.scroll.y;
		this.y = y;
		this.waiting = true;
	}
	onTouchMoved(scroller, id, x, y, ticks) {
		let delta = y - this.y;
		if (this.waiting) {
			if (Math.abs(delta) < 8)
				return;
			this.waiting = false;
			scroller.captureTouch(id, x, y, ticks);
		}
		scroller.scrollTo(0, this.anchor - delta);
	}
}

const scroller = new Scroller(null, {
  top: 0, bottom: 0, left: 0, right: 10,
  width: 190,
  height: 220,
  active: true,
  backgroundTouch: true,
  clip: true,
  contents: [forecastList],
  Behavior: VerticalScrollerBehavior,
});

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatTimeLabel(timestamp) {
  const date = new Date(parseInt(timestamp));
  
  if (currentCommand === 2) {
    return DAYS[date.getDay()];
  }

  const hours = date.getHours();
  return `${hours < 10 ? "0" : ""}${hours}:00`;
}

class ForecastRow extends Row {
  constructor(index, item) {
    super(null, {
      contents: [
        new Label(null, { 
          left: 0, width: 30, style: styles.boldSmall, 
          string: formatTimeLabel(item[0]) 
        }),
        new Content(null, {
          left: 3, width: 30, height: 30,
          skin: weatherSkin, variant: parseInt(item[2])
        }),
        new Label(null, { 
          style: styles.small, string: item[1] + "°",
          width: 20,
        }),
        new Content(null, {
          width: 12, height: 12, skin: windSkin,
          left: 3,
          variant: Math.round(item[3] / 45) % 8
        }),
        new Label(null, {
          left: 7, top: 0, right: 0, height: 44, style: styles.small, 
          string: "Wind: " + item[4] + "\nRain: " + item[5] + "\nHumidity: " + item[6] + "%"
        }),
      ],
      left: 0, right: 0,
      skin: rowSkins[index % 2],
    });
  }
}

function renderSun(rows) {
  forecastList.empty();
  // Assume phone sends: "1,dawnTS,riseTS,setTS,duskTS,14h 20m"
  const d = rows[0].split(','); 
  const isDay = d[0] === "1";

  forecastList.add(new Content(null, {
    skin: weatherSkin,
    variant: isDay ? 12 : 0,
  }));

  const f = (t) => {
    var dt = new Date(parseInt(t));
    var m = dt.getMinutes();
    return dt.getHours() + ":" + (m < 10 ? "0" : "") + m;
  };

  let s = "Status: " + (isDay ? "day" : "night") + "\n";
  s = s + "Day length: " + d[5] + "\n\n";

  if (+d[2] > +d[3]) {
    s += "Sunset:  " + f(d[3]) + "\n";
    s += "Dusk: " + f(d[4]) + "\n";
    s += "Dawn: " + f(d[1]) + "\n";
    s += "Sunrise: " + f(d[2]) + "\n";
  } else {
    s += "Sunrise: " + f(d[2]) + "\n";
    s += "Dawn: " + f(d[1]) + "\n";
    s += "Dusk: " + f(d[4]) + "\n";
    s += "Sunset:  " + f(d[3]) + "\n";
  }

  forecastList.add(new Label(null, {
    left: 5, right: 5, top: 10,
    style: styles.small, string: s
  }));

  scroller.scroll = { x: 0, y: 0 };
  totalPages = 1;
  updateIconVisibility();
}

function renderForecast(forecast, scrollToBottom) {
  forecastList.empty();

  for (let i = 0; i < forecast.length; i++) {
    const item = forecast[i].split(",");
    forecastList.add(new ForecastRow(i, item));
  };

  if (scrollToBottom) {
    let maxScroll = Math.max(0, forecastList.height - scroller.height);
    scroller.scroll = { x: 0, y: maxScroll };
  } else {
    scroller.scroll = { x: 0, y: 0 };
  }

  if (firstLoad) {
    firstLoad = false;
    application.empty();
    application.add(iconColumn);
    application.add(scroller);
  }
}

function scrollBy(delta) {
  let maxScroll = forecastList.height - scroller.height;
  if (maxScroll < 0) {
    maxScroll = 0;
  }

  let beforeY = scroller.scroll.y;
  let newY = beforeY + delta;

  if (newY < 0) {
    newY = 0;
  }
  if (newY > maxScroll) {
    newY = maxScroll;
  }

  scroller.scroll = { x: 0, y: newY };

  let afterY = scroller.scroll.y;
  let actualMove = Math.abs(afterY - beforeY);
  let intendedMove = Math.abs(delta);

  if (actualMove < intendedMove) {
    if (delta > 0 && afterY >= maxScroll && currentPage < totalPages - 1) {
      isLoading = true;
      trySend(currentCommand, currentPage + 1);
    }
    
    if (delta < 0 && afterY <= 0 && currentPage > 0) {
      isLoading = true;
      const newPage = Math.max(0, currentPage - 1);
      trySend(currentCommand, newPage);
    }
  }
  updateIconVisibility(); 
}

function trySend(command, page) {
  if (appMessageWritable) {
    appMessage.write(new Map([
      ["COMMAND", command],
      ["PAGE", page],
    ]));
  } else {
    pendingCommand = {command, page};
  }
}

function updateIconVisibility() {
  const maxScroll = Math.max(0, forecastList.height - scroller.height);
  const currentY = scroller.scroll.y;

  const isAtAbsoluteTop = (currentPage === 0 && currentY <= 0);
  iconColumn.content(0).visible = !isAtAbsoluteTop;
  const isNearBottom =
    currentPage >= totalPages - 1 && (maxScroll - currentY) < 9;
  iconColumn.content(2).visible = !isNearBottom;
}

export default application;
