import Constants from "expo-constants";

const appVariant = Constants.expoConfig?.extra?.appVariant;
export const IS_PERSONAL_FORK = Constants.expoConfig?.extra?.personalForkBuild === true;
export const APP_BASE_NAME = IS_PERSONAL_FORK ? "AHi" : "T3 Code";

export const T3_CODE_BRAND_MARK_SOURCE = IS_PERSONAL_FORK
  ? require("../../../../assets/personal/icon.png")
  : appVariant === "development"
    ? require("../../../../assets/dev/blueprint-ios-1024.png")
    : appVariant === "preview"
      ? require("../../../../assets/nightly/nightly-ios-1024.png")
      : require("../../../../assets/prod/black-ios-1024.png");
