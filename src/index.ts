import fs from "fs";
import readline from "readline";
import { R2Pipe } from "r2pipe-promise";
import {
  changeEndianness,
  hexStrFromNumber,
  numberFromHexStr,
  sleep,
  validateNumber,
} from "./utils";
import {
  NUMBER_PROPS,
  question,
  SIGTERM,
  initProcWaitTimeSec,
  R2_DUMP_FILE,
  SU_FILE,
  LOCAL_FOLDER,
  SU_CHANGE,
  SU_PREV_FILE,
  SU_TEMP_FILE,
  MAX_LINES_BEFORE_WRITE,
  NUMBER_TYPES,
} from "./constants";

let searchFoundAddresses: string[] = [];

async function onFullQuit(r2: R2Pipe) {
  console.log("Cleaning up temporary files");
  fs.rmSync(LOCAL_FOLDER, { recursive: true, force: true });

  console.log("Terminating process");
  await r2.cmd(`:dk ${SIGTERM}`);
}

function getTypeValues() {
  Object.values(NUMBER_TYPES).forEach((type) => {
    console.log(type);
  });
}

async function processSearchForValue(
  r2: R2Pipe,
  value: string,
  usePrev: boolean,
  numberType: NUMBER_TYPES
) {
  if (usePrev && searchFoundAddresses.length == 0) {
    console.log("No previous found values to filter");
    return;
  }

  const valueToSearchFor = validateNumber(value, numberType);

  if (valueToSearchFor === null) {
    console.log("Incorrect number to search for");
  } else {
    const valueToSearchForAsHexStr = hexStrFromNumber(
      valueToSearchFor,
      numberType
    );
    const valueToSearchForFormatted = changeEndianness(
      valueToSearchForAsHexStr!
    );
    console.log(
      `Searching for value: ${valueToSearchFor} (formatted as ${valueToSearchForFormatted})`
    );

    const searchRes = await r2.cmd(
      `:/v${NUMBER_PROPS[numberType].bytes} ${valueToSearchForFormatted}`
    );
    const searchResLines = searchRes.split("\n");
    const searchFoundAddressesLocal: string[] = [];
    for (const searchResLine of searchResLines) {
      if (searchResLine.startsWith("0x")) {
        searchFoundAddressesLocal.push(searchResLine.split(" ", 1)[0]);
      }
    }

    if (!usePrev) {
      searchFoundAddresses = searchFoundAddressesLocal;
    } else {
      searchFoundAddresses = searchFoundAddresses.filter((addr) =>
        searchFoundAddressesLocal.includes(addr)
      );
    }

    console.log("Found addresses with value:");
    console.log("-------------------");
    searchFoundAddresses.forEach((addr) => console.log(addr));
    console.log("-------------------");
  }
}

async function processSearchForUnknownValue(
  r2: R2Pipe,
  numberType: NUMBER_TYPES,
  changeFromPrev?: SU_CHANGE
) {
  const numberProps = NUMBER_PROPS[numberType];
  const addrRange = await getAddrRange(r2, false);

  if (changeFromPrev) {
    if (!fs.existsSync(SU_FILE)) {
      console.log("No previous found values to filter");
      return;
    } else {
      fs.renameSync(SU_FILE, SU_PREV_FILE);
      console.log(`Copied previous values to file '${SU_PREV_FILE}'`);
    }
  }

  if (!fs.existsSync(LOCAL_FOLDER)) {
    fs.mkdirSync(LOCAL_FOLDER);
  }

  const amountBytes = (BigInt(addrRange[1]) - BigInt(addrRange[0])).toString();

  await r2.cmd(`s ${addrRange[0]}`);
  await r2.cmd(`wtf ${R2_DUMP_FILE} ${amountBytes}`);

  const readStream = fs.createReadStream(R2_DUMP_FILE);
  fs.writeFileSync(SU_FILE, "");

  let addrStart = BigInt(addrRange[0]);

  for await (const chunk of readStream) {
    const chunkSize = (chunk as Buffer).length;
    let chunkToWrite = "";

    for (let offset = 0; offset < chunkSize; offset += numberProps.bytes) {
      const addr = addrStart + BigInt(offset);
      const value = numberFromHexStr(
        changeEndianness(
          (chunk as Buffer)
            .subarray(offset, offset + numberProps.bytes)
            .toString("hex")
        ),
        numberType
      );
      chunkToWrite += `0x${addr.toString(16)} ${value}\n`;
    }

    fs.appendFileSync(SU_FILE, chunkToWrite, "utf-8");
    addrStart += BigInt(chunkSize);
  }

  console.log(`Saved all current values to file '${SU_FILE}'`);

  if (changeFromPrev) {
    fs.writeFileSync(SU_TEMP_FILE, "");
    console.log(`Using ${SU_TEMP_FILE} to temporarily store filtered values`);

    const prevValuesStream = fs.createReadStream(SU_PREV_FILE);
    const currentValuesStream = fs.createReadStream(SU_FILE);

    const prevValuesRl = readline.createInterface({
      input: prevValuesStream,
      crlfDelay: Infinity,
    });
    const currentValuesRl = readline.createInterface({
      input: currentValuesStream,
      crlfDelay: Infinity,
    });

    const prevValuesIterator = prevValuesRl[Symbol.asyncIterator]();
    const currentValuesIterator = currentValuesRl[Symbol.asyncIterator]();

    let newContents = "";
    let lineAmount = 0;

    while (true) {
      const prevValuesIteratorNext = await prevValuesIterator.next();

      if (prevValuesIteratorNext.done) {
        fs.appendFileSync(SU_TEMP_FILE, newContents, "utf-8");
        break;
      }

      const prevLine = prevValuesIteratorNext.value;
      const prevLineAsArray = prevLine.split(" ", 2);

      while (true) {
        const currentValuesIteratorNext = await currentValuesIterator.next();

        if (currentValuesIteratorNext.done) {
          console.log("Current values ended before previous values");
          break;
        }

        const currentLine = currentValuesIteratorNext.value;
        const currentLineAsArray = currentLine.split(" ", 2);

        if (currentLineAsArray[0] === prevLineAsArray[0]) {
          const prevValue = Number(prevLineAsArray[1]);
          const currentValue = Number(currentLineAsArray[1]);

          if (
            (changeFromPrev === SU_CHANGE.GT && currentValue > prevValue) ||
            (changeFromPrev === SU_CHANGE.LS && currentValue < prevValue) ||
            (changeFromPrev === SU_CHANGE.EQ && currentValue === prevValue) ||
            (changeFromPrev === SU_CHANGE.NEQ && currentValue !== prevValue)
          ) {
            newContents += `${currentLine}\n`;
            lineAmount++;
          }

          break;
        }
      }

      if (lineAmount >= MAX_LINES_BEFORE_WRITE) {
        fs.appendFileSync(SU_TEMP_FILE, newContents, "utf-8");
        newContents = "";
        lineAmount = 0;
      }
    }

    fs.rmSync(SU_PREV_FILE);
    fs.rmSync(SU_FILE);
    fs.renameSync(SU_TEMP_FILE, SU_FILE);
    console.log(`Copied filtered values to ${SU_FILE}`);
  }
}

