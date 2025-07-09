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
  const number = BigInt(numberAsStr);

  if (
    number < NUMBER_PROPS[numberType].limits[0] ||
    number > NUMBER_PROPS[numberType].limits[1]
  ) {
    return null;
  } else {
    return number;
  }
}

export function numberFromHexStr(hexStr: string, numberType: NUMBER_TYPES) {
  const numberProps = NUMBER_PROPS[numberType];

  if (hexStr.length != numberProps.bytes * 2) {
    return null;
  }

  const numberUnsigned = BigInt(`0x${hexStr}`);

  if (numberProps.limits[0] < 0 && numberUnsigned > numberProps.limits[1]) {
    const numberSigned =
      numberProps.limits[0] + numberUnsigned - numberProps.limits[1] - 1n;
    return numberSigned;
  } else {
    return numberUnsigned;
  }
}

export function hexStrFromNumber(number: bigint, numberType: NUMBER_TYPES) {
  const numberProps = NUMBER_PROPS[numberType];

  if (validateNumber(`${number}`, numberType) === null) {
    return null;
  }

  // unsigned number that corresponds to the same byte representation
  if (number < 0) {
    number = numberProps.limits[1] - numberProps.limits[0] + number + 1n;
  }

  const numberAsHexStr = number.toString(16);
  const numberAsHexStrPadded =
    "0".repeat(numberProps.bytes * 2 - numberAsHexStr.length) + numberAsHexStr;

  return numberAsHexStrPadded;
}
