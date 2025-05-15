import { MAX_UINT32 } from "./constants";

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

export function validateUint32(numberAsStr: string) {
  const number = Number(numberAsStr);

  if (Number.isNaN(number) || number < 0 || number > MAX_UINT32) {
    return -1;
  } else {
    return number;
  }
}