async function processReadValue(
  r2: R2Pipe,
  addr: string,
  numberType: NUMBER_TYPES
) {
  const numberProps = NUMBER_PROPS[numberType];

  await r2.cmd(`y ${numberProps.bytes} ${addr}`);

  const yankedData = await r2.cmd("y");
  const yankedValue = yankedData.split(" ", 3)[2].replace("\n", "");

  const yankedValueFormatted = numberFromHexStr(
    changeEndianness(yankedValue),
    numberType
  );
  console.log(`${yankedValueFormatted}`);
}

async function processWriteValue(
  r2: R2Pipe,
  addr: string,
  value: string,
  numberType: NUMBER_TYPES
) {
  const valueToWrite = validateNumber(value, numberType);

  if (valueToWrite === null) {
    console.log("Incorrect number to write");
  } else {
    await r2.cmd(
      `wv${NUMBER_PROPS[numberType].bytes} ${valueToWrite} @ ${addr}`
    );
    console.log(`Wrote value ${valueToWrite} to address ${addr}`);
  }
}

async function getAddrRange(r2: R2Pipe, printMsg: boolean) {
  const start = (await r2.cmd(`:e search.from`)).replace("\n", "");
  const end = (await r2.cmd(`:e search.to`)).replace("\n", "");

  if (printMsg) console.log(`Search address range is ${start}-${end}`);

  return [start, end];
}

async function setAddrRange(r2: R2Pipe, start: string, end: string) {
  await r2.cmd(`:e search.from=${start}`);
  await r2.cmd(`:e search.to=${end}`);
  console.log(`Set search address range as ${start}-${end}`);
}

