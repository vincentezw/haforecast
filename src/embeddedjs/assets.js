const colours = Object.freeze({
  white: "#FFFFFF",
  black: "#000000",
});

const weatherSkin = new Skin({
  texture: new Texture(1),
  width: 25,
  height: 25,
  fill: colours.white,
  variants: 25,
});

const windSkin = new Skin({
  texture: new Texture(2),
  width: 20,
  height: 20,
  fill: colours.white,
  variants: 20,
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
    vertical: "middle",
  }),
  boldSmall: new Style({
    color: colours.black,
    font: "bold 14px Gothic",
    // horizontal: "left",
  }),
});

export {
  actionBarSkin,
  colours,
  styles,
  weatherSkin,
  windSkin,
};
