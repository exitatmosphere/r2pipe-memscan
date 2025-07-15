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

  if (NUMBER_PROPS[numberType].limits === null) {
    return number;
  }

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

  const numberUint = Number(`0x${hexStr}`);

  const dv = new DataView(new ArrayBuffer(numberProps.bytes));
  dv.setUint32(0, numberUint);

  switch (numberType) {
    case NUMBER_TYPES.UINT: {
      return numberUint;
    }
    case NUMBER_TYPES.INT: {
      return dv.getInt32(0);
    }
    default: {
      return dv.getFloat32(0);
    }
  }
}

export function hexStrFromNumber(number: number, numberType: NUMBER_TYPES) {
  const numberProps = NUMBER_PROPS[numberType];

  if (validateNumber(`${number}`, numberType) === null) {
    return null;
  }

  const hexNumsInByte = 2;

  const getHex = (i: number) =>
    ("0".repeat(hexNumsInByte) + i.toString(16)).slice(-hexNumsInByte);

  const dv = new DataView(new ArrayBuffer(numberProps.bytes));

  switch (numberType) {
    case NUMBER_TYPES.UINT: {
      dv.setUint32(0, number);
      break;
    }
    case NUMBER_TYPES.INT: {
      dv.setInt32(0, number);
      break;
    }
    default: {
      dv.setFloat32(0, number);
    }
  }

  const result = new Array(numberProps.bytes)
    .fill("")
    .map((_, i) => getHex(dv.getUint8(i)))
    .join("");

  return result;
}