async function processInput(r2: R2Pipe): Promise<boolean> {
  const input = await question("> ");

  const inputArgs = input.split(" ");

  if (inputArgs[0] === "?") {
    console.log("? - Show this message");
    console.log("q - Detach from process");
    console.log(
      "qq - Detach from process, terminate process and clean temporary files"
    );
    console.log("t? - Show possible value types to use as 'type' args");
    console.log("s [value] [type] - Search for value from scratch");
    console.log(
      "sc [value] [type] - Search for value using previously found addresses"
    );
    console.log("su [type] - Search for unknown value from scratch");
    console.log(
      `su${SU_CHANGE.GT} [type] - Search for unknown value ${SU_CHANGE.GT} than previous`
    );
    console.log(
      `su${SU_CHANGE.LS} [type] - Search for unknown value ${SU_CHANGE.LS} than previous`
    );
    console.log(
      `su${SU_CHANGE.EQ} [type] - Search for unknown value ${SU_CHANGE.EQ} to previous`
    );
    console.log(
      `su${SU_CHANGE.NEQ} [type] - Search for unknown value ${SU_CHANGE.NEQ} to previous`
    );
    console.log("r [addr(0x...)] [type] - Read value from address");
    console.log("w [addr(0x...)] [value] [type] - Write value to address");
    console.log("esr? - Show configured address range to search in");
    console.log(
      "esr= - [startAddr(0x...)] [endAddr(0x...)] - Set address range to search in"
    );
  } else if (inputArgs[0] === "q") {
    return false;
  } else if (inputArgs[0] === "qq") {
    await onFullQuit(r2);
    return false;
  } else if (inputArgs[0] === "t?") {
    getTypeValues();
  } else if (inputArgs[0] === "s" && inputArgs.length === 3) {
    await processSearchForValue(
      r2,
      inputArgs[1],
      false,
      inputArgs[2] as NUMBER_TYPES
    );
  } else if (inputArgs[0] === "sc" && inputArgs.length === 3) {
    await processSearchForValue(
      r2,
      inputArgs[1],
      true,
      inputArgs[2] as NUMBER_TYPES
    );
  } else if (inputArgs[0] === "su" && inputArgs.length === 2) {
    await processSearchForUnknownValue(r2, inputArgs[1] as NUMBER_TYPES);
  } else if (inputArgs[0] === `su${SU_CHANGE.GT}` && inputArgs.length === 2) {
    await processSearchForUnknownValue(
      r2,
      inputArgs[1] as NUMBER_TYPES,
      SU_CHANGE.GT
    );
  } else if (inputArgs[0] === `su${SU_CHANGE.LS}` && inputArgs.length === 2) {
    await processSearchForUnknownValue(
      r2,
      inputArgs[1] as NUMBER_TYPES,
      SU_CHANGE.LS
    );
  } else if (inputArgs[0] === `su${SU_CHANGE.EQ}` && inputArgs.length === 2) {
    await processSearchForUnknownValue(
      r2,
      inputArgs[1] as NUMBER_TYPES,
      SU_CHANGE.EQ
    );
  } else if (inputArgs[0] === `su${SU_CHANGE.NEQ}` && inputArgs.length === 2) {
    await processSearchForUnknownValue(
      r2,
      inputArgs[1] as NUMBER_TYPES,
      SU_CHANGE.NEQ
    );
  } else if (inputArgs[0] === "r" && inputArgs.length === 3) {
    await processReadValue(r2, inputArgs[1], inputArgs[2] as NUMBER_TYPES);
  } else if (inputArgs[0] === "w" && inputArgs.length === 4) {
    await processWriteValue(
      r2,
      inputArgs[1],
      inputArgs[2],
      inputArgs[3] as NUMBER_TYPES
    );
  } else if (inputArgs[0] === "esr?") {
    await getAddrRange(r2, true);
  } else if (inputArgs[0] === "esr=" && inputArgs.length === 3) {
    await setAddrRange(r2, inputArgs[1], inputArgs[2]);
  } else {
    console.log("Unknown command");
  }

  return true;
}

function getAddrRangeFromOs(procPid: string, type: "stack" | "heap") {
  const procMapsFilePath = `/proc/${procPid}/maps`;
  const procMapsFileContent = fs.readFileSync(procMapsFilePath, "utf-8");

  const procMapsFileLines = procMapsFileContent.split("\n");

  let procMapsLine;
  for (const procMapsFileLine of procMapsFileLines) {
    if (procMapsFileLine.includes(`[${type}]`)) {
      procMapsLine = procMapsFileLine;
      break;
    }
  }
  if (!procMapsLine) throw new Error(`${type} was not found`);

  const addrRange = procMapsLine
    .split(" ", 1)[0]
    .split("-", 2)
    .map((addr) => `0x${addr}`);

  return addrRange;
}

async function main() {
  const args = process.argv.slice(2);

  let path: string;
  if (args.length == 1) {
    path = args[0];
  } else if (args.length == 2) {
    path = `attach/${args[0]}`;
  } else {
    throw new Error("Incorrect amount of arguments");
  }

  const r2 = await (R2Pipe.open(
    `frida://${path}`
  ) as unknown as Promise<R2Pipe>);

  // await r2.cmd(`e bin.relocs.apply=true`);
  // console.log("Running analyzer...");
  // await r2.cmd("aaa");

  await r2.cmd("dc");

  console.log(`Waiting for ${initProcWaitTimeSec} sec for process to init...`);
  await sleep(initProcWaitTimeSec * 1000);

  const childPid = (await r2.cmd(":dp")).replace("\n", "");
  console.log(`Process id: ${childPid}`);

  const stackAddrRange = getAddrRangeFromOs(childPid, "stack");
  console.log(`Stack located in: ${stackAddrRange[0]}-${stackAddrRange[1]}`);

  const heapAddrRange = getAddrRangeFromOs(childPid, "heap");
  console.log(`Heap located in: ${heapAddrRange[0]}-${heapAddrRange[1]}`);

  await r2.cmd(`:e search.align=4`);
  await setAddrRange(r2, stackAddrRange[0], stackAddrRange[1]);

  console.log("Opening command prompt, enter '?' to see available commands");
  while (true) {
    if (!(await processInput(r2))) break;
  }

  console.log("Exiting");
  await r2.quit();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
