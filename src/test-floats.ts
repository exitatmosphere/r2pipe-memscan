const FLT_DIG = 6;

function binStrFromFloat(float: number) {
  const bytes = 4;
  const binNumsInByte = 8;

  const getBin = (i: number) =>
    ("0".repeat(binNumsInByte) + i.toString(2)).slice(-binNumsInByte);

  const dv = new DataView(new ArrayBuffer(bytes));
  dv.setFloat32(0, float);

  const result = new Array(bytes)
    .fill("")
    .map((_, i) => getBin(dv.getUint8(i)))
    .join("");

  return result;
}

function floatFromBinStr(binStr: string) {
  const bytes = 4;

  const num = Number(`0b${binStr}`);

  const dv = new DataView(new ArrayBuffer(bytes));
  dv.setUint32(0, num);

  return dv.getFloat32(0);
}

console.log(binStrFromFloat(101.1));

console.log(floatFromBinStr(binStrFromFloat(101.1)) /*.toPrecision(FLT_DIG)*/);

// 85.125
// 0 10000101 01010100100000000000000

// 0.125
// 0 01111100 00000000000000000000000

// 0.1
// 0 01111011 10011001100110011001101
