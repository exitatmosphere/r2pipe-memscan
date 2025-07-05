import { NUMBER_PROPS, NUMBER_TYPES } from "./constants";

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function changeEndianness(hexNum: string) {
  const result = [];
  let len = hexNum.length - 2;

  while (len >= 0) {
    result.push(hexNum.substr(len, 2));
    len -= 2;
  }

  return result.join("");
}

export function validateNumber(numberAsStr: string, numberType: NUMBER_TYPES) {
  const number = Number(numberAsStr);

  if (
    number < NUMBER_PROPS[numberType].limits[0] ||
    number > NUMBER_PROPS[numberType].limits[1]
  ) {
    return NaN;
  } else {
    return number;
  }
}
